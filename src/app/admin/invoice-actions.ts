"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  DEFAULT_FOOTER, DEFAULT_TERMS, canTransition, dueDateFor,
  type InvoiceItemKind, type InvoiceStatus, type PaymentMethod, type PaymentTerm,
  ITEM_KINDS, PAYMENT_METHODS, PAYMENT_TERMS, TERM_LABELS,
} from "@/lib/invoices/config";
import { formatMoney, outstandingCents, daysOverdue } from "@/lib/invoices/pricing";
import { invoiceUrl, logInvoiceEvent, recomputeInvoiceTotals } from "@/lib/invoices/service";
import {
  sendInvoiceEmail, sendInvoiceReceipt, sendInvoiceReminder, notifyAdminInvoice,
} from "@/lib/invoices/emails";
import type { Invoice, InvoiceItem } from "@/lib/invoices/types";
import type { Proposal, ProposalItem } from "@/lib/proposals/types";

/**
 * Every write the admin can make to an invoice.
 *
 * A `"use server"` file may export nothing but async functions — an exported
 * const is a build error Next only raises at page-data collection, which cost
 * a deploy once. Shared constants live in src/lib/invoices/config.ts, which
 * both this file and the forms import.
 *
 * All of these run on the request-scoped client, so RLS applies and an
 * account that is not in admin_users writes nothing. The service role appears
 * only in the public token path.
 *
 * Two rules the database will enforce whatever this file does, and which are
 * worth knowing before changing anything here:
 *
 *  - A paid invoice's amounts are frozen by a trigger. Fixing a paid invoice
 *    means raising a new one.
 *  - `amount_paid_cents`, and the paid/partial status with it, are computed
 *    by a trigger from invoice_payments. Nothing here sets them by hand.
 */

const REVALIDATE = ["/admin/invoices", "/admin/proposals", "/admin/clients", "/admin"];

