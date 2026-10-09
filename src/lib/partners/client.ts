import "server-only";
import { randomUUID } from "node:crypto";
import type { PartnerConnection } from "./types";

/**
 * A partner's integration API, called server-to-server.
 *
 * The key is read from the environment variable the connection names
 * (`api_key_env`), never from the database. Every write carries an
 * Idempotency-Key, which the partner gateway uses to make retries free.
 */

export class PartnerApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PartnerApiError";
    this.status = status;
    this.code = code;
  }
}

function baseUrl(p: PartnerConnection): string {
  const override = p.partner_key === "romar-press" ? process.env.ROMAR_API_BASE_URL : undefined;
  const base = override || p.api_base_url;
  if (!base) throw new PartnerApiError(`${p.name} has no API address configured.`, 0, "no_base_url");
  return base.replace(/\/+$/, "");
}

export function partnerKeyConfigured(p: PartnerConnection): boolean {
  return Boolean(p.api_key_env && process.env[p.api_key_env]);
}

function key(p: PartnerConnection): string {
  const value = p.api_key_env ? process.env[p.api_key_env] : undefined;
  if (!value) {
    throw new PartnerApiError(
      `${p.name}'s API key is not set. Add ${p.api_key_env ?? "the key"} in Vercel and redeploy.`, 0, "no_key");
  }
  return value;
}

async function call<T>(p: PartnerConnection, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(p)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key(p)}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof PartnerApiError) throw error;
    throw new PartnerApiError(`Could not reach ${p.name}'s API.`, 0, "unreachable");
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok && res.status !== 409) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new PartnerApiError(
      err?.message || `${p.name}'s API answered ${res.status}.`, res.status, err?.code ?? null);
  }
  return { status: res.status, body: body as T };
}

// ── Reads ─────────────────────────────────────────────────────────────

export type RemoteOrder = {
  romar_service_order_id: string;
  order_code?: string | null;
  service?: string | null;
  campaign_type?: string | null;
  scope?: string | null;
  status?: string | null;
  platforms?: string[] | null;
  posts_per_week?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
  renews_on?: string | null;
  romar_author_id?: string | null;
  author_name?: string | null;
  romar_book_id?: string | null;
  book_title?: string | null;
  brief?: string | null;
  /** Optional — present once the partner's feed includes campaign ids. */
  campaigns?: { id: string; name?: string | null; status?: string | null }[] | null;
};

export async function fetchOrders(p: PartnerConnection): Promise<RemoteOrder[]> {
  const { body } = await call<{ data?: RemoteOrder[] }>(p, "/api/v1/marketing/orders?limit=200");
  return Array.isArray(body?.data) ? body.data : [];
}

export type RemoteSettlement = {
  settlement_id: string;
  romar_service_order_id?: string | null;
  description?: string | null;
  currency?: string | null;
  sale_cents: number;
  fee_cents: number;
  share_pct: number;
  partner_share_cents: number;
  sold_at: string;
  status?: "pending" | "paid" | "reversed" | "partially_reversed" | null;
  paid_at?: string | null;
  reversed_cents?: number | null;
};

/**
 * The partner's settlement feed (our share of each sale). Defined in
 * docs/partners/romar-settlements-contract.md. Returns null — not an error —
 * while the partner has not published the endpoint yet.
 */
export async function fetchSettlements(p: PartnerConnection, since: string | null): Promise<RemoteSettlement[] | null> {
  try {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    const { body } = await call<{ data?: RemoteSettlement[] }>(p, `/api/v1/partner/settlements${q}`);
    return Array.isArray(body?.data) ? body.data : [];
  } catch (error) {
    if (error instanceof PartnerApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

// ── Writes ────────────────────────────────────────────────────────────

export type StatusPushResult =
  | { ok: true }
  | { ok: false; conflict: true; theirStatus: string | null; message: string };

export async function pushCampaignStatus(
  p: PartnerConnection,
  campaignId: string,
  status: string,
  observed: string | null,
  note: string | null
): Promise<StatusPushResult> {
  const { status: http, body } = await call<{ romar_status?: string; error?: { message?: string } }>(
    p,
    `/api/v1/marketing/campaigns/${encodeURIComponent(campaignId)}/status`,
    {
      method: "PATCH",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ status, observed_status: observed, note }),
    }
  );
  if (http === 409) {
    return {
      ok: false,
      conflict: true,
      theirStatus: body?.romar_status ?? null,
      message: body?.error?.message ?? "Their status changed since the last sync. Nothing was updated.",
    };
  }
  return { ok: true };
}

export async function raiseTask(
  p: PartnerConnection,
  input: { title: string; description?: string | null }
): Promise<void> {
  await call(p, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ title: input.title, description: input.description ?? null }),
  });
}
