"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { currentAgreement } from "@/lib/proposals/agreement";
import {
  DEFAULT_VALID_DAYS,
  canTransition,
  templateByKey,
  type ProposalStatus,
} from "@/lib/proposals/config";
import { computePricing } from "@/lib/proposals/pricing";
import { newProposalToken, proposalUrl, logProposalEvent } from "@/lib/proposals/service";
import { sendProposalEmail } from "@/lib/proposals/emails";
import type { Proposal, ProposalItemType, ProposalSectionType } from "@/lib/proposals/types";
import { DEFAULT_JOB_TASKS, PROMISED_DAYS, dueDateFrom } from "@/lib/jobs/config";
import { createIntake } from "@/lib/intake/service";
import { onProjectCreated } from "@/lib/tasks/automation";

/**
 * Every write the admin can make to a proposal.
 *
 * A `"use server"` file may export nothing but async functions — an exported
 * const is a build error Next only raises at page-data collection, which cost
 * a deploy once. Shared constants live in src/lib/proposals/config.ts, which
 * both this file and the forms import.
 *
 * All of these run on the request-scoped client, so RLS applies and an
 * account that is not in admin_users writes nothing. The service role appears
 * only in the public token path.
 */

const REVALIDATE = ["/admin/proposals", "/admin/pipeline", "/admin/crm", "/admin"];

function touch(id?: string | null) {
  for (const path of REVALIDATE) revalidatePath(path);
  if (id) {
    revalidatePath(`/admin/proposals/${id}`);
    revalidatePath(`/admin/proposals/${id}/edit`);
    revalidatePath(`/admin/proposals/${id}/preview`);
  }
}

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return {
    supabase: await createSupabaseServerClient(),
    actor: session.admin.email,
  };
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function flag(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "1" || value === "true";
}