function touch(id?: string | null) {
  for (const path of REVALIDATE) revalidatePath(path);
  if (id) {
    revalidatePath(`/admin/invoices/${id}`);
    revalidatePath(`/admin/invoices/${id}/edit`);
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

/** "$1,250.50" → 125050. Anything unparseable is zero, never NaN. */
function cents(raw: string): number {
  const value = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function isoDateOrNull(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function newInvoiceToken(): string {
  return randomBytes(32).toString("base64url");
}

type ParsedLine = {
  item_kind: InvoiceItemKind;
  title: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  sort_order: number;
};

/**
 * The builder posts its lines as one JSON field rather than fifty numbered
 * inputs. Everything is re-validated here: a title that is not a string, a
 * kind that is not in the vocabulary, or a negative price simply does not
 * survive into the database.
 */
function parseLines(raw: string): ParsedLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ParsedLine[] = [];
  for (const entry of parsed.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const title = typeof row.title === "string" ? row.title.trim().slice(0, 300) : "";
    if (!title) continue;

    const kind = ITEM_KINDS.includes(row.item_kind as InvoiceItemKind)
      ? (row.item_kind as InvoiceItemKind)
      : "one_time";

    const quantityRaw = Number(row.quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0
        ? Math.min(9999, Math.round(quantityRaw * 100) / 100)
        : 1;

    const unit =
      typeof row.unit_price === "string"
        ? cents(row.unit_price)
        : Number.isFinite(Number(row.unit_price_cents))
          ? Math.max(0, Math.round(Number(row.unit_price_cents)))
          : 0;

    out.push({
      item_kind: kind,
      title,
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description.trim().slice(0, 2000)
          : null,
      quantity,
      unit_price_cents: unit,
      total_price_cents: Math.round(quantity * unit),
      sort_order: out.length,
    });
  }
  return out;
}

function clientFieldsFrom(fd: FormData) {
  return {
    client_business_name: str(fd, "client_business_name", 200) || null,
    client_contact_name: str(fd, "client_contact_name", 200) || null,
    client_email: str(fd, "client_email", 200) || null,
    client_phone: str(fd, "client_phone", 60) || null,
    client_billing_address: str(fd, "client_billing_address", 1000) || null,
  };
}

function termFrom(fd: FormData): PaymentTerm {
  const raw = str(fd, "payment_terms", 40) as PaymentTerm;
  return PAYMENT_TERMS.includes(raw) ? raw : "due_on_receipt";
}

/** Replaces every line on an invoice, then re-totals it. */
async function replaceLines(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoiceId: string,
  lines: ParsedLine[]
) {
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (lines.length > 0) {
    await supabase
      .from("invoice_items")
      .insert(lines.map((line) => ({ ...line, invoice_id: invoiceId })));
  }
  await recomputeInvoiceTotals(supabase, invoiceId);
}

// ═══════════════════════════════════════════════════════════════════════
// Creating
// ═══════════════════════════════════════════════════════════════════════

export async function createInvoiceAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const lines = parseLines(str(formData, "lines_json", 200_000));
  const term = termFrom(formData);
  const issueDate = isoDateOrNull(str(formData, "issue_date", 20)) ?? today();
  const leadId = str(formData, "lead_id", 40) || null;
  const customerId = str(formData, "customer_id", 40) || null;

  let companyId = str(formData, "company_id", 40) || null;
  if (!companyId && leadId) {
    const { data } = await supabase.from("leads").select("company_id").eq("id", leadId).maybeSingle();
    companyId = (data?.company_id as string | undefined) ?? null;
  }
  if (!companyId && customerId) {
    const { data } = await supabase.from("customers").select("company_id").eq("id", customerId).maybeSingle();
    companyId = (data?.company_id as string | undefined) ?? null;
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      source: "manual",
      status: "draft",
      lead_id: leadId,
      customer_id: customerId,
      company_id: companyId,
      deal_id: str(formData, "deal_id", 40) || null,
      proposal_id: str(formData, "proposal_id", 40) || null,
      job_id: str(formData, "job_id", 40) || null,
      created_by: actor,
      owner: str(formData, "owner", 200) || actor,
      title: str(formData, "title", 200) || "Invoice",
      description: str(formData, "description", 1000) || null,
      ...clientFieldsFrom(formData),
      issue_date: issueDate,
      due_date: isoDateOrNull(str(formData, "due_date", 20)) ?? dueDateFor(term, issueDate),
      payment_terms: term,
      recurring_interval: str(formData, "recurring_interval", 10) === "year" ? "year" : "month",
      recurring_starts_on: isoDateOrNull(str(formData, "recurring_starts_on", 20)),
      terms: str(formData, "terms", 6000) || DEFAULT_TERMS,
      footer_note: str(formData, "footer_note", 2000) || DEFAULT_FOOTER,
      notes: str(formData, "notes", 4000) || null,
      notes_internal: str(formData, "notes_internal", 6000) || null,
      public_token: newInvoiceToken(),
      billing: lines.some((l) => l.item_kind === "recurring") ? "monthly" : "one_time",
    })
    .select("id, invoice_number")
    .single();

  if (error || !data) {
    throw new Error(`Could not create the invoice: ${error?.message ?? "unknown"}`);
  }

  await replaceLines(supabase, data.id as string, lines);
  await logInvoiceEvent(supabase, {
    invoiceId: data.id as string,
    type: "created",
    body: `Invoice ${data.invoice_number} written.`,
    actor,
  });

  touch(data.id as string);
  redirect(`/admin/invoices/${data.id}`);
}

/**
 * The button on a signed proposal: raise the invoice for it.
 *
 * This is the join between the two halves of the workflow. The proposal is
 * what both parties agreed; the invoice is the bill for having done it, and
 * it should never require retyping the numbers that were already agreed.
 *
 * What carries over: the client, the one-time total as a single line (or the
 * proposal's own billable lines when it has them), and hosting as a recurring
 * line. What does not carry over: anything already collected at signature —
 * that is recorded as a payment against the new invoice, so the balance is
 * right on the first render instead of asking for money twice.
 */
export async function createInvoiceFromProposalAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const proposalId = str(formData, "proposal_id", 40);
  if (!proposalId) return;

  const { data: proposalRow } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposalRow) throw new Error("That proposal no longer exists.");
  const p = proposalRow as Proposal;

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("proposal_id", proposalId)
    .eq("source", "proposal")
    .maybeSingle();
  if (existing) {
    touch(existing.id as string);
    redirect(`/admin/invoices/${existing.id}`);
  }

  const { data: itemRows } = await supabase
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("sort_order");

  const billable = ((itemRows ?? []) as ProposalItem[]).filter(
    (item) =>
      item.is_billable &&
      !item.is_optional &&
      item.item_type !== "recurring" &&
      item.item_type !== "discount" &&
      item.total_price_cents > 0
  );

  const lines: ParsedLine[] = billable.map((item, index) => ({
    item_kind: "one_time" as const,
    title: item.title,
    description: item.description,
    quantity: item.quantity,
    unit_price_cents: item.unit_price_cents,
    total_price_cents: item.total_price_cents,
    sort_order: index,
  }));

  // A proposal priced as a single figure rather than itemised — which is
  // most of them — becomes one line saying what was built.
  if (lines.length === 0 && p.one_time_price_cents > 0) {
    lines.push({
      item_kind: "one_time",
      title: p.title,
      description: p.package_name ? `${p.package_name} — as agreed in ${p.proposal_number}.` : null,
      quantity: 1,
      unit_price_cents: p.one_time_price_cents,
      total_price_cents: p.one_time_price_cents,
      sort_order: 0,
    });
  }

  if (p.discount_amount_cents > 0) {
    lines.push({
      item_kind: "discount",
      title: "Agreed discount",
      description: null,
      quantity: 1,
      unit_price_cents: p.discount_amount_cents,
      total_price_cents: p.discount_amount_cents,
      sort_order: lines.length,
    });
  }

  if (p.recurring_price_cents > 0) {
    lines.push({
      item_kind: "recurring",
      title: "Hosting & management",
      description: p.hosting_note,
      quantity: 1,
      unit_price_cents: p.recurring_price_cents,
      total_price_cents: p.recurring_price_cents,
      sort_order: lines.length,
    });
  }

  const issueDate = today();

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      source: "proposal",
      status: "draft",
      proposal_id: p.id,
      lead_id: p.lead_id,
      customer_id: p.customer_id,
      company_id: p.company_id,
      deal_id: p.deal_id,
      job_id: p.job_id,
      created_by: actor,
      owner: p.owner || actor,
      title: p.title,
      description: `Raised from proposal ${p.proposal_number}.`,
      client_business_name: p.client_business_name,
      client_contact_name: p.client_contact_name,
      client_email: p.client_email,
      client_phone: p.client_phone,
      client_billing_address: p.client_billing_address,
      currency: p.currency,
      issue_date: issueDate,
      due_date: dueDateFor("due_on_receipt", issueDate),
      payment_terms: "due_on_receipt",
      recurring_interval: p.recurring_interval,
      recurring_starts_on: null,
      terms: DEFAULT_TERMS,
      footer_note: DEFAULT_FOOTER,
      notes_internal: `Raised from ${p.proposal_number} on ${issueDate}.`,
      public_token: newInvoiceToken(),
      billing: p.recurring_price_cents > 0 ? "monthly" : "one_time",
    })
    .select("id, invoice_number")
    .single();

  if (error || !data) {
    throw new Error(`Could not raise the invoice: ${error?.message ?? "unknown"}`);
  }

  const invoiceId = data.id as string;
  await replaceLines(supabase, invoiceId, lines);

  // Money already collected at signature is recorded against the invoice, so
  // the balance is right rather than billing the client twice.
  if (p.amount_paid_cents > 0) {
    await supabase.from("invoice_payments").insert({
      invoice_id: invoiceId,
      amount_cents: p.amount_paid_cents,
      currency: p.currency,
      method: "stripe",
      reference: p.stripe_session_id,
      paid_on: (p.paid_at ?? p.signed_at ?? new Date().toISOString()).slice(0, 10),
      note: `Collected at signature on proposal ${p.proposal_number}.`,
      recorded_by: actor,
    });
  }

  await logInvoiceEvent(supabase, {
    invoiceId,
    type: "created",
    body: `Invoice ${data.invoice_number} raised from proposal ${p.proposal_number}.`,
    actor,
    metadata: { proposal_id: p.id },
  });

  await supabase.from("proposal_events").insert({
    proposal_id: p.id,
    event_type: "note",
    body: `Invoice ${data.invoice_number} raised for this proposal.`,
    actor,
    metadata: { invoice_id: invoiceId },
  });

  revalidatePath(`/admin/proposals/${p.id}`);
  touch(invoiceId);
  redirect(`/admin/invoices/${invoiceId}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Editing
// ═══════════════════════════════════════════════════════════════════════

export async function updateInvoiceAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data: existing } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;
  const inv = existing as Invoice;

  if (inv.status === "paid") {
    throw new Error(
      `Invoice ${inv.invoice_number} is paid, so what it charged cannot be changed. Raise a new invoice, or refund this one first.`
    );
  }

  const lines = parseLines(str(formData, "lines_json", 200_000));
  const term = termFrom(formData);
  const issueDate = isoDateOrNull(str(formData, "issue_date", 20)) ?? inv.issue_date ?? today();

  const { error } = await supabase
    .from("invoices")
    .update({
      title: str(formData, "title", 200) || inv.title,
      description: str(formData, "description", 1000) || null,
      owner: str(formData, "owner", 200) || inv.owner,
      ...clientFieldsFrom(formData),
      issue_date: issueDate,
      due_date: isoDateOrNull(str(formData, "due_date", 20)) ?? dueDateFor(term, issueDate),
      payment_terms: term,
      recurring_interval: str(formData, "recurring_interval", 10) === "year" ? "year" : "month",
      recurring_starts_on: isoDateOrNull(str(formData, "recurring_starts_on", 20)),
      terms: str(formData, "terms", 6000) || DEFAULT_TERMS,
      footer_note: str(formData, "footer_note", 2000) || null,
      notes: str(formData, "notes", 4000) || null,
      notes_internal: str(formData, "notes_internal", 6000) || null,
      billing: lines.some((l) => l.item_kind === "recurring") ? "monthly" : "one_time",
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the invoice: ${error.message}`);

  await replaceLines(supabase, id, lines);
  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: "edited",
    body: "Invoice edited.",
    actor,
  });

  touch(id);
  redirect(`/admin/invoices/${id}`);
}

