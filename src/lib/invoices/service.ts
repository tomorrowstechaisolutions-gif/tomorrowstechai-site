import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeInvoice } from "./pricing";
import type { FullInvoice, Invoice, InvoiceEventType, InvoiceItem, InvoicePayment } from "./types";

/**
 * The invoice's own service layer.
 *
 * Two callers, two clients. The admin screens pass their request-scoped
 * Supabase client and RLS applies. The client's tokenised page has no account
 * at all, so it comes through here on the service role — which is exactly why
 * the token flow lives in this file and nowhere else, and why the only thing
 * the browser ever sends is the token itself.
 */

export function invoiceUrl(token: string): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://tomorrowstechai.com"
  ).replace(/\/+$/, "");
  return `${base}/invoice/${token}`;
}

export type LoadFailure = "not_found" | "not_available";

async function assemble(db: SupabaseClient, invoice: Invoice): Promise<FullInvoice> {
  const [items, payments] = await Promise.all([
    db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("sort_order"),
    db.from("invoice_payments").select("*").eq("invoice_id", invoice.id).order("paid_on", { ascending: false }),
  ]);

  return {
    invoice,
    items: (items.data ?? []) as InvoiceItem[],
    payments: (payments.data ?? []) as InvoicePayment[],
  };
}

/**
 * The client's copy, by token.
 *
 * A draft never resolves. The link is handed out the moment an invoice is
 * created — copied into a message, pasted into an email — so a leaked or
 * guessed-at link for something still being written must show nothing at all
 * rather than a half-finished bill.
 */
export async function getInvoiceByToken(token: string): Promise<FullInvoice | LoadFailure> {
  if (!token || token.length < 20 || token.length > 128) return "not_found";

  const db = supabaseAdmin();
  const { data } = await db
    .from("invoices")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();

  if (!data) return "not_found";
  const invoice = data as Invoice;

  if (invoice.status === "draft") return "not_available";
  if (invoice.status === "void") return "not_available";

  return assemble(db, invoice);
}

/** The admin's own view, under RLS, by id. */
export async function getInvoiceById(db: SupabaseClient, id: string): Promise<FullInvoice | null> {
  const { data } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return assemble(db, data as Invoice);
}

export async function logInvoiceEvent(
  db: SupabaseClient,
  input: {
    invoiceId: string;
    type: InvoiceEventType;
    body?: string | null;
    actor?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  }
): Promise<void> {
  await db.from("invoice_events").insert({
    invoice_id: input.invoiceId,
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
 * Cheap and forgiving: a view that fails to record must never stop the page
 * rendering. The first view is worth knowing — it is the difference between
 * "they are ignoring me" and "it never reached them" — so it is stamped once
 * and an event is written once.
 */
export async function recordInvoiceView(
  full: FullInvoice,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  const inv = full.invoice;
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  try {
    await db
      .from("invoices")
      .update({
        first_viewed_at: inv.first_viewed_at ?? now,
        last_viewed_at: now,
        view_count: (inv.view_count ?? 0) + 1,
      })
      .eq("id", inv.id);

    if (!inv.first_viewed_at) {
      await logInvoiceEvent(db, {
        invoiceId: inv.id,
        type: "viewed",
        body: "Opened by the client for the first time.",
        actor: inv.client_email,
        metadata: { user_agent: userAgent ?? "" },
        ip,
      });
      full.invoice.first_viewed_at = now;
    }
    full.invoice.view_count = (inv.view_count ?? 0) + 1;
  } catch {
    // Telemetry is never worth a 500 on the client's own invoice.
  }
}

/**
 * Recomputes the stored totals from the lines that are actually in the table.
 *
 * Called after every write that touches lines. The totals columns exist so
 * the list screen can sum a hundred invoices without reading a thousand line
 * rows — they are a cache, and this is the only thing allowed to fill it.
 *
 * The old 0004 columns are kept in step too, because the Stripe webhook and
 * the campaign dashboard still read `launch_cents` and `hosting_cents`.
 */
export async function recomputeInvoiceTotals(db: SupabaseClient, invoiceId: string): Promise<void> {
  const { data } = await db
    .from("invoice_items")
    .select("item_kind, quantity, unit_price_cents")
    .eq("invoice_id", invoiceId);

  const totals = computeInvoice(
    (data ?? []).map((row) => ({
      item_kind: row.item_kind,
      quantity: Number(row.quantity),
      unit_price_cents: Number(row.unit_price_cents),
    }))
  );

  await db
    .from("invoices")
    .update({
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      recurring_cents: totals.recurringCents,
      launch_cents: totals.totalCents,
      hosting_cents: totals.recurringCents,
      amount_cents: totals.totalCents,
    })
    .eq("id", invoiceId);
}