/** "$1,250.50" → 125050. Anything unparseable is zero, never NaN. */
function cents(raw: string): number {
  const value = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function intOrNull(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isoDateOrNull(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function defaultValidUntil(): string {
  const date = new Date(Date.now() + DEFAULT_VALID_DAYS * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** Copies a row without the columns the destination generates for itself. */
function without<T extends Record<string, unknown>>(row: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!keys.includes(key)) out[key] = value;
  }
  return out;
}

const ITEM_TYPES: ProposalItemType[] = [
  "scope", "deliverable", "page", "integration", "addon",
  "discount", "recurring", "exclusion",
  "client_responsibility", "provider_responsibility",
];

const SECTION_TYPES: ProposalSectionType[] = [
  "executive_summary", "scope", "deliverables", "timeline",
  "pricing", "hosting", "ownership", "client_responsibilities",
  "provider_responsibilities", "exclusions", "agreement", "custom",
];

type ParsedItem = {
  item_type: ProposalItemType;
  title: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  is_billable: boolean;
  is_optional: boolean;
  sort_order: number;
};

/**
 * The builder posts its rows as one JSON field rather than fifty numbered
 * inputs. Everything is re-validated here: a title that is not a string, a
 * type that is not in the vocabulary, or a negative price simply does not
 * survive into the database.
 */
function parseItems(raw: string): ParsedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ParsedItem[] = [];
  for (const entry of parsed.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const title = typeof row.title === "string" ? row.title.trim().slice(0, 300) : "";
    if (!title) continue;

    const type = ITEM_TYPES.includes(row.item_type as ProposalItemType)
      ? (row.item_type as ProposalItemType)
      : "scope";

    const quantityRaw = Number(row.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0
      ? Math.min(9999, Math.round(quantityRaw * 100) / 100)
      : 1;

    const unit = typeof row.unit_price === "string"
      ? cents(row.unit_price)
      : Number.isFinite(Number(row.unit_price_cents))
        ? Math.max(0, Math.round(Number(row.unit_price_cents)))
        : 0;

    out.push({
      item_type: type,
      title,
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description.trim().slice(0, 4000)
          : null,
      quantity,
      unit_price_cents: unit,
      total_price_cents: Math.round(quantity * unit),
      is_billable: row.is_billable === true && unit > 0,
      is_optional: row.is_optional === true,
      sort_order: out.length,
    });
  }
  return out;
}

type ParsedSection = {
  section_type: ProposalSectionType;
  title: string;
  content: string | null;
  is_visible: boolean;
  sort_order: number;
};

function parseSections(raw: string): ParsedSection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ParsedSection[] = [];
  for (const entry of parsed.slice(0, 40)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 200) : "";
    if (!title) continue;
    out.push({
      section_type: SECTION_TYPES.includes(row.section_type as ProposalSectionType)
        ? (row.section_type as ProposalSectionType)
        : "custom",
      title,
      content:
        typeof row.content === "string" && row.content.trim()
          ? row.content.trim().slice(0, 20000)
          : null,
      is_visible: row.is_visible !== false,
      sort_order: out.length,
    });
  }
  return out;
}

/**
 * Reads the commercial fields off the form and recomputes every total.
 *
 * The form shows a running total, but what it shows is never what is saved:
 * the numbers are derived here, from the line items and the typed build
 * price, so a hand-edited hidden field cannot change what a client is asked
 * to pay.
 */
function commercialsFrom(fd: FormData, items: ParsedItem[]) {
  const basePriceCents = cents(str(fd, "one_time_price", 30));
  const recurringCents = cents(str(fd, "recurring_price", 30));
  const depositRaw = cents(str(fd, "deposit_amount", 30));
  const discountCents = cents(str(fd, "discount_amount", 30));

  const paymentModeRaw = str(fd, "payment_mode", 20);
  const payment_mode =
    paymentModeRaw === "full" || paymentModeRaw === "invoice_later"
      ? paymentModeRaw
      : "deposit";

  // A typed discount is treated as one more discount line so there is exactly
  // one code path that knows how a discount reduces a total.
  const withDiscount = discountCents > 0
    ? [
        ...items,
        {
          item_type: "discount" as ProposalItemType,
          title: "Discount",
          description: null,
          quantity: 1,
          unit_price_cents: discountCents,
          total_price_cents: discountCents,
          is_billable: true,
          is_optional: false,
          sort_order: items.length,
        },
      ]
    : items;

  const pricing = computePricing({
    items: withDiscount,
    basePriceCents,
    recurringCents,
    depositCents: depositRaw,
    paymentMode: payment_mode,
  });

  const recurring_interval = str(fd, "recurring_interval", 10) === "year" ? "year" : "month";

  return {
    subtotal_cents: pricing.subtotalCents,
    discount_amount_cents: pricing.discountCents,
    one_time_price_cents: pricing.oneTimeCents,
    total_cents: pricing.totalCents,
    recurring_price_cents: pricing.recurringCents,
    recurring_interval,
    deposit_amount_cents: pricing.depositCents,
    payment_mode,
  };
}

function clientFieldsFrom(fd: FormData) {
  return {
    client_business_name: str(fd, "client_business_name", 200) || null,
    client_contact_name: str(fd, "client_contact_name", 200) || null,
    client_email: str(fd, "client_email", 320).toLowerCase() || null,
    client_phone: str(fd, "client_phone", 40) || null,
    client_title: str(fd, "client_title", 200) || null,
    client_billing_address: str(fd, "client_billing_address", 600) || null,
  };
}

async function replaceChildren(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  proposalId: string,
  items: ParsedItem[],
  sections: ParsedSection[]
) {
  await supabase.from("proposal_items").delete().eq("proposal_id", proposalId);
  if (items.length > 0) {
    await supabase
      .from("proposal_items")
      .insert(items.map((item) => ({ ...item, proposal_id: proposalId })));
  }

  await supabase.from("proposal_sections").delete().eq("proposal_id", proposalId);
  if (sections.length > 0) {
    await supabase
      .from("proposal_sections")
      .insert(sections.map((section) => ({ ...section, proposal_id: proposalId })));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Create, edit, duplicate
// ═══════════════════════════════════════════════════════════════════════

export async function createProposalAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const agreement = await currentAgreement(supabase);
  if (!agreement) {
    throw new Error(
      "No published agreement version. Publish one under Settings → Agreements before writing a proposal."
    );
  }

  const packageKey = str(formData, "package_key", 60) || "custom";
  const template = templateByKey(packageKey);
  const items = parseItems(str(formData, "items_json", 200_000));
  const sections = parseSections(str(formData, "sections_json", 200_000));
  const commercials = commercialsFrom(formData, items);

  const leadId = str(formData, "lead_id", 40) || null;
  const customerId = str(formData, "customer_id", 40) || null;
  const dealId = str(formData, "deal_id", 40) || null;
  let companyId = str(formData, "company_id", 40) || null;

  // Inherit the company from whatever the proposal was attached to, so a
  // proposal written from a lead lands on the same company record the CRM
  // already uses rather than floating unattached.
  if (!companyId && leadId) {
    const { data } = await supabase.from("leads").select("company_id").eq("id", leadId).maybeSingle();
    companyId = (data?.company_id as string | undefined) ?? null;
  }
  if (!companyId && customerId) {
    const { data } = await supabase.from("customers").select("company_id").eq("id", customerId).maybeSingle();
    companyId = (data?.company_id as string | undefined) ?? null;
  }

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      lead_id: leadId,
      customer_id: customerId,
      deal_id: dealId,
      company_id: companyId,
      created_by: actor,
      owner: str(formData, "owner", 200) || actor,
      status: "draft",
      title: str(formData, "title", 200) || template.defaultTitle,
      summary: str(formData, "summary", 6000) || null,
      package_key: packageKey,
      package_name: str(formData, "package_name", 200) || template.name,
      ...clientFieldsFrom(formData),
      ...commercials,
      turnaround_note: str(formData, "turnaround_note", 500) || null,
      revision_limit: intOrNull(str(formData, "revision_limit", 5)),
      hosting_note: str(formData, "hosting_note", 2000) || template.hostingNote,
      valid_until: isoDateOrNull(str(formData, "valid_until", 20)) ?? defaultValidUntil(),
      public_token: newProposalToken(),
      agreement_version_id: agreement.id,
      notes_internal: str(formData, "notes_internal", 6000) || null,
    })
    .select("id, proposal_number")
    .single();

  if (error || !data) {
    throw new Error(`Could not create the proposal: ${error?.message ?? "unknown"}`);
  }

  await replaceChildren(supabase, data.id as string, items, sections);
  await logProposalEvent(supabase, {
    proposalId: data.id as string,
    type: "created",
    body: `Proposal ${data.proposal_number} created from the ${template.name} template.`,
    actor,
  });

  touch(data.id as string);
  redirect(`/admin/proposals/${data.id}`);
}

