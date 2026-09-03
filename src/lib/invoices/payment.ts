import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createInvoiceCheckoutSession, stripeConfigured } from "@/lib/stripe/client";
import { formatMoney, outstandingCents } from "./pricing";
import { logInvoiceEvent } from "./service";
import type { Invoice } from "./types";

/**
 * Turning "here is your invoice" into "here is a link to pay it".
 *
 * Amounts are read from the invoice row the server just loaded, never from a
 * request body. A client who edits the page cannot change what Stripe is
 * asked for.
 *
 * The link is cached on the row. Stripe sessions expire after 24 hours, so a
 * stored URL that has gone stale is replaced rather than handed out again —
 * an invoice link the client clicks a week later has to work.
 */

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "nothing_due" | "not_configured" | "failed"; error?: string };

function stillFresh(inv: Invoice): boolean {
  if (!inv.checkout_url || !inv.expires_at) return false;
  return new Date(inv.expires_at).getTime() > Date.now() + 60_000;
}

/** Days between now and when the recurring line is due to start. */
function trialDays(startsOn: string | null): number {
  if (!startsOn) return 0;
  const diff = new Date(`${startsOn}T12:00:00Z`).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.min(730, Math.ceil(diff / 86_400_000));
}

export async function ensureInvoiceCheckout(inv: Invoice): Promise<CheckoutResult> {
  const dueNow = outstandingCents(inv);
  const recurring = Math.max(0, inv.recurring_cents);

  if (dueNow <= 0 && recurring <= 0) return { ok: false, reason: "nothing_due" };
  if (inv.status === "paid" && recurring <= 0) return { ok: false, reason: "nothing_due" };
  if (!inv.client_email) {
    return { ok: false, reason: "failed", error: "This invoice has no client email address." };
  }
  if (!stripeConfigured()) return { ok: false, reason: "not_configured" };

  if (stillFresh(inv)) return { ok: true, url: inv.checkout_url as string };

  const db = supabaseAdmin();

  try {
    const session = await createInvoiceCheckoutSession({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      title: inv.title,
      email: inv.client_email,
      businessName: inv.client_business_name,
      dueNowCents: dueNow,
      recurringCents: recurring,
      recurringInterval: inv.recurring_interval,
      recurringStartDays: trialDays(inv.recurring_starts_on),
      token: inv.public_token,
    });

    if (!session.url) {
      return { ok: false, reason: "failed", error: "Stripe returned no checkout URL." };
    }

    await db
      .from("invoices")
      .update({
        checkout_url: session.url,
        stripe_session_id: session.id,
        expires_at: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
      })
      .eq("id", inv.id);

    await logInvoiceEvent(db, {
      invoiceId: inv.id,
      type: "payment_started",
      body: `Checkout opened for ${formatMoney(dueNow, inv.currency)}${
        recurring > 0 ? ` plus ${formatMoney(recurring, inv.currency)}/${inv.recurring_interval}` : ""
      }.`,
      actor: inv.client_email,
      metadata: { session_id: session.id },
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
