import type { CampaignSpend, Lead, Appointment, RevenueEvent } from "@/lib/supabase/types";

export type MetricInputs = {
  spend: CampaignSpend[];
  leads: Lead[];
  appointments: Appointment[];
  revenue: RevenueEvent[];
  /** Landing page views measured client-side, if we have them. Falls back to
   *  the landing_page_views reported on the spend rows. */
  landingPageViews?: number;
};

export type CampaignMetrics = {
  adSpend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  leads: number;
  qualifiedLeads: number;
  appointments: number;
  sales: number;
  revenue: number;
  initialRevenue: number;
  recurringRevenue: number;
  upsellRevenue: number;
  ctr: number | null;
  cpc: number | null;
  landingPageConversionRate: number | null;
  costPerLead: number | null;
  leadToAppointmentRate: number | null;
  appointmentToSaleRate: number | null;
  customerAcquisitionCost: number | null;
  roas: number | null;
};

const cents = (n: number) => n / 100;

/** null rather than 0 or Infinity when the denominator is zero — the admin
 *  renders those as "—" so an empty day never looks like a 0% conversion. */
const ratio = (num: number, den: number): number | null =>
  den > 0 ? num / den : null;

/**
 * "Qualified" means a human moved the lead past Contacted. Lead score does
 * not qualify anyone on its own.
 */
const QUALIFIED_STATUSES = new Set([
  "Qualified",
  "Demo Scheduled",
  "Proposal/Checkout Sent",
  "Won",
]);

export function computeMetrics({
  spend,
  leads,
  appointments,
  revenue,
  landingPageViews,
}: MetricInputs): CampaignMetrics {
  const adSpend = cents(spend.reduce((s, r) => s + r.spend_cents, 0));
  const impressions = spend.reduce((s, r) => s + r.impressions, 0);
  const reach = spend.reduce((s, r) => s + r.reach, 0);
  const clicks = spend.reduce((s, r) => s + r.clicks, 0);
  const lpv =
    landingPageViews ?? spend.reduce((s, r) => s + r.landing_page_views, 0);

  const leadCount = leads.length;
  const qualified = leads.filter((l) => QUALIFIED_STATUSES.has(l.lead_status)).length;
  const appts = appointments.filter((a) => a.status !== "cancelled").length;
  const sales = leads.filter((l) => l.lead_status === "Won").length;

  const initialRevenue = cents(
    revenue.filter((r) => r.kind === "initial").reduce((s, r) => s + r.amount_cents, 0)
  );
  const recurringRevenue = cents(
    revenue.filter((r) => r.kind === "recurring").reduce((s, r) => s + r.amount_cents, 0)
  );
  const upsellRevenue = cents(
    revenue.filter((r) => r.kind === "upsell").reduce((s, r) => s + r.amount_cents, 0)
  );
  const totalRevenue = initialRevenue + recurringRevenue + upsellRevenue;

  return {
    adSpend,
    impressions,
    reach,
    clicks,
    landingPageViews: lpv,
    leads: leadCount,
    qualifiedLeads: qualified,
    appointments: appts,
    sales,
    revenue: totalRevenue,
    initialRevenue,
    recurringRevenue,
    upsellRevenue,
    ctr: ratio(clicks, impressions),
    cpc: ratio(adSpend, clicks),
    landingPageConversionRate: ratio(leadCount, lpv),
    costPerLead: ratio(adSpend, leadCount),
    leadToAppointmentRate: ratio(appts, leadCount),
    appointmentToSaleRate: ratio(sales, appts),
    customerAcquisitionCost: ratio(adSpend, sales),
    roas: ratio(totalRevenue, adSpend),
  };
}

export const fmtMoney = (n: number | null, digits = 2) =>
  n === null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

export const fmtPercent = (n: number | null, digits = 2) =>
  n === null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`;

export const fmtNumber = (n: number | null) =>
  n === null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US");

export const fmtMultiple = (n: number | null) =>
  n === null || Number.isNaN(n) ? "—" : `${n.toFixed(2)}×`;
