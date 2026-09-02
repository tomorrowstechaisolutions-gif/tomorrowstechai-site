import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createProposalCheckoutSession,
  stripeConfigured,
} from "@/lib/stripe/client";
import { amountDueAtSignature } from "./config";
import { formatMoney } from "./pricing";
import { logProposalEvent } from "./service";
import type { Proposal } from "./types";

/**
 * Turning "they signed" into "there is a link to pay".
 *
 * The invoice row is the same one the rest of the business uses, so a
 * proposal payment lands in the money tables exactly like every other sale
 * and the Stripe webhook can mark it paid without a second code path.
 *
 * Amounts are read from the proposal here, never from a request body. A
 * client who edits the page cannot change what Stripe is asked for.
 */

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "nothing_due" | "not_configured" | "failed"; error?: string };

export async function ensureProposalCheckout(
  proposal: Proposal
): Promise<CheckoutResult> {
  const dueNow = amountDueAtSignature(proposal);
  if (dueNow <= 0) return { ok: false, reason: "nothing_due" };
  if (!proposal.client_email) return { ok: false, reason: "failed", error: "No client email on this proposal." };
  if (!stripeConfigured()) return { ok: false, reason: "not_configured" };

  const db = supabaseAdmin();

  // ── The invoice row. Reused if this proposal already has one, so pressing
  // pay twice cannot raise two invoices for one signature.
  let invoiceId = proposal.invoice_id;
  let existingUrl: string | null = null;

  if (invoiceId) {
    const { data } = await db
      .from("invoices")
      .select("id, status, checkout_url")
      .eq("id", invoiceId)
      .maybeSingle();
    if (data) {
      if (data.status === "paid") return { ok: false, reason: "nothing_due" };
      existingUrl = (data.checkout_url as string | null) ?? null;
    } else {
      invoiceId = null;
    }
  }

  if (existingUrl) return { ok: true, url: existingUrl };

  if (!invoiceId) {
    const { data, error } = await db
      .from("invoices")
      .insert({
        lead_id: proposal.lead_id,
        customer_id: proposal.customer_id,
        deal_id: proposal.deal_id,
        kind: "launch",
        amount_cents: 0,
        launch_cents: dueNow,
        hosting_cents: proposal.recurring_price_cents,
        billing: "one_time",
        currency: proposal.currency,
        status: "sent",
        description: `Proposal ${proposal.proposal_number} — ${proposal.title}`,
        notes:
          proposal.payment_mode === "deposit"
            ? `Deposit against a one-time total of ${formatMoney(proposal.total_cents, proposal.currency)}.`
            : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, reason: "failed", error: error?.message ?? "Could not raise an invoice." };
    }
    invoiceId = data.id as string;
    await db.from("proposals").update({ invoice_id: invoiceId }).eq("id", proposal.id);
  }

  const dueLabel =
    proposal.payment_mode === "full"
      ? "payment in full"
      : `deposit of ${formatMoney(dueNow, proposal.currency)}`;

  try {
    const session = await createProposalCheckoutSession({
      proposalId: proposal.id,
      proposalNumber: proposal.proposal_number,
      invoiceId,
      title: proposal.title,
      email: proposal.client_email,
      businessName: proposal.client_business_name,
      dueNowCents: dueNow,
      dueLabel,
      recurringCents: proposal.recurring_price_cents,
      recurringInterval: proposal.recurring_interval,
      token: proposal.public_token,
    });

    if (!session.url) {
      return { ok: false, reason: "failed", error: "Stripe returned no checkout URL." };
    }

    await db.from("invoices").update({
      checkout_url: session.url,
      stripe_session_id: session.id,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    }).eq("id", invoiceId);

    await db.from("proposals").update({
      status: proposal.status === "paid" ? proposal.status : "payment_pending",
      stripe_session_id: session.id,
    }).eq("id", proposal.id);

    await logProposalEvent(db, {
      proposalId: proposal.id,
      type: "payment_started",
      body: `Checkout opened for ${formatMoney(dueNow, proposal.currency)} (${dueLabel}).`,
      actor: proposal.client_email,
      metadata: { invoice_id: invoiceId, session_id: session.id },
    });

    return { ok: true, url: session.url };
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
      error: err instanceof Error ? err.message : "Stripe rejected the request.",
    };
  }
}