// ═══════════════════════════════════════════════════════════════════════
// Sending — two ways, on purpose
// ═══════════════════════════════════════════════════════════════════════

/**
 * Email it, through Resend.
 *
 * Refuses an invoice with nothing on it. An invoice for $0 with no lines is
 * always a mistake somebody is about to send to a client.
 */
export async function sendInvoiceAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  if (!inv.client_email) {
    throw new Error("This invoice has no client email address. Add one before sending it.");
  }
  if (inv.total_cents <= 0 && inv.recurring_cents <= 0) {
    throw new Error("This invoice has nothing on it. Add a line before sending it.");
  }
  if (!canTransition(inv.status, "sent")) {
    throw new Error(`A ${inv.status} invoice cannot be sent.`);
  }

  const { data: itemRows } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order");

  const url = invoiceUrl(inv.public_token);
  const resent = Boolean(inv.sent_at);
  const note = str(formData, "note", 2000) || null;

  const delivered = await sendInvoiceEmail(inv, (itemRows ?? []) as InvoiceItem[], url, note);

  await supabase
    .from("invoices")
    .update({
      status: inv.status === "partial" ? "partial" : "sent",
      sent_at: inv.sent_at ?? new Date().toISOString(),
      sent_method: "email",
    })
    .eq("id", id);

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: resent ? "resent" : "sent",
    body: delivered
      ? `Emailed to ${inv.client_email}.`
      : `Marked as sent. The email did NOT go out — RESEND_API_KEY is not configured, so send the link manually: ${url}`,
    actor,
    metadata: { delivered, url },
  });

  touch(id);
}

