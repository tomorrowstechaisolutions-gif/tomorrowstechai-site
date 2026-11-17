import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invoiceUrl } from "@/lib/invoices/service";

/**
 * Everything a member sees, fetched server-side with the service role,
 * filtered to ONE customer id (from a verified session, see session.ts) and
 * limited to explicit columns. Internal fields (notes_internal, costs,
 * margins, owner, tags) are never selected. Draft invoices are never shown.
 */

export type MemberService = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priceCents: number;
  billingType: string;
  intervalMonths: number | null;
  startDate: string | null;
  nextBillingDate: string | null;
  endDate: string | null;
  billingStatus: string;
  /** Billed through a Stripe subscription, so the member can manage or cancel it themselves. */
  selfServe: boolean;
};

export type MemberInvoice = {
  id: string;
  number: string;
  title: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
  recurringCents: number;
  recurringInterval: string | null;
  paidCents: number;
  url: string | null;
};

export type MemberProfile = {
  name: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

export type MemberRequest = {
  id: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
};

const LINKABLE = new Set(["sent", "partial", "paid"]);

export async function memberServices(customerId: string): Promise<MemberService[]> {
  const { data } = await supabaseAdmin()
    .from("client_services")
    .select("id, status, billing_status, subscription_id, sale_price_cents, billing_type, interval_months, start_date, next_billing_date, end_date, catalog_items(name, short_description, subtitle)")
    .eq("customer_id", customerId)
    .order("start_date", { ascending: false });
  return (data ?? []).map((r) => {
    const svc = (Array.isArray(r.catalog_items) ? r.catalog_items[0] : r.catalog_items) as { name?: string; short_description?: string | null; subtitle?: string | null } | null;
    return {
      id: r.id,
      name: svc?.name ?? "Service",
      description: svc?.short_description || svc?.subtitle || null,
      status: r.status,
      priceCents: r.sale_price_cents ?? 0,
      billingType: r.billing_type ?? "one_time",
      intervalMonths: r.interval_months ?? null,
      startDate: r.start_date,
      nextBillingDate: r.next_billing_date,
      endDate: r.end_date,
      billingStatus: r.billing_status ?? "not_connected",
      selfServe: Boolean(r.subscription_id),
    };
  });
}

/** True when this client has a Stripe customer, so "Manage billing" can open. The id itself never leaves the server. */
export async function memberHasStripeBilling(customerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("customers").select("stripe_customer_id").eq("id", customerId).maybeSingle();
  return Boolean(data?.stripe_customer_id);
}

export async function memberInvoices(customerId: string): Promise<MemberInvoice[]> {
  const { data } = await supabaseAdmin()
    .from("invoices")
    .select("id, invoice_number, title, status, issue_date, due_date, total_cents, recurring_cents, recurring_interval, amount_paid_cents, public_token")
    .eq("customer_id", customerId)
    .neq("status", "draft")
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.invoice_number ?? "",
    title: r.title ?? "Invoice",
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    totalCents: r.total_cents ?? 0,
    recurringCents: r.recurring_cents ?? 0,
    recurringInterval: r.recurring_interval,
    paidCents: r.amount_paid_cents ?? 0,
    url: r.public_token && LINKABLE.has(r.status) ? invoiceUrl(r.public_token) : null,
  }));
}

export async function memberProfile(customerId: string): Promise<MemberProfile> {
  const { data } = await supabaseAdmin()
    .from("customers")
    .select("name, business_name, email, phone, city, state")
    .eq("id", customerId)
    .maybeSingle();
  return {
    name: data?.name ?? null,
    businessName: data?.business_name ?? null,
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    city: data?.city ?? null,
    state: data?.state ?? null,
  };
}

export async function memberRequests(customerId: string): Promise<MemberRequest[]> {
  const { data } = await supabaseAdmin()
    .from("portal_requests")
    .select("id, category, subject, status, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data ?? []).map((r) => ({ id: r.id, category: r.category, subject: r.subject, status: r.status, createdAt: r.created_at }));
}

/** What's still owed on an invoice, in cents (one-time part; recurring is billed by subscription). */
export function balanceCents(inv: MemberInvoice): number {
  if (!["sent", "partial"].includes(inv.status)) return 0;
  return Math.max(0, inv.totalCents - inv.paidCents) || (inv.recurringCents > 0 && inv.paidCents === 0 ? inv.recurringCents : 0);
}

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export const shortDate = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : "—";

export function cadence(billingType: string, months: number | null, interval?: string | null): string {
  if (interval === "year" || months === 12) return "/yr";
  if (billingType === "recurring" || interval === "month") return months && months > 1 ? ` every ${months} months` : "/mo";
  return " one-time";
}

// ── More services (catalog) ──────────────────────────────────────────────────

export type MemberOffer = {
  id: string;
  name: string;
  category: string;
  blurb: string | null;
  priceCents: number;
  setupCents: number;
  billingType: string;
  pricingMode: string;
  badge: string | null;
  featured: boolean;
  detailsUrl: string | null;
  requested: boolean;
};

const OFFER_CATEGORY: Record<string, string> = {
  websites: "Websites",
  hosting: "Hosting & support",
  support: "Hosting & support",
  ai: "AI & automation",
  automation: "AI & automation",
  integrations: "AI & automation",
  "business-systems": "Business systems",
  marketing: "Marketing & growth",
  branding: "Branding",
};
export const OFFER_ORDER = ["Websites", "AI & automation", "Business systems", "Marketing & growth", "Branding", "Hosting & support"];

/**
 * The public catalog, as a signed-in member sees it: only items marked
 * public and active, without anything this client already has running, and
 * flagged where they already have an open request. Only display fields are
 * selected (no notes, margins or internal pricing rules).
 */
export async function memberCatalog(customerId: string): Promise<MemberOffer[]> {
  const db = supabaseAdmin();
  const [{ data: items }, { data: owned }, { data: open }] = await Promise.all([
    db
      .from("catalog_items")
      .select("id, name, catalog_category, short_description, subtitle, from_cents, setup_fee_cents, billing_type, pricing_mode, badge, featured, most_popular, public_route, position")
      .eq("public_enabled", true)
      .eq("active", true)
      .eq("status", "active")
      .is("archived_at", null)
      .order("position", { ascending: true }),
    db.from("client_services").select("service_id").eq("customer_id", customerId).in("status", ["active", "paused"]),
    db.from("portal_requests").select("catalog_item_id").eq("customer_id", customerId).eq("status", "open").not("catalog_item_id", "is", null),
  ]);
  const have = new Set((owned ?? []).map((r) => r.service_id as string));
  const asked = new Set((open ?? []).map((r) => r.catalog_item_id as string));
  return (items ?? [])
    .filter((i) => !have.has(i.id) && OFFER_CATEGORY[i.catalog_category ?? ""])
    .map((i) => ({
      id: i.id,
      name: i.name,
      category: OFFER_CATEGORY[i.catalog_category as string],
      blurb: i.short_description || i.subtitle || null,
      priceCents: i.from_cents ?? 0,
      setupCents: i.setup_fee_cents ?? 0,
      billingType: i.billing_type ?? "one_time",
      pricingMode: i.pricing_mode ?? "custom_quote",
      badge: i.badge || (i.most_popular ? "Most popular" : null),
      featured: Boolean(i.featured),
      detailsUrl: i.public_route && i.public_route.startsWith("/") && i.public_route !== "/services" ? i.public_route : null,
      requested: asked.has(i.id),
    }));
}
