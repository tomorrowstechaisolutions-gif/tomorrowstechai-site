import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ACCEPTANCE_CHECKS,
  LIVE_PROPOSAL_STATUSES,
  amountDueAtSignature,
  type ProposalStatus,
} from "./config";
import { storeSignedDocument } from "./snapshot";
import { onProposalAccepted } from "@/lib/tasks/automation";
import type {
  AgreementVersion, FullProposal, Proposal, ProposalEventType,
  ProposalItem, ProposalSection, ProposalSignature,
} from "./types";

/**
 * Everything the PUBLIC proposal link can do.
 *
 * The client is never an authenticated user, so every call here runs on the
 * service role after this module has checked the token — the same posture as
 * the intake wizard in 0015. Nothing in this file trusts a number, a status
 * or an amount that arrived from a browser.
 */

/**
 * 32 random bytes, base64url. Long enough that enumeration is pointless and
 * URL-safe enough to survive being pasted into a phone browser from an email.
 */
export function newProposalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function proposalUrl(token: string): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com"
  ).replace(/\/+$/, "");
  return `${base}/proposal/${token}`;
}

export type LoadFailure = "not_found" | "expired" | "not_available";

/** True when a proposal's own validity date has passed. */
export function isExpired(p: Pick<Proposal, "valid_until" | "status">): boolean {
  if (!p.valid_until) return false;
  if (["signed", "payment_pending", "paid", "converted"].includes(p.status)) return false;
  // valid_until is a date: good through the end of that day, Central.
  return Date.now() > new Date(`${p.valid_until}T23:59:59-06:00`).getTime();
}

async function assemble(
  db: SupabaseClient,
  proposal: Proposal
): Promise<FullProposal> {
  const [items, sections, agreement, signature] = await Promise.all([
    db.from("proposal_items").select("*").eq("proposal_id", proposal.id)
      .order("sort_order", { ascending: true })
      .then((r) => (r.data ?? []) as ProposalItem[]),
    db.from("proposal_sections").select("*").eq("proposal_id", proposal.id)
      .order("sort_order", { ascending: true })
      .then((r) => (r.data ?? []) as ProposalSection[]),
    proposal.agreement_version_id
      ? db.from("agreement_versions").select("*").eq("id", proposal.agreement_version_id)
          .maybeSingle().then((r) => (r.data as AgreementVersion) ?? null)
      : Promise.resolve(null),
    db.from("proposal_signatures").select("*").eq("proposal_id", proposal.id)
      .order("signed_at", { ascending: false }).limit(1)
      .maybeSingle().then((r) => (r.data as ProposalSignature) ?? null),
  ]);

  return { proposal, items, sections, agreement, signature };
}

/**
 * Opens a proposal from its public token.
 *
 * A draft never opens — a link that leaked before it was finished must not
 * show a half-written price. A signed one stays readable forever, because the
 * client should always be able to look at what they agreed to.
 */
export async function getProposalByToken(
  token: string
): Promise<FullProposal | LoadFailure> {
  if (!token || token.length < 20 || token.length > 128) return "not_found";

  const db = supabaseAdmin();
  const { data } = await db
    .from("proposals")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  if (!data) return "not_found";
  const proposal = data as Proposal;

  if (proposal.status === "draft") return "not_available";
  if (["cancelled", "declined"].includes(proposal.status)) return "not_available";
  if (isExpired(proposal)) return "expired";

  return assemble(db, proposal);
}

/** The admin's own view, under RLS, by id. */
export async function getProposalById(
  db: SupabaseClient,
  id: string
): Promise<FullProposal | null> {
  const { data } = await db.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return assemble(db, data as Proposal);
}

export async function logProposalEvent(
  db: SupabaseClient,
  input: {
    proposalId: string;
    type: ProposalEventType;
    body?: string | null;
    actor?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  }
): Promise<void> {
  await db.from("proposal_events").insert({
    proposal_id: input.proposalId,
    event_type: input.type,
    body: input.body ?? null,
    actor: input.actor ?? null,
    metadata: input.metadata ?? {},
    ip_address: input.ip && input.ip !== "unknown" ? input.ip : null,
  });
}

/**
 * Records that the client opened the link.
 *
 * Deliberately cheap and forgiving: a view that fails to record must never
 * stop the page rendering. `sent → viewed` is the only status change it will
 * ever make, so re-reading a signed proposal cannot walk it backwards.
 */
