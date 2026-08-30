import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import { monthToDate } from "./period";
import { computeMetrics, type CampaignMetrics } from "@/lib/campaign/metrics";
import type {
  Appointment,
  CampaignSpend,
  Lead,
  RevenueEvent,
} from "@/lib/supabase/types";

/**
 * Section 8 — Marketing performance.
 *
 * Deliberately built on the same computeMetrics() the campaign dashboard
 * already uses. Two functions computing cost-per-lead slightly differently is
 * how a business ends up arguing with its own numbers.
 */

export type CampaignLine = {
  campaign: string;
  platform: string;
  spendCents: number;
  leads: number;
  revenueCents: number;
  costPerLeadCents: number | null;
  roas: number | null;
};

export type MarketingSnapshot = {
  metrics: CampaignMetrics;
  campaigns: CampaignLine[];
  /** True when there is no spend recorded at all this month. */
  noSpend: boolean;
};

export async function loadMarketing(sb: SupabaseClient): Promise<MarketingSnapshot> {
  const { current } = monthToDate();

  const [spend, leads, appointments, revenue] = await Promise.all([
    sb
      .from("campaign_spend")
      .select("*")
      .gte("date", current.fromDate)
      .lte("date", current.toDate)
      .then((r) => unwrap(r, "campaign spend")),
    sb
      .from("leads")
      .select("id, campaign, lead_status, created_at")
      .gte("created_at", current.fromIso)
      .lt("created_at", current.toIso)
      .then((r) => unwrap(r, "campaign leads")),
    sb
      .from("appointments")
      .select("id, status, scheduled_at, created_at")
      .gte("created_at", current.fromIso)
      .lt("created_at", current.toIso)
      .then((r) => unwrap(r, "appointments")),
    sb
      .from("revenue_events")
      .select("kind, category, amount_cents, campaign, occurred_at")
      .gte("occurred_at", current.fromIso)
      .lt("occurred_at", current.toIso)
      .then((r) => unwrap(r, "revenue")),
  ]);

  const spendRows = spend as CampaignSpend[];
  const leadRows = leads as Pick<Lead, "id" | "campaign" | "lead_status" | "created_at">[];
  const revenueRows = revenue as Pick<
    RevenueEvent,
    "kind" | "category" | "amount_cents" | "campaign" | "occurred_at"
  >[];

  const metrics = computeMetrics({
    spend: spendRows,
    leads: leadRows as Lead[],
    appointments: appointments as Appointment[],
    revenue: revenueRows as RevenueEvent[],
  });

  // Per campaign. Keyed on the campaign name that spend, leads and revenue
  // all already carry — no join table, no second source of truth.
  const names = new Set<string>();
  for (const s of spendRows) names.add(s.campaign);
  for (const l of leadRows) if (l.campaign) names.add(l.campaign);
  for (const r of revenueRows) if (r.campaign) names.add(r.campaign);

  const campaigns: CampaignLine[] = [...names]
    .map((name) => {
      const spendCents = spendRows
        .filter((s) => s.campaign === name)
        .reduce((t, s) => t + s.spend_cents, 0);
      const leadCount = leadRows.filter((l) => l.campaign === name).length;
      const revenueCents = revenueRows
        .filter((r) => r.campaign === name)
        .reduce((t, r) => t + r.amount_cents, 0);

      return {
        campaign: name,
        // Every campaign_spend row today comes from Meta. When a Google or
        // other source starts writing here this reads the row instead.
        platform: "Meta",
        spendCents,
        leads: leadCount,
        revenueCents,
        costPerLeadCents: leadCount > 0 && spendCents > 0 ? spendCents / leadCount : null,
        roas: spendCents > 0 ? revenueCents / spendCents : null,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents || b.leads - a.leads);

  return {
    metrics,
    campaigns,
    noSpend: spendRows.length === 0,
  };
}
