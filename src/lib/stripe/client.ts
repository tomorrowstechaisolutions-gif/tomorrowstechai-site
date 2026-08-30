import "server-only";
import crypto from "node:crypto";
import {
  OFFER_PRICE_CENTS,
  HOSTING_FROM_CENTS,
  HOSTING_TRIAL_DAYS,
  CAMPAIGN_NAME,
} from "@/lib/campaign/config";

/**
 * Stripe, over plain fetch.
 *
 * No SDK on purpose. The build machine that maintains this repo has no
 * package-registry access, so adding a dependency means a lockfile that can
 * only be updated somewhere else — and the two calls we actually make
 * (create a Checkout Session, verify a webhook signature) are a form POST and
 * an HMAC. capi.ts already talks to Meta the same way.
 *
 * The secret key is read here and never leaves the server. Nothing in this
 * file may be imported from a client component.
 */

const API = "https://api.stripe.com/v1";
const API_VERSION = "2025-04-30.basil";

/** Stripe is optional. Without a key the admin shows the setup notice. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  return key;
}

export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.tomorrowstechai.com"
  ).replace(/\/+$/, "");
}

/**
 * Stripe wants deep objects as bracketed form keys:
 *   line_items[0][price]=price_123
 * Arrays are indexed, objects are named, null/undefined are dropped.
 */
export function encodeForm(
  value: unknown,
  prefix = "",
  out: string[] = []
): string {
  if (value === null || value === undefined) return out.join("&");

  if (Array.isArray(value)) {
    value.forEach((item, i) => encodeForm(item, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }

  return out.join("&");
}

type StripeError = { error?: { message?: string; type?: string; code?: string } };

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<T> {
  const body = method === "POST" && params ? encodeForm(params) : undefined;
  const query =
    method === "GET" && params ? `?${encodeForm(params)}` : "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    "Stripe-Version": API_VERSION,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  // Replaying a create with the same key returns the original object rather
  // than charging twice — which is what makes a retried "send link" safe.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${API}${path}${query}`, { method, headers, body });
  const json = (await res.json().catch(() => ({}))) as T & StripeError;

  if (!res.ok) {
    // Never log the key. Stripe's message is safe and specific.
    const message = json?.error?.message || `Stripe HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

type StripePrice = { id: string; active?: boolean };
type StripeList<T> = { data: T[] };

/**
 * Finds a price by lookup_key, creating it once if it isn't there.
 *
 * Doing it here rather than asking John to create products by hand means the
 * amounts always come from campaign/config.ts — the same constants the
 * landing page prints. A price the ad promises and a price Stripe charges
 * can never drift apart.
 */
async function findOrCreatePrice(opts: {
  lookupKey: string;
  productName: string;
  unitAmount: number;
  recurringMonthly: boolean;
}): Promise<string> {
  const existing = await stripeRequest<StripeList<StripePrice>>(
    "GET",
    "/prices",
    { lookup_keys: [opts.lookupKey], limit: 1, active: true }
  );
  if (existing.data?.[0]?.id) return existing.data[0].id;

  const created = await stripeRequest<StripePrice>(
    "POST",
    "/prices",
    {
      currency: "usd",
      unit_amount: opts.unitAmount,
      lookup_key: opts.lookupKey,
      product_data: { name: opts.productName },
      ...(opts.recurringMonthly ? { recurring: { interval: "month" } } : {}),
    },
    `price:${opts.lookupKey}`
  );

  return created.id;
}

export const LAUNCH_LOOKUP_KEY = "ttai_business_launch_399";
export const HOSTING_LOOKUP_KEY = "ttai_hosting_monthly_29";

export async function launchPriceId(): Promise<string> {
  return findOrCreatePrice({
    lookupKey: LAUNCH_LOOKUP_KEY,
    productName: `${CAMPAIGN_NAME} — one-time launch`,
    unitAmount: OFFER_PRICE_CENTS,
    recurringMonthly: false,
  });
}

export async function hostingPriceId(): Promise<string> {
  return findOrCreatePrice({
    lookupKey: HOSTING_LOOKUP_KEY,
    productName: "Hosting & management",
    unitAmount: HOSTING_FROM_CENTS,
    recurringMonthly: true,
  });
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  expires_at?: number;
};

/**
 * One link: $399 today, then $29/month starting 30 days from now.
 *
 * Checkout in subscription mode bills one-time line items on the first
 * invoice, so the customer is charged exactly $399 today. The recurring line
 * sits at $0 through the trial, and Stripe raises the first $29 invoice when
 * the trial ends — which the webhook books as recurring revenue then, not now.
 *
 * A card is still collected up front, because there is an amount due today.
 */
export async function createCheckoutSession(opts: {
  leadId: string;
  invoiceId: string;
  email: string;
  businessName?: string | null;
  successPath?: string;
  cancelPath?: string;
}): Promise<CheckoutSession> {
  const [launch, hosting] = await Promise.all([
    launchPriceId(),
    hostingPriceId(),
  ]);

  const origin = siteOrigin();

  return stripeRequest<CheckoutSession>(
    "POST",
    "/checkout/sessions",
    {
      mode: "subscription",
      customer_email: opts.email,
      line_items: [
        { price: launch, quantity: 1 },
        { price: hosting, quantity: 1 },
      ],
      // Both copies matter: session metadata is on checkout.session.completed,
      // subscription metadata survives onto every future invoice.paid.
      metadata: {
        lead_id: opts.leadId,
        invoice_id: opts.invoiceId,
        business_name: opts.businessName ?? "",
      },
      subscription_data: {
        trial_period_days: HOSTING_TRIAL_DAYS,
        metadata: { lead_id: opts.leadId, invoice_id: opts.invoiceId },
      },
      success_url: `${origin}${opts.successPath ?? "/business-launch/thank-you"}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${opts.cancelPath ?? "/business-launch"}?checkout=cancelled`,
      allow_promotion_codes: true,
    },
    // One live link per invoice row. Pressing the button twice reuses it.
    `checkout:${opts.invoiceId}`
  );
}

/**
 * Verifies the Stripe-Signature header against the RAW request body.
 *
 * Anything that fails here is treated as hostile and dropped — an unverified
 * webhook could otherwise mark invoices paid and open jobs for free.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  toleranceSeconds = 300
): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = header.split(",").reduce<Record<string, string[]>>((acc, p) => {
    const [k, v] = p.split("=");
    if (!k || !v) return acc;
    (acc[k.trim()] ||= []).push(v.trim());
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}