export async function recordProposalView(
  full: FullProposal,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  const db = supabaseAdmin();
  const p = full.proposal;
  const now = new Date().toISOString();

  try {
    await db.from("proposals").update({
      status: p.status === "sent" ? "viewed" : p.status,
      first_viewed_at: p.first_viewed_at ?? now,
      last_viewed_at: now,
      view_count: (p.view_count ?? 0) + 1,
    }).eq("id", p.id);

    // One event per session-ish rather than per refresh: a client reading the
    // agreement three times should not bury the timeline.
    const recent = p.last_viewed_at
      ? Date.now() - new Date(p.last_viewed_at).getTime() < 30 * 60_000
      : false;
    if (!recent) {
      await logProposalEvent(db, {
        proposalId: p.id,
        type: "viewed",
        body: p.first_viewed_at ? "Client opened the proposal again." : "Client opened the proposal for the first time.",
        actor: p.client_email ?? "client",
        metadata: { user_agent: userAgent?.slice(0, 300) ?? null },
        ip,
      });
    }
  } catch {
    // Telemetry, not the point of the page.
  }
}

export type SignInput = {
  token: string;
  signerName: string;
  signerEmail: string;
  signerTitle?: string | null;
  signatureType: "typed" | "drawn";
  signatureText?: string | null;
  signatureData?: string | null;
  confirmations: Record<string, boolean>;
  ip: string | null;
  userAgent: string | null;
};

export type SignResult =
  | { ok: true; proposal: Proposal; signature: ProposalSignature; dueNowCents: number }
  | { ok: false; error: string };

/**
 * Acceptance and signature, in the order that makes each step provable.
 *
 * 1. Re-check the proposal is actually signable. The button being enabled in
 *    a browser is not evidence of anything.
 * 2. Re-check every confirmation. The database refuses an unconfirmed row too.
 * 3. Freeze the document and hash it BEFORE the signature row is written, so
 *    the row can carry the digest of the exact file — signatures are immutable
 *    and cannot be updated with it afterwards.
 * 4. Write the signature, then lock the proposal.
 *
 * Amounts are never read from the request. `dueNowCents` comes from the stored
 * columns, which is what the checkout route then charges.
 */
