import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { monthToDate } from "./period";
import {
  REVENUE_CATEGORIES,
  type RevenueCategory,
} from "@/lib/supabase/types";

/**
 * Section 10 — Products & Services performance.
 *
 * `revenue_events.category` is the company's real service taxonomy — the
 * catalog, the invoices and the campaign dashboard all already speak it. The
 * landing-page service checkboxes are a narrower vocabulary, so they are
 * translated into it here rather than being shown as a second, competing list.
 */

export const SERVICE_LABELS: Record<RevenueCategory, string> = {
  launch_package: "Websites",
  hosting: "Hosting",
  crm: "CRM",
  ai_automation: "AI & Automation",
  custom_app: "Apps",
  ecommerce: "Ecommerce",
  dashboard: "Dashboards",
  social: "Social",
  marketing: "Marketing",
  development: "Custom Software",
  other: "Other",
};

/** Lead-form interest → service line. */
const INTEREST_TO_SERVICE: Record<string, RevenueCategory> = {
  Website: "launch_package",
  "Online Booking": "launch_package",
  Payments: "launch_package",
  "Lead Management": "crm",
  CRM: "crm",
  Automation: "ai_automation",
  AI: "ai_automation",
  "E-commerce": "ecommerce",
  Other: "other",
};

export type ServicePerformance = {
  key: RevenueCategory;
  label: string;
  /** Leads that ticked something mapping to this line, this month. */
  leads: number;
  /** Money events booked against this line, this month. */
  sales: number;
  revenueCents: number;
  /** sales ÷ leads. null when no leads showed interest — never 0%. */
  conversion: number | null;
  /** True when the catalog sells it, so a line with no activity still shows. */
  inCatalog: boolean;
};

export async function loadServicePerformance(
  sb: SupabaseClient
): Promise<ServicePerformance[]> {
  const { current } = monthToDate();

  const [revenue, leads, catalog] = await Promise.all([
    sb
      .from("revenue_events")
      .select("category, amount_cents")
      .gte("occurred_at", current.fromIso)
      .lt("occurred_at", current.toIso)
      .then((r) => unwrap(r, "revenue by service")),
    sb
      .from("leads")
      .select("services_interested")
      .gte("created_at", current.fromIso)
      .lt("created_at", current.toIso)
      .then((r) => unwrap(r, "lead interest")),
    sb
      .from("catalog_items")
      .select("category")
      .eq("active", true)
      .then((r) => unwrap(r, "catalog")),
  ]);

  const revenueCents = new Map<RevenueCategory, number>();
  const sales = new Map<RevenueCategory, number>();
  for (const r of revenue as { category: RevenueCategory; amount_cents: number }[]) {
    revenueCents.set(r.category, (revenueCents.get(r.category) ?? 0) + r.amount_cents);
    sales.set(r.category, (sales.get(r.category) ?? 0) + 1);
  }

  const leadCounts = new Map<RevenueCategory, number>();
  for (const l of leads as { services_interested: string[] | null }[]) {
    // One lead interested in three things counts once against each — they are
    // three separate opportunities to sell.
    const seen = new Set<RevenueCategory>();
    for (const interest of l.services_interested ?? []) {
      const key = INTEREST_TO_SERVICE[interest];
      if (key) seen.add(key);
    }
    for (const key of seen) leadCounts.set(key, (leadCounts.get(key) ?? 0) + 1);
  }

  const inCatalog = new Set(
    (catalog as { category: RevenueCategory }[]).map((c) => c.category)
  );

  return REVENUE_CATEGORIES.map((key) => {
    const leadCount = leadCounts.get(key) ?? 0;
    const saleCount = sales.get(key) ?? 0;
    return {
      key,
      label: SERVICE_LABELS[key],
      leads: leadCount,
      sales: saleCount,
      revenueCents: revenueCents.get(key) ?? 0,
      conversion: leadCount > 0 ? saleCount / leadCount : null,
      inCatalog: inCatalog.has(key),
    };
  })
    .filter((s) => s.leads > 0 || s.sales > 0 || s.inCatalog)
    .sort((a, b) => b.revenueCents - a.revenueCents || b.leads - a.leads);
}
