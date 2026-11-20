import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelPendingFollowups } from "@/lib/campaign/intake";

/**
 * The one way a lead (or a payer nobody had on file) becomes a client.
 *
 * There used to be four: the Stripe webhook, proposal conversion, marking a
 * lead Won by hand, and paying an invoice — and each set a different subset
 * of the same facts. One left the follow-up emails running to someone who had
 * already bought; one never closed the lead; paying an invoice did none of
 * it. They all call this now, so "is a client" means the same thing however
 * the sale arrived.
 *
 * What it guarantees, every time, and safely more than once:
 *   1. exactly one customers row — found before created, in the order
 *      explicit id → lead → Stripe customer → email;
 *   2. the lead is Won with a close date, the change is on its timeline, and
 *      its pending follow-up emails are cancelled;
 *   3. the deal that was sold (when one is named) is won;
 *   4. open invoices, proposals and deals from that lead point at the client,
 *      so a subscription started from one of them can find its owner.
 *
 * What it deliberately does not do: touch MRR, open a project, or book money.
 * Those depend on what was sold and stay with the caller.
 *
 * Works with either client — the service role in the webhook, or an admin's
 * own session in a server action (RLS lets an admin write all of these).
 */

type Db = SupabaseClient;

export type BecomeClientInput = {
  /** An existing client record, when the caller already knows it. */
  customerId?: string | null;
  leadId?: string | null;
  stripeCustomerId?: string | null;
  email?: string | null;
  name?: string | null;
  businessName?: string | null;
  phone?: string | null;
  /** Look for an existing client by email before creating one. */
  matchByEmail?: boolean;
  /** Extra columns for a NEW row only (company_id, owner, notes, mrr_cents…). */
  insertExtra?: Record<string, unknown>;
  /** The deal this sale closes, if there is one. */
  dealId?: string | null;
  /** Who did it — "stripe", or the admin's email. */
  actor: string;
  /** One line for the lead's timeline, e.g. "Paid. Status set to Won." */
  note: string;
  /** Why follow-ups were cancelled; recorded on the follow-up rows. */
  followupReason?: string;
};

export type BecomeClientResult = { customerId: string; created: boolean };

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

async function findCustomer(db: Db, input: BecomeClientInput): Promise<string | null> {
  if (input.customerId) return input.customerId;

  if (input.leadId) {
    const { data, error } = await db
      .from("customers").select("id").eq("lead_id", input.leadId).limit(1).maybeSingle();
    if (error) fail("Could not look up the client by lead", error);
    if (data) return data.id as string;
  }

  if (input.stripeCustomerId) {
    const { data, error } = await db
      .from("customers").select("id").eq("stripe_customer_id", input.stripeCustomerId).limit(1).maybeSingle();
    if (error) fail("Could not look up the client by Stripe customer", error);
    if (data) return data.id as string;
  }

  const email = input.email?.trim();
  if (input.matchByEmail && email) {
    // ilike with no wildcards is a case-insensitive equals. Escape the two
    // characters that would otherwise turn an address into a pattern.
    const exact = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await db
      .from("customers").select("id").ilike("email", exact).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) fail("Could not look up the client by email", error);
    if (data) return data.id as string;
  }

  return null;
}

export async function becomeClient(db: Db, input: BecomeClientInput): Promise<BecomeClientResult> {
  const now = new Date().toISOString();

  // The lead is read once: it fills in a new client row, and its current
  // status decides whether there is anything to close.
  let lead: {
    id: string; first_name: string | null; last_name: string | null; email: string | null;
    phone: string | null; business_name: string | null; lead_status: string | null;
  } | null = null;
  if (input.leadId) {
    const { data, error } = await db
      .from("leads")
      .select("id, first_name, last_name, email, phone, business_name, lead_status")
      .eq("id", input.leadId)
      .maybeSingle();
    if (error) fail("Could not read the lead", error);
    lead = data;
  }
  // A lead id that matches no row must not be written as a foreign key.
  const leadId = lead?.id ?? null;

  // ── 1. One client record.
  let customerId = await findCustomer(db, { ...input, leadId });
  let created = false;

  if (!customerId) {
    const leadName = lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : "";
    const row = {
      lead_id: leadId,
      name: input.name?.trim() || leadName || null,
      business_name: input.businessName?.trim() || lead?.business_name || null,
      email: input.email?.trim() || lead?.email || null,
      phone: input.phone?.trim() || lead?.phone || null,
      status: "active",
      won_at: now,
      ...(input.stripeCustomerId ? { stripe_customer_id: input.stripeCustomerId } : {}),
      ...(input.insertExtra ?? {}),
    };
    const { data, error } = await db.from("customers").insert(row).select("id").single();
    if (error || !data) {
      // 23505: another request created this client between the lookup and
      // the insert (lead_id and stripe_customer_id are unique). Use theirs.
      const raced = (error as { code?: string } | null)?.code === "23505"
        ? await findCustomer(db, { ...input, leadId })
        : null;
      if (!raced) fail("Could not create the client record", error);
      customerId = raced;
    } else {
      customerId = data.id as string;
      created = true;
    }
  }

  // ── 2. Close the lead.
  if (lead && lead.lead_status !== "Won") {
    const { error: leadError } = await db
      .from("leads").update({ lead_status: "Won", closed_at: now }).eq("id", lead.id);
    if (leadError) fail("Could not mark the lead Won", leadError);

    const { error: eventError } = await db.from("lead_events").insert({
      lead_id: lead.id, type: "revenue", body: input.note, actor: input.actor,
    });
    if (eventError) fail("Could not record the lead event", eventError);
  }
  // Every time, not only on the transition: a lead marked Won by another path
  // may still have follow-ups queued, and cancelling none is free.
  if (lead) await cancelPendingFollowups(lead.id, input.followupReason ?? "status:Won");

  // ── 3. The deal that was sold.
  if (input.dealId) {
    const { error } = await db
      .from("deals").update({ stage: "won", won_at: now, customer_id: customerId }).eq("id", input.dealId);
    if (error) fail("Could not mark the deal won", error);
  }

  // ── 4. Point the lead's open paperwork at the client. Only fills blanks.
  if (leadId) {
    for (const table of ["invoices", "proposals", "deals"] as const) {
      const { error } = await db
        .from(table).update({ customer_id: customerId }).eq("lead_id", leadId).is("customer_id", null);
      if (error) fail(`Could not link the lead's ${table} to the client`, error);
    }
  }

  return { customerId: customerId as string, created };
}