/**
 * Mark it sent without emailing it.
 *
 * This is not a shortcut, it is the normal path for half this business. The
 * real channel with a client is often Facebook Messenger or a text, and
 * `email_consent` is false on some leads outright. Before this existed the
 * only way to send a document was to email it, which meant either emailing
 * somebody who had not agreed to be emailed, or leaving a document that had
 * genuinely gone out sitting in the admin marked Draft.
 *
 * The link is copied from the button beside this one. All this records is the
 * truth: it went out, by hand, on this date.
 */
export async function markInvoiceSentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  if (inv.total_cents <= 0 && inv.recurring_cents <= 0) {
    throw new Error("This invoice has nothing on it. Add a line before sending it.");
  }
  if (!canTransition(inv.status, "sent")) {
    throw new Error(`A ${inv.status} invoice cannot be sent.`);
  }

  const how = str(formData, "how", 200) || "by hand";

  await supabase
    .from("invoices")
    .update({
      status: inv.status === "partial" ? "partial" : "sent",
      sent_at: inv.sent_at ?? new Date().toISOString(),
      sent_method: "manual",
    })
    .eq("id", id);

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: inv.sent_at ? "resent" : "sent",
    body: `Sent ${how} — no email was sent from here. The client has the link.`,
    actor,
    metadata: { url: invoiceUrl(inv.public_token), how },
  });

  touch(id);
}