export async function acceptAndSign(input: SignInput): Promise<SignResult> {
  const db = supabaseAdmin();

  const loaded = await getProposalByToken(input.token);
  if (typeof loaded === "string") {
    return {
      ok: false,
      error:
        loaded === "expired"
          ? "This proposal has expired. Ask us for a fresh copy and we will send one straight over."
          : "That proposal link is no longer valid.",
    };
  }

  const p = loaded.proposal;

  if (p.locked_at || p.signed_at) {
    return { ok: false, error: "This proposal has already been signed." };
  }
  if (!LIVE_PROPOSAL_STATUSES.includes(p.status)) {
    return { ok: false, error: "This proposal is not open for signature." };
  }
  if (!p.agreement_version_id || !loaded.agreement) {
    return { ok: false, error: "This proposal has no agreement attached. Please contact us before signing." };
  }

  const missing = ACCEPTANCE_CHECKS.filter((c) => input.confirmations[c.key] !== true);
  if (missing.length > 0) {
    return { ok: false, error: "Please confirm every statement above before signing." };
  }

  const name = (input.signerName ?? "").trim().slice(0, 200);
  const email = (input.signerEmail ?? "").trim().slice(0, 320).toLowerCase();
  if (name.length < 2) return { ok: false, error: "Please enter your full legal name." };
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const typed = (input.signatureText ?? "").trim().slice(0, 200);
  const drawn = (input.signatureData ?? "").trim();
  if (input.signatureType === "typed" && typed.length < 2) {
    return { ok: false, error: "Please type your name as your signature." };
  }
  if (input.signatureType === "drawn" && !/^data:image\/(png|jpeg);base64,/.test(drawn)) {
    return { ok: false, error: "That signature could not be read. Try typing your name instead." };
  }
  if (input.signatureType === "drawn" && drawn.length > 400_000) {
    return { ok: false, error: "That signature image is too large." };
  }

  // The row is built in full before anything is written, so the frozen
  // document can carry its real id and timestamp.
  const signature: ProposalSignature = {
    id: randomUUID(),
    proposal_id: p.id,
    signer_name: name,
    signer_email: email,
    signer_title: (input.signerTitle ?? "").trim().slice(0, 200) || null,
    signature_type: input.signatureType,
    signature_text: input.signatureType === "typed" ? typed : null,
    signature_data: input.signatureType === "drawn" ? drawn : null,
    accepted_scope: true,
    accepted_pricing: true,
    accepted_ownership: true,
    accepted_agreement: true,
    agreement_version: loaded.agreement.version,
    agreement_version_id: loaded.agreement.id,
    document_hash: null,
    document_path: null,
    ip_address: input.ip && input.ip !== "unknown" ? input.ip : null,
    user_agent: input.userAgent?.slice(0, 500) ?? null,
    signed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  let stored: { path: string; hash: string };
  try {
    stored = await storeSignedDocument(db, loaded, signature);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not store the signed document.",
    };
  }

  const { data: inserted, error: sigError } = await db
    .from("proposal_signatures")
    .insert({ ...signature, document_hash: stored.hash, document_path: stored.path })
    .select("*")
    .single();

  if (sigError || !inserted) {
    return { ok: false, error: `Could not record the signature: ${sigError?.message ?? "unknown"}` };
  }

  const dueNowCents = amountDueAtSignature(p);
  const nextStatus: ProposalStatus = dueNowCents > 0 ? "payment_pending" : "signed";

  const { data: updated, error: updateError } = await db
    .from("proposals")
    .update({
      status: nextStatus,
      accepted_at: p.accepted_at ?? signature.signed_at,
      signed_at: signature.signed_at,
      locked_at: signature.signed_at,
      signed_document_path: stored.path,
      signed_document_hash: stored.hash,
    })
    .eq("id", p.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: `Could not lock the proposal: ${updateError?.message ?? "unknown"}` };
  }

  await logProposalEvent(db, {
    proposalId: p.id,
    type: "accepted",
    body: `Accepted by ${name}${signature.signer_title ? ` (${signature.signer_title})` : ""} — all four confirmations ticked.`,
    actor: email,
    ip: input.ip,
  });
  await logProposalEvent(db, {
    proposalId: p.id,
    type: "signed",
    body: `Signed under agreement version ${signature.agreement_version}. Document digest ${stored.hash.slice(0, 16)}…`,
    actor: email,
    metadata: { agreement_version: signature.agreement_version, document_hash: stored.hash },
    ip: input.ip,
  });

  // The next step, as a real task rather than something to remember.
  // Non-fatal on purpose: the signature is already recorded and locked, and
  // a follow-up task that failed to open must not turn that into an error.
  try {
    await onProposalAccepted(db, {
      proposalId: p.id,
      proposalNumber: p.proposal_number,
      clientName: p.client_business_name,
      owner: p.owner,
      actor: "system",
      paymentDue: dueNowCents > 0,
    });
  } catch {
    // Visible by its absence on the task board, not by failing the signature.
  }

  // Mirror it onto the CRM timeline the rest of the admin already reads.
  if (p.lead_id) {
    await db.from("lead_events").insert({
      lead_id: p.lead_id,
      type: "system",
      body: `Proposal ${p.proposal_number} signed by ${name}.`,
      actor: email,
      meta: { proposal_id: p.id, proposal_number: p.proposal_number, kind: "proposal_signed" },
    }).then(() => undefined, () => undefined);
  }

  return {
    ok: true,
    proposal: updated as Proposal,
    signature: inserted as ProposalSignature,
    dueNowCents,
  };
}

/** The client says no. Recorded rather than left to a phone call nobody logged. */
export async function declineProposal(
  token: string,
  reason: string | null,
  ip: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  const loaded = await getProposalByToken(token);
  if (typeof loaded === "string") return { ok: false, error: "That proposal link is no longer valid." };

  const p = loaded.proposal;
  if (p.locked_at) return { ok: false, error: "This proposal has already been signed." };
  if (!["sent", "viewed", "accepted"].includes(p.status)) {
    return { ok: false, error: "This proposal is not open." };
  }

  const trimmed = (reason ?? "").trim().slice(0, 2000) || null;

  await db.from("proposals").update({
    status: "declined",
    declined_at: new Date().toISOString(),
    decline_reason: trimmed,
  }).eq("id", p.id);

  await logProposalEvent(db, {
    proposalId: p.id,
    type: "declined",
    body: trimmed ? `Declined by the client: ${trimmed}` : "Declined by the client.",
    actor: p.client_email ?? "client",
    ip,
  });

  return { ok: true };
}
