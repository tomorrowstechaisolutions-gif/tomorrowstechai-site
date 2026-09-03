import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTemplate, type RequestTemplate, type RequestStatus } from "./config";
import type { ClientRequest, ClientRequestEvent } from "./types";

/**
 * Everything that happens to a client action request.
 *
 * The client is never an authenticated user, so every read and write on their
 * side runs here under the service role after a route handler has checked the
 * token — the same posture as intake/service.ts, for the same reason.
 *
 * Sending lives in emails.ts. This file decides WHEN something is sent and
 * what the row then says; it does not build any markup.
 */

/**
 * 24 random bytes, base64url. The client's only credential, so it has to be
 * long enough that guessing is pointless and URL-safe enough to survive being
 * pasted into a phone browser out of an email.
 */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function requestUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com").replace(/\/$/, "");
  return `${base}/action/${token}`;
}

export type LoadedRequest = { request: ClientRequest; template: RequestTemplate };
export type LoadFailure = "not_found" | "expired" | "canceled" | "unknown_template";

function hydrate(row: unknown): ClientRequest {
  const r = row as ClientRequest;
  // jsonb comes back as whatever was put in. Everything downstream indexes
  // these, and a null here is a runtime error three files away.
  return {
    ...r,
    steps_done: Array.isArray(r.steps_done) ? r.steps_done : [],
    payload: r.payload && typeof r.payload === "object" ? r.payload : {},
  };
}

async function logEvent(
  requestId: string,
  kind: ClientRequestEvent["kind"],
  detail?: string | null,
  meta: Record<string, unknown> = {}
): Promise<void> {
  // Non-fatal by design. A history row that fails to write must never take
  // down the send, the save or the submit that caused it.
  try {
    await supabaseAdmin()
      .from("client_request_events")
      .insert({ request_id: requestId, kind, detail: detail ?? null, meta });
  } catch (err) {
    console.error("client_request_events insert failed:", err);
  }
}

// ── Reads ────────────────────────────────────────────────────────────