export async function updateProposalAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "proposal_id", 40);
  if (!id) return;

  const { data: existing } = await supabase
    .from("proposals")
    .select("id, locked_at, proposal_number")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;

  if (existing.locked_at) {
    throw new Error(
      `${existing.proposal_number} has been signed and cannot be edited. Duplicate it as a revision, or raise a change order.`
    );
  }

  const items = parseItems(str(formData, "items_json", 200_000));
  const sections = parseSections(str(formData, "sections_json", 200_000));
  const commercials = commercialsFrom(formData, items);
  const packageKey = str(formData, "package_key", 60) || "custom";
  const template = templateByKey(packageKey);

  const { error } = await supabase
    .from("proposals")
    .update({
      title: str(formData, "title", 200) || template.defaultTitle,
      summary: str(formData, "summary", 6000) || null,
      package_key: packageKey,
      package_name: str(formData, "package_name", 200) || template.name,
      owner: str(formData, "owner", 200) || actor,
      ...clientFieldsFrom(formData),
      ...commercials,
      turnaround_note: str(formData, "turnaround_note", 500) || null,
      revision_limit: intOrNull(str(formData, "revision_limit", 5)),
      hosting_note: str(formData, "hosting_note", 2000) || null,
      valid_until: isoDateOrNull(str(formData, "valid_until", 20)),
      notes_internal: str(formData, "notes_internal", 6000) || null,
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the proposal: ${error.message}`);

  await replaceChildren(supabase, id, items, sections);
  await logProposalEvent(supabase, {
    proposalId: id,
    type: "edited",
    body: "Proposal content and pricing updated.",
    actor,
  });

  touch(id);
  redirect(`/admin/proposals/${id}`);
}

/**
 * Copies a proposal into a fresh draft with a new number and a new token.
 *
 * This is also how a signed proposal is revised: the original stays frozen,
 * the copy records what it supersedes, and the client never sees two live
 * links to the same work.
 */
export async function duplicateProposalAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "proposal_id", 40);
  if (!id) return;

  const { data: source } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!source) return;

  const original = source as Proposal;
  const asRevision = flag(formData, "as_revision");

  const agreement = await currentAgreement(supabase);

  const { data: copy, error } = await supabase
    .from("proposals")
    .insert({
      lead_id: original.lead_id,
      company_id: original.company_id,
      deal_id: original.deal_id,
      customer_id: original.customer_id,
      kind: flag(formData, "as_change_order") ? "change_order" : "proposal",
      supersedes_id: asRevision || flag(formData, "as_change_order") ? original.id : null,
      created_by: actor,
      owner: original.owner ?? actor,
      status: "draft",
      title: asRevision ? original.title : `${original.title} (copy)`,
      summary: original.summary,
      package_key: original.package_key,
      package_name: original.package_name,
      client_business_name: original.client_business_name,
      client_contact_name: original.client_contact_name,
      client_email: original.client_email,
      client_phone: original.client_phone,
      client_title: original.client_title,
      client_billing_address: original.client_billing_address,
      currency: original.currency,
      subtotal_cents: original.subtotal_cents,
      discount_amount_cents: original.discount_amount_cents,
      one_time_price_cents: original.one_time_price_cents,
      total_cents: original.total_cents,
      recurring_price_cents: original.recurring_price_cents,
      recurring_interval: original.recurring_interval,
      deposit_amount_cents: original.deposit_amount_cents,
      payment_mode: original.payment_mode,
      turnaround_note: original.turnaround_note,
      revision_limit: original.revision_limit,
      hosting_note: original.hosting_note,
      valid_until: defaultValidUntil(),
      public_token: newProposalToken(),
      // A copy carries today's wording, not the wording of a year ago.
      agreement_version_id: agreement?.id ?? original.agreement_version_id,
      notes_internal: original.notes_internal,
    })
    .select("id, proposal_number")
    .single();

  if (error || !copy) throw new Error(`Could not duplicate: ${error?.message ?? "unknown"}`);

  const [{ data: items }, { data: sections }] = await Promise.all([
    supabase.from("proposal_items").select("*").eq("proposal_id", id).order("sort_order"),
    supabase.from("proposal_sections").select("*").eq("proposal_id", id).order("sort_order"),
  ]);

  type Row = Record<string, unknown>;
  if (items && items.length > 0) {
    await supabase.from("proposal_items").insert(
      (items as Row[]).map((row) => ({
        ...without(row, ["id", "proposal_id", "created_at"]),
        proposal_id: copy.id,
      }))
    );
  }
  if (sections && sections.length > 0) {
    await supabase.from("proposal_sections").insert(
      (sections as Row[]).map((row) => ({
        ...without(row, ["id", "proposal_id", "created_at", "updated_at"]),
        proposal_id: copy.id,
      }))
    );
  }

  await logProposalEvent(supabase, {
    proposalId: copy.id as string,
    type: "duplicated",
    body: `Created from ${original.proposal_number}${asRevision ? " as a revision" : ""}.`,
    actor,
  });
  if (asRevision || flag(formData, "as_change_order")) {
    await logProposalEvent(supabase, {
      proposalId: original.id,
      type: "revised",
      body: `Superseded by ${copy.proposal_number}.`,
      actor,
    });
  }

  touch(copy.id as string);
  redirect(`/admin/proposals/${copy.id}/edit`);
}

// ═══════════════════════════════════════════════════════════════════════
// Sending, status, conversion
// ═══════════════════════════════════════════════════════════════════════

export async function sendProposalAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "proposal_id", 40);
  if (!id) return;

  const { data } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const proposal = data as Proposal;

  if (!proposal.client_email) {
    throw new Error("This proposal has no client email address. Add one before sending.");
  }
  if (!proposal.agreement_version_id) {
    throw new Error("This proposal has no agreement attached. Reopen it and save again.");
  }
  if (!canTransition(proposal.status, "sent")) {
    throw new Error(`A ${proposal.status} proposal cannot be sent.`);
  }

  const url = proposalUrl(proposal.public_token);
  const resend = Boolean(proposal.sent_at);
  const note = str(formData, "note", 2000) || null;

  const delivered = await sendProposalEmail(proposal, url, note);

  await supabase
    .from("proposals")
    .update({
      status: "sent",
      sent_at: proposal.sent_at ?? new Date().toISOString(),
      // Re-sending after a decline or an expiry puts it back in play.
      declined_at: null,
      decline_reason: null,
      expired_at: null,
    })
    .eq("id", id);

  await logProposalEvent(supabase, {
    proposalId: id,
    type: resend ? "resent" : "sent",
    body: delivered
      ? `Emailed to ${proposal.client_email}.`
      : `Marked as sent. The email did NOT go out — RESEND_API_KEY is not configured, so send the link manually: ${url}`,
    actor,
    metadata: { delivered, url },
  });

  touch(id);
}

/**
 * Any other status change an admin makes by hand, checked against the
 * transition map rather than written straight through.
 *
 * Dragging a paid proposal back to draft is not a state this business has —
 * the document was signed and the money moved — so the map refuses it and
 * says so instead of quietly corrupting the funnel numbers.
 */
export async function setProposalStatusAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "proposal_id", 40);
  const next = str(formData, "status", 30) as ProposalStatus;
  if (!id || !next) return;

  const { data } = await supabase
    .from("proposals")
    .select("id, status, proposal_number, total_cents, amount_paid_cents, job_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;

  const current = data.status as ProposalStatus;
  if (!canTransition(current, next)) {
    throw new Error(
      `${data.proposal_number} is ${current}; it cannot be moved to ${next}.`
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: next };
  if (next === "cancelled") patch.cancelled_at = now;
  if (next === "expired") patch.expired_at = now;
  if (next === "declined") {
    patch.declined_at = now;
    patch.decline_reason = str(formData, "reason", 2000) || null;
  }
  if (next === "draft") {
    // Putting it back in the builder clears the closing stamps, but never
    // sent_at — that it went out once is a fact, not a status.
    patch.cancelled_at = null;
    patch.expired_at = null;
    patch.declined_at = null;
    patch.decline_reason = null;
  }
  if (next === "paid") {
    patch.paid_at = now;
    // Recorded on the proposal only. Revenue stays Stripe-sourced so the
    // campaign dashboard cannot count one sale twice; a payment taken
    // outside Stripe is entered wherever that money is actually booked.
    patch.amount_paid_cents = Math.max(
      Number(data.amount_paid_cents ?? 0),
      Number(data.total_cents ?? 0)
    );
  }

  const { error } = await supabase.from("proposals").update(patch).eq("id", id);
  if (error) throw new Error(`Could not update status: ${error.message}`);

  if (next === "paid" && data.job_id) {
    await supabase.from("jobs").update({ engagement_status: "paid" }).eq("id", data.job_id);
  }

  await logProposalEvent(supabase, {
    proposalId: id,
    type: next === "paid" ? "paid" : next === "declined" ? "declined" : next === "cancelled" ? "cancelled" : "note",
    body:
      next === "paid"
        ? "Marked paid by hand in the admin. No Stripe payment is attached to this."
        : `Status changed from ${current} to ${next}.`,
    actor,
  });

  touch(id);
}

/**
 * Turns a signed proposal into a project.
 *
 * Gated on what was actually agreed: a proposal that asks for money at
 * signature has to have been paid, and one that does not can convert as soon
 * as it is signed. The gate is read from the proposal, never from a checkbox
 * on the form.
 *
 * Idempotent: if a job already exists it links to it rather than opening a
 * second one, and a client is looked up before being created so one business
 * does not end up as two customer records.
 */
export async function convertProposalToProjectAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "proposal_id", 40);
  if (!id) return;

  const { data } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const p = data as Proposal;

  if (!p.signed_at) throw new Error("This proposal has not been signed yet.");

  const dueAtSignature =
    p.payment_mode === "invoice_later"
      ? 0
      : p.payment_mode === "full"
        ? p.total_cents
        : p.deposit_amount_cents;

  if (dueAtSignature > 0 && p.amount_paid_cents < dueAtSignature) {
    throw new Error(
      "The payment agreed at signature has not been received yet, so the project cannot be created."
    );
  }
  // ── The client record. Found before created.
  let customerId = p.customer_id;
  if (!customerId && p.lead_id) {
    const { data: byLead } = await supabase
      .from("customers").select("id").eq("lead_id", p.lead_id).maybeSingle();
    customerId = (byLead?.id as string | undefined) ?? null;
  }
  if (!customerId && p.client_email) {
    const { data: byEmail } = await supabase
      .from("customers").select("id").ilike("email", p.client_email).limit(1).maybeSingle();
    customerId = (byEmail?.id as string | undefined) ?? null;
  }
  if (!customerId) {
    const { data: created, error: customerError } = await supabase
      .from("customers")
      .insert({
        lead_id: p.lead_id,
        company_id: p.company_id,
        name: p.client_contact_name,
        business_name: p.client_business_name,
        email: p.client_email ?? "",
        phone: p.client_phone,
        status: "active",
        mrr_cents: p.recurring_price_cents,
        owner: p.owner ?? actor,
        notes: `Converted from proposal ${p.proposal_number}.`,
      })
      .select("id")
      .single();
    if (customerError || !created) {
      throw new Error(`Could not create the client record: ${customerError?.message ?? "unknown"}`);
    }
    customerId = created.id as string;
  }

  // ── The project.
  const isStarter = p.package_key === "starter_149";
  const deliveryPackage = isStarter
    ? "starter_149"
    : p.package_key === "classic_399"
      ? "launch_package"
      : p.package_key ?? "launch_package";
  const started = new Date();
  let jobId = p.job_id;
  let reusedPreContractProject = false;

  if (jobId) {
    const { data: existing, error: existingError } = await supabase
      .from("jobs")
      .select("id, engagement_status")
      .eq("id", jobId)
      .maybeSingle();
    if (existingError || !existing) throw new Error("The linked project could not be found.");
    if (existing.engagement_status !== "pre_contract") {
      throw new Error("A contracted project already exists for this proposal.");
    }

    const { error: promoteError } = await supabase
      .from("jobs")
      .update({
        customer_id: customerId,
        invoice_id: p.invoice_id,
        engagement_status: dueAtSignature > p.amount_paid_cents ? "awaiting_payment" : "contracted",
      })
      .eq("id", jobId);
    if (promoteError) {
      throw new Error(`Could not promote the pre-contract project: ${promoteError.message}`);
    }
    await supabase.from("tasks").update({ customer_id: customerId }).eq("job_id", jobId);
    reusedPreContractProject = true;
  } else {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        customer_id: customerId,
        lead_id: p.lead_id,
        invoice_id: p.invoice_id,
        title: p.title,
        business_name: p.client_business_name,
        stage: isStarter ? "Purchased" : "Intake",
        package: deliveryPackage,
        engagement_status: dueAtSignature > p.amount_paid_cents ? "awaiting_payment" : "contracted",
        recurring_value_cents: p.recurring_price_cents,
        promised_days: PROMISED_DAYS,
        started_at: started.toISOString(),
        due_at: dueDateFrom(started),
        notes: [
          `From proposal ${p.proposal_number}.`,
          p.turnaround_note ? `Turnaround quoted: ${p.turnaround_note}` : null,
          p.revision_limit !== null ? `Revision rounds included: ${p.revision_limit}` : null,
          p.recurring_price_cents > 0
            ? `Hosting: ${(p.recurring_price_cents / 100).toFixed(2)}/${p.recurring_interval}`
            : null,
        ].filter(Boolean).join("\n"),
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(`Could not open the project: ${jobError?.message ?? "unknown"}`);
    }
    jobId = job.id as string;
  }

  if (!jobId) throw new Error("The project could not be identified.");

  // The proven per-stage checklist, for the packages whose jobs run it.
  if (!isStarter && !reusedPreContractProject) {
    await supabase.from("job_tasks").insert(
      DEFAULT_JOB_TASKS.map((task, index) => ({
        job_id: jobId,
        stage: task.stage,
        label: task.label,
        position: index,
      }))
    );
  }

  // ── The delivery workflow for what was actually sold.
  //
  // job_tasks above is the project board's own per-stage checklist. This is
  // the schedulable, assignable work register — dated, prioritised and
  // visible on /admin/tasks alongside everything else. Two different things
  // that happen to both be lists.
  //
  // Deliberately not fatal: a workflow that failed to open is a button press
  // away on the project, and must never undo a conversion that has already
  // created a client, a project and taken a payment.
  let generatedTasks = 0;
  try {
    const workflow = await onProjectCreated(supabase, {
      jobId,
      packageKey: p.package_key,
      customerId,
      leadId: p.lead_id,
      proposalId: p.id,
      owner: p.owner ?? actor,
      actor,
      startDate: started,
    });
    generatedTasks = workflow.created;
  } catch {
    // Recorded by its absence on the task board rather than by failing here.
  }

  await supabase.from("job_events").insert({
    job_id: jobId,
    kind: "note",
    body: reusedPreContractProject
      ? `Pre-contract project promoted after signed proposal ${p.proposal_number}.`
      : `Project opened from signed proposal ${p.proposal_number}.`,
    to_stage: isStarter ? "Purchased" : "Intake",
    actor,
  });

  // ── The onboarding questionnaire. Same wizard the Starter sale uses; for
  // every other package it is issued without touching the job's stage, whose
  // vocabulary is the 0004 one.
  let intakeUrl: string | null = null;
  if (!reusedPreContractProject) {
    try {
      const { url } = await createIntake({
        jobId,
        customerId,
        leadId: p.lead_id,
        businessName: p.client_business_name,
        contactName: p.client_contact_name,
        email: p.client_email,
        phone: p.client_phone,
        packageKey: p.package_key,
        advanceJobStage: isStarter,
      });
      intakeUrl = url;
    } catch {
      // An intake that could not be opened is a follow-up, not a failed
      // conversion — the project and the client record are already real.
    }
  }

  // ── Close the loop on the records this came from.
  await supabase
    .from("proposals")
    .update({
      status: "converted",
      converted_at: new Date().toISOString(),
      job_id: jobId,
      customer_id: customerId,
    })
    .eq("id", id);

  if (p.deal_id) {
    await supabase
      .from("deals")
      .update({ stage: "won", won_at: new Date().toISOString(), customer_id: customerId })
      .eq("id", p.deal_id);
  }
  if (p.lead_id) {
    await supabase.from("leads").update({ lead_status: "Won" }).eq("id", p.lead_id);
  }

  await logProposalEvent(supabase, {
    proposalId: id,
    type: "converted_to_project",
    body: [
      "Project opened",
      generatedTasks > 0 ? `with ${generatedTasks} delivery tasks` : null,
      intakeUrl ? "and an onboarding link issued" : null,
    ].filter(Boolean).join(" ") + ".",
    actor,
    metadata: {
      job_id: jobId, customer_id: customerId,
      intake_url: intakeUrl, generated_tasks: generatedTasks,
    },
  });

  touch(id);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/tasks");
  redirect(`/admin/jobs/${jobId}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Agreement versions — Settings → Agreements
// ═══════════════════════════════════════════════════════════════════════

/**
 * Saves agreement wording as a NEW version, never over an old one.
 *
 * Editing a published version in place would change what somebody has already
 * signed, which is the one thing this whole feature exists to prevent. A
 * version already pointed at by a proposal is therefore copied, not modified.
 */
export async function saveAgreementVersionAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const version = str(formData, "version", 40);
  const title = str(formData, "title", 300);
  if (!version || !title) throw new Error("A version number and a title are both required.");

  let sections: unknown;
  let ownership: unknown;
  try {
    sections = JSON.parse(str(formData, "sections_json", 400_000) || "[]");
    ownership = JSON.parse(str(formData, "ownership_json", 100_000) || "[]");
  } catch {
    throw new Error("The clause or ownership JSON is not valid. Nothing was saved.");
  }
  if (!Array.isArray(sections) || !Array.isArray(ownership)) {
    throw new Error("Clauses and ownership rows must each be a JSON array.");
  }

  const id = str(formData, "agreement_id", 40);
  const payload = {
    version,
    title,
    intro: str(formData, "intro", 20_000) || null,
    sections,
    ownership_rows: ownership,
    created_by: actor,
  };

  if (id) {
    const { data: existing } = await supabase
      .from("agreement_versions").select("id, status").eq("id", id).maybeSingle();
    if (!existing) throw new Error("That agreement version no longer exists.");

    const { count } = await supabase
      .from("proposals").select("id", { count: "exact", head: true })
      .eq("agreement_version_id", id);

    if (existing.status === "draft" && (count ?? 0) === 0) {
      const { error } = await supabase.from("agreement_versions").update(payload).eq("id", id);
      if (error) throw new Error(`Could not save: ${error.message}`);
      revalidatePath("/admin/settings/agreements");
      return;
    }
    // Published, or already in use: this becomes a new draft version instead.
  }

  const { error } = await supabase
    .from("agreement_versions")
    .insert({ ...payload, status: "draft" });
  if (error) {
    throw new Error(
      error.message.includes("agreement_versions_version_key")
        ? `Version ${version} already exists. Give this one a new number.`
        : `Could not save: ${error.message}`
    );
  }

  revalidatePath("/admin/settings/agreements");
}

export async function publishAgreementVersionAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "agreement_id", 40);
  if (!id) return;

  const { error } = await supabase
    .from("agreement_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not publish: ${error.message}`);

  revalidatePath("/admin/settings/agreements");
  revalidatePath("/admin/proposals");
}

/**
 * Retires wording without deleting it. Archived versions still render on
 * every proposal that pinned them — a signed agreement must stay readable
 * long after it stops being what we offer.
 */
export async function archiveAgreementVersionAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "agreement_id", 40);
  if (!id) return;

  const { count } = await supabase
    .from("agreement_versions")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .neq("id", id);

  if ((count ?? 0) === 0) {
    throw new Error(
      "This is the only published agreement version. Publish its replacement first, or new proposals will have no terms to attach."
    );
  }

  const { error } = await supabase
    .from("agreement_versions").update({ status: "archived" }).eq("id", id);
  if (error) throw new Error(`Could not archive: ${error.message}`);

  revalidatePath("/admin/settings/agreements");
}