/** A nudge on something overdue. */
export async function sendInvoiceReminderAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  if (!inv.client_email) throw new Error("This invoice has no client email address.");
  if (outstandingCents(inv) <= 0) throw new Error("There is nothing outstanding on this invoice.");

  const { data: itemRows } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("sort_order");

  const delivered = await sendInvoiceReminder(
    inv,
    (itemRows ?? []) as InvoiceItem[],
    invoiceUrl(inv.public_token),
    daysOverdue(inv.due_date)
  );

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: "reminder_sent",
    body: delivered
      ? `Reminder emailed to ${inv.client_email} for ${formatMoney(outstandingCents(inv), inv.currency)}.`
      : "Reminder NOT sent — email is not configured.",
    actor,
    metadata: { delivered },
  });

  touch(id);
}

// ═══════════════════════════════════════════════════════════════════════
// Money in
// ═══════════════════════════════════════════════════════════════════════

/**
 * Records a payment that arrived some way other than the Pay button.
 *
 * Cash, a cheque, a bank transfer, a card taken over the phone. The row goes
 * into invoice_payments and the database recomputes the invoice's paid total
 * and status from it — this action never sets `status: paid` by hand.
 *
 * It deliberately writes NO revenue_events row. That ledger is Stripe-sourced
 * so the campaign dashboard can be trusted against ad spend; money booked
 * outside Stripe is booked wherever it actually landed.
 */
export async function recordInvoicePaymentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  const amount = cents(str(formData, "amount", 40));
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");

  const rawMethod = str(formData, "method", 40) as PaymentMethod;
  const method: PaymentMethod = PAYMENT_METHODS.includes(rawMethod) ? rawMethod : "other";

  const { error } = await supabase.from("invoice_payments").insert({
    invoice_id: id,
    amount_cents: amount,
    currency: inv.currency,
    method,
    reference: str(formData, "reference", 200) || null,
    paid_on: isoDateOrNull(str(formData, "paid_on", 20)) ?? today(),
    note: str(formData, "note", 1000) || null,
    recorded_by: actor,
  });

  if (error) throw new Error(`Could not record the payment: ${error.message}`);

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: "payment_recorded",
    body: `${formatMoney(amount, inv.currency)} recorded — ${method.replace("_", " ")}.`,
    actor,
    metadata: { amount_cents: amount, method },
  });

  // Re-read: the trigger has just moved the status and the paid total.
  const { data: after } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  const updated = (after ?? inv) as Invoice;

  if (str(formData, "send_receipt", 10) === "1" && updated.client_email) {
    await sendInvoiceReceipt(updated, amount, invoiceUrl(updated.public_token));
  }

  touch(id);
}

/** Removes a payment recorded in error. The trigger reopens the invoice. */
export async function deleteInvoicePaymentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  const paymentId = str(formData, "payment_id", 40);
  if (!id || !paymentId) return;

  const { data } = await supabase
    .from("invoice_payments")
    .select("amount_cents, method, stripe_payment_intent")
    .eq("id", paymentId)
    .maybeSingle();

  if (data?.stripe_payment_intent) {
    throw new Error(
      "That payment came from Stripe and is the record of a real charge. Refund it in Stripe rather than deleting it here."
    );
  }

  await supabase.from("invoice_payments").delete().eq("id", paymentId).eq("invoice_id", id);

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: "note",
    body: `A recorded payment of ${formatMoney(Number(data?.amount_cents ?? 0))} was removed.`,
    actor,
  });

  touch(id);
}