export async function getRequestByToken(token: string): Promise<LoadedRequest | LoadFailure> {
  const { data } = await supabaseAdmin()
    .from("client_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!data) return "not_found";
  const request = hydrate(data);

  const template = getTemplate(request.template_key);
  if (!template) return "unknown_template";

  if (request.status === "canceled") return "canceled";

  // A completed request stays readable after expiry — the client should be
  // able to look at what they sent. Only an unfinished one goes cold.
  if (
    request.status !== "completed" &&
    new Date(request.token_expires_at).getTime() < Date.now()
  ) {
    return "expired";
  }

  return { request, template };
}

export async function getRequestById(id: string): Promise<LoadedRequest | null> {
  const { data } = await supabaseAdmin()
    .from("client_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const request = hydrate(data);
  const template = getTemplate(request.template_key);
  return template ? { request, template } : null;
}

// ── Writes ───────────────────────────────────────────────────────────

export type CreateRequestInput = {
  templateKey: string;
  toEmail: string;
  toName?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  jobId?: string | null;
  proposalId?: string | null;
  note?: string | null;
  dueAt?: string | null;
  expiresInDays?: number;
};

/**
 * Opens a request. Draft until something sends it, so the row and the send
 * are two decisions — which is what makes "look at it first" possible and
 * what stops a failed send leaving no trace.
 */
export async function createRequest(input: CreateRequestInput): Promise<LoadedRequest> {
  const template = getTemplate(input.templateKey);
  if (!template) throw new Error(`No request template called "${input.templateKey}".`);

  const email = (input.toEmail ?? "").trim();
  if (!email) throw new Error("A request needs an email address to go to.");

  const days = input.expiresInDays ?? 60;

  const { data, error } = await supabaseAdmin()
    .from("client_requests")
    .insert({
      customer_id: input.customerId ?? null,
      lead_id: input.leadId ?? null,
      job_id: input.jobId ?? null,
      proposal_id: input.proposalId ?? null,
      template_key: template.key,
      // Snapshot: the template copy will be edited, this row must keep saying
      // what it said the day it went out.
      title: template.title,
      summary: template.pickerHint,
      token: newToken(),
      token_expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
      status: "draft",
      to_email: email,
      to_name: input.toName?.trim() || null,
      note: input.note?.trim() || null,
      due_at: input.dueAt ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not open the request: ${error?.message ?? "unknown"}`);
  }

  const request = hydrate(data);
  await logEvent(request.id, "created", `${template.pickerLabel} for ${email}`);
  return { request, template };
}

/** Marks a request delivered (or not) after emails.ts has tried. */
export async function markSent(request: ClientRequest, delivered: boolean): Promise<ClientRequest> {
  const now = new Date().toISOString();

  const { data } = await supabaseAdmin()
    .from("client_requests")
    .update({
      // A failed send must not look like a client who has not replied yet,
      // so the status only advances when Resend actually took it.
      status: delivered ? "sent" : request.status,
      delivered,
      sent_at: delivered ? now : request.sent_at,
    })
    .eq("id", request.id)
    .select("*")
    .single();

  await logEvent(
    request.id,
    delivered ? "sent" : "send_failed",
    delivered ? `Delivered to ${request.to_email}` : `Resend would not take it`
  );

  return data ? hydrate(data) : request;
}

export async function markReminded(request: ClientRequest): Promise<void> {
  await supabaseAdmin()
    .from("client_requests")
    .update({
      reminder_count: request.reminder_count + 1,
      last_reminded_at: new Date().toISOString(),
    })
    .eq("id", request.id);

  await logEvent(request.id, "reminded", `Nudge ${request.reminder_count + 1}`);
}

/**
 * They loaded the page.
 *
 * `first_opened_at` is written once and never again — it is the answer to
 * "did that email land", and an overwrite would destroy it. The event row is
 * throttled to one an hour so a client refreshing the page does not bury the
 * history under forty identical lines.
 */
export async function markOpened(request: ClientRequest): Promise<ClientRequest> {
  const now = new Date();
  const iso = now.toISOString();

  const firstOpen = !request.first_opened_at;
  const status: RequestStatus =
    request.status === "sent" || request.status === "draft" ? "opened" : request.status;

  const { data } = await supabaseAdmin()
    .from("client_requests")
    .update({
      status,
      first_opened_at: request.first_opened_at ?? iso,
      last_opened_at: iso,
    })
    .eq("id", request.id)
    .select("*")
    .single();

  const quiet =
    request.last_opened_at &&
    now.getTime() - new Date(request.last_opened_at).getTime() < 60 * 60 * 1000;

  if (!quiet) {
    await logEvent(request.id, "opened", firstOpen ? "First open" : "Opened again");
  }

  return data ? hydrate(data) : request;
}

/**
 * Validates what a client sent against the template.
 *
 * The token identifies a client; it does not entitle them to write arbitrary
 * keys into a jsonb column the admin will later render. Unknown keys are
 * dropped, select values must be one of the offered options, and everything
 * is trimmed and capped. Same reasoning as the social_links whitelist in the
 * intake save route.
 */
export function sanitisePayload(
  template: RequestTemplate,
  raw: Record<string, unknown>
): Record<string, string> {
  const clean: Record<string, string> = {};

  for (const field of template.fields) {
    if (!(field.key in raw)) continue;
    const value = typeof raw[field.key] === "string" ? (raw[field.key] as string).trim() : "";
    if (!value) continue;

    if (field.type === "select") {
      if (field.options?.includes(value)) clean[field.key] = value;
      continue;
    }

    clean[field.key] = value.slice(0, field.max ?? 500);
  }

  for (const box of template.confirm) {
    const key = `confirm_${box.key}`;
    if (key in raw) clean[key] = raw[key] === true || raw[key] === "yes" ? "yes" : "";
  }

  return clean;
}

export function sanitiseSteps(template: RequestTemplate, raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(template.steps.map((s) => s.id));
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && known.has(v)))];
}

/** What is still missing. The route handler decides what to do about it. */
export function missingForSubmit(
  template: RequestTemplate,
  payload: Record<string, string>
): string[] {
  const missing: string[] = [];

  for (const field of template.fields) {
    if (field.required && !(payload[field.key] ?? "").trim()) missing.push(field.label);
  }
  for (const box of template.confirm) {
    if (payload[`confirm_${box.key}`] !== "yes") missing.push(box.label);
  }

  return missing;
}

/** A partial save. Merges rather than replaces, so a half-filled form survives. */
export async function saveProgress(
  loaded: LoadedRequest,
  input: { payload?: Record<string, unknown>; steps?: unknown }
): Promise<ClientRequest> {
  const { request, template } = loaded;

  const payload = {
    ...request.payload,
    ...(input.payload ? sanitisePayload(template, input.payload) : {}),
  };
  const steps = input.steps === undefined
    ? request.steps_done
    : sanitiseSteps(template, input.steps);

  const status: RequestStatus =
    request.status === "completed" ? "completed" : "started";

  const { data, error } = await supabaseAdmin()
    .from("client_requests")
    .update({ payload, steps_done: steps, status })
    .eq("id", request.id)
    .select("*")
    .single();

  if (error || !data) throw new Error("Could not save your answers.");

  // One event per save would drown the history — the wizard saves on every
  // step. Only the first transition out of "waiting on them" is worth a row.
  if (request.status !== "started") {
    await logEvent(request.id, "saved", "Client started filling it in");
  }

  return hydrate(data);
}

export async function submitRequest(
  loaded: LoadedRequest,
  input: { payload?: Record<string, unknown>; steps?: unknown }
): Promise<{ request: ClientRequest; missing: string[] }> {
  const { request, template } = loaded;

  const payload = {
    ...request.payload,
    ...(input.payload ? sanitisePayload(template, input.payload) : {}),
  };
  const steps = input.steps === undefined
    ? request.steps_done
    : sanitiseSteps(template, input.steps);

  const missing = missingForSubmit(template, payload);
  if (missing.length) {
    // Still save what they typed. Losing a client's answers because one box
    // was unticked is how a form gets abandoned.
    const saved = await saveProgress(loaded, { payload, steps });
    return { request: saved, missing };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("client_requests")
    .update({ payload, steps_done: steps, status: "completed", completed_at: now })
    .eq("id", request.id)
    .select("*")
    .single();

  if (error || !data) throw new Error("Could not record that as finished.");

  await logEvent(request.id, "submitted", "Client marked it done");
  return { request: hydrate(data), missing: [] };
}

export async function cancelRequest(id: string, reason?: string | null): Promise<void> {
  await supabaseAdmin()
    .from("client_requests")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", id);

  await logEvent(id, "canceled", reason ?? null);
}

/** Extends a link that went cold without minting a new one. */
export async function extendRequest(id: string, days = 60): Promise<void> {
  await supabaseAdmin()
    .from("client_requests")
    .update({ token_expires_at: new Date(Date.now() + days * 86_400_000).toISOString() })
    .eq("id", id);
}

export async function requestEvents(id: string): Promise<ClientRequestEvent[]> {
  const { data } = await supabaseAdmin()
    .from("client_request_events")
    .select("*")
    .eq("request_id", id)
    .order("at", { ascending: false })
    .limit(50);

  return (data ?? []) as ClientRequestEvent[];
}
