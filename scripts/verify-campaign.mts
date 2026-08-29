import { computeMetrics, fmtMoney, fmtPercent, fmtMultiple } from "./_libs/metrics.ts";
import { scoreLead } from "./_libs/scoring.ts";
import { resolveRange, deviceFromUserAgent, inRange } from "./_libs/range.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(46)} got=${got}  want=${want}`);
};

// ── Scoring ──────────────────────────────────────────────────────────────
const hot = scoreLead({ currentWebsite: "no", timeline: "Immediately", services: ["Website","Lead Management","CRM"], phone: "(254) 555-0101", businessName: "Whitcomb Roofing" });
eq("hot lead score", hot.score, 80); // 25 no-site + 25 immediate + 10 phone + 5 business + 8 three-services + 7 CRM
const cold = scoreLead({ currentWebsite: "yes", timeline: "Just researching", services: ["Website"], phone: null, businessName: "Tejeda Pool Service" });
eq("researching-with-site score", cold.score, 10);
eq("score never exceeds 100", scoreLead({ currentWebsite: "no", timeline: "Immediately", services: ["Website","Lead Management","CRM","Automation","AI","E-commerce","Payments" as never,"Online Booking" as never], phone: "2545550101", businessName: "X" }).score, 100);
eq("empty submission scores 0", scoreLead({}).score, 0);
eq("reasons are attributable", hot.reasons.every(r => r.label && typeof r.points === "number"), true);

// ── Metrics, against the exact rows now in Supabase ──────────────────────
const spend = [
  { spend_cents: 500, impressions: 625, reach: 540, clicks: 14, landing_page_views: 11 },
  { spend_cents: 750, impressions: 610, reach: 505, clicks: 12, landing_page_views: 10 },
] as never[];
const leads = [
  { lead_status: "Won" }, { lead_status: "New" }, { lead_status: "New" },
] as never[];
const appointments = [{ status: "scheduled" }] as never[];
const revenue = [
  { kind: "initial", amount_cents: 39900 },
  { kind: "recurring", amount_cents: 2900 },
  { kind: "upsell", amount_cents: 120000 },
] as never[];

const m = computeMetrics({ spend, leads, appointments, revenue });
eq("ad spend", fmtMoney(m.adSpend), "$12.50");
eq("impressions", m.impressions, 1235);
eq("reach", m.reach, 1045);
eq("clicks", m.clicks, 26);
eq("landing page views", m.landingPageViews, 21);
eq("leads", m.leads, 3);
eq("qualified leads", m.qualifiedLeads, 1);
eq("sales", m.sales, 1);
eq("revenue", fmtMoney(m.revenue), "$1,628.00");
eq("CTR", fmtPercent(m.ctr), "2.11%");
eq("CPC", fmtMoney(m.cpc), "$0.48");
eq("landing page conversion", fmtPercent(m.landingPageConversionRate), "14.29%");
eq("cost per lead", fmtMoney(m.costPerLead), "$4.17");
eq("lead to appointment", fmtPercent(m.leadToAppointmentRate), "33.33%");
eq("appointment to sale", fmtPercent(m.appointmentToSaleRate), "100.00%");
eq("CAC", fmtMoney(m.customerAcquisitionCost), "$12.50");
eq("ROAS", fmtMultiple(m.roas), "130.24x".replace("x","×"));

// Zero denominators must read "—", never 0% or Infinity.
const empty = computeMetrics({ spend: [], leads: [], appointments: [], revenue: [] });
eq("no spend -> CPL is em dash", fmtMoney(empty.costPerLead), "—");
eq("no spend -> ROAS is em dash", fmtMultiple(empty.roas), "—");
eq("no impressions -> CTR is em dash", fmtPercent(empty.ctr), "—");

// ── Date range ───────────────────────────────────────────────────────────
const r30 = resolveRange("30d");
eq("30d span is 30 days", (Date.parse(r30.toDate) - Date.parse(r30.fromDate)) / 86400000, 29);
eq("bad range key falls back to 30d", resolveRange("garbage").key, "30d");
eq("custom range flips reversed dates", resolveRange("custom", "2026-08-20", "2026-08-01").fromDate, "2026-08-01");
eq("today is inside 30d", inRange(new Date().toISOString(), r30), true);
eq("iphone UA -> mobile", deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "mobile");
eq("windows UA -> desktop", deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
eq("ipad UA -> tablet", deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0)"), "tablet");

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