// ═══════════════════════════════════════════════════════════════════════
// Status
// ═══════════════════════════════════════════════════════════════════════

export async function setInvoiceStatusAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  const next = str(formData, "status", 40) as InvoiceStatus;
  if (!id || !next) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  if (!canTransition(inv.status, next)) {
    throw new Error(`An invoice cannot go from ${inv.status} to ${next}.`);
  }

  const reason = str(formData, "reason", 1000) || null;
  const now = new Date().toISOString();

  await supabase
    .from("invoices")
    .update({
      status: next,
      voided_at: next === "void" ? now : inv.voided_at,
      cancelled_reason: next === "void" || next === "refunded" ? reason : inv.cancelled_reason,
    })
    .eq("id", id);

  await logInvoiceEvent(supabase, {
    invoiceId: id,
    type: next === "void" ? "voided" : next === "refunded" ? "refunded" : "note",
    body: `Status moved from ${inv.status} to ${next}.${reason ? ` ${reason}` : ""}`,
    actor,
  });

  touch(id);
}

export async function addInvoiceNoteAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  const body = str(formData, "body", 4000);
  if (!id || !body) return;

  await logInvoiceEvent(supabase, { invoiceId: id, type: "note", body, actor });
  touch(id);
}

/** A draft nobody has seen can be deleted outright. Anything else is voided. */
export async function deleteInvoiceAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("status, sent_at").eq("id", id).maybeSingle();
  if (!data) return;

  if (data.status !== "draft" || data.sent_at) {
    throw new Error("Only an unsent draft can be deleted. Void this invoice instead — the record has to survive.");
  }

  await supabase.from("invoices").delete().eq("id", id);
  touch(null);
  redirect("/admin/invoices");
}

export async function duplicateInvoiceAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  const inv = data as Invoice;

  const issueDate = today();
  const term = (inv.payment_terms as PaymentTerm) || "due_on_receipt";

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      source: "manual",
      status: "draft",
      lead_id: inv.lead_id,
      customer_id: inv.customer_id,
      company_id: inv.company_id,
      deal_id: inv.deal_id,
      proposal_id: inv.proposal_id,
      job_id: inv.job_id,
      created_by: actor,
      owner: inv.owner,
      title: inv.title,
      description: inv.description,
      client_business_name: inv.client_business_name,
      client_contact_name: inv.client_contact_name,
      client_email: inv.client_email,
      client_phone: inv.client_phone,
      client_billing_address: inv.client_billing_address,
      currency: inv.currency,
      issue_date: issueDate,
      due_date: dueDateFor(PAYMENT_TERMS.includes(term) ? term : "due_on_receipt", issueDate),
      payment_terms: inv.payment_terms,
      recurring_interval: inv.recurring_interval,
      recurring_starts_on: inv.recurring_starts_on,
      terms: inv.terms,
      footer_note: inv.footer_note,
      notes: inv.notes,
      notes_internal: `Duplicated from ${inv.invoice_number}.`,
      public_token: newInvoiceToken(),
      billing: inv.billing,
    })
    .select("id, invoice_number")
    .single();

  if (error || !created) throw new Error(`Could not duplicate: ${error?.message ?? "unknown"}`);

  const { data: lines } = await supabase
    .from("invoice_items")
    .select("item_kind, title, description, quantity, unit_price_cents, total_price_cents, sort_order")
    .eq("invoice_id", id)
    .order("sort_order");

  if (lines && lines.length > 0) {
    await supabase
      .from("invoice_items")
      .insert(lines.map((line) => ({ ...line, invoice_id: created.id as string })));
  }
  await recomputeInvoiceTotals(supabase, created.id as string);

  await logInvoiceEvent(supabase, {
    invoiceId: created.id as string,
    type: "created",
    body: `Duplicated from ${inv.invoice_number}.`,
    actor,
  });

  touch(created.id as string);
  redirect(`/admin/invoices/${created.id}`);
}

/** Internal heads-up, used by the screens rather than by a webhook. */
export async function notifyInvoiceAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "invoice_id", 40);
  if (!id) return;

  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  await notifyAdminInvoice("sent", data as Invoice, TERM_LABELS[(data as Invoice).payment_terms as PaymentTerm]);
}
