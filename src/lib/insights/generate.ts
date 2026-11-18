import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinanceOverview } from "@/lib/finance/overview";
import { loadSubscriptions } from "@/lib/finance/subscriptions";
import { loadExpenses } from "@/lib/finance/expenses";
import { loadLeadAnalytics } from "@/lib/analytics/lead-funnel";
import { loadInsights } from "@/lib/dashboard/insights";
import { chicagoDate } from "@/lib/time/chicago";

/**
 * AI insights generator.
 *
 * Builds a numbers-only snapshot of the business from the same loaders the
 * admin pages use, hands it to a model, and stores up to six insights in
 * `ai_insights`. The model PROPOSES — every insight is a recommendation with
 * the numbers behind it; nothing here changes a lead, invoice or setting.
 *
 * Honesty rules baked into the prompt: only facts present in the snapshot,
 * no invented numbers, small samples called small. Each insight carries its
 * evidence in `metric` so the history page can show why it was said.
 *
 * No names, emails or phone numbers go to the model: the snapshot carries
 * counts, totals and business names of existing clients only.
 */

export const INSIGHT_MODEL = () => process.env.INSIGHTS_MODEL || "gpt-5.4-mini";

/** Pages an insight may link to. Anything else is dropped. */
const LINKS: Record<string, string> = {
  dashboard: "/admin",
  leads: "/admin/leads",
  lead_analytics: "/admin/intelligence/leads",
  finance: "/admin/finance",
  subscriptions: "/admin/finance/subscriptions",
  expenses: "/admin/finance/expenses",
  invoices: "/admin/invoices",
  clients: "/admin/clients",
  social: "/admin/marketing/social",
  blog: "/admin/blog",
  ad_spend: "/admin/marketing/spend",
  pipeline: "/admin/pipeline",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insights"],
  properties: {
    insights: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "severity", "title", "body", "link", "evidence"],
        properties: {
          kind: { type: "string", enum: ["opportunity", "action", "marketing", "revenue", "risk", "system"] },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          title: { type: "string", description: "One line, under 90 characters, specific, includes the key number." },
          body: { type: "string", description: "2-3 plain sentences: what the numbers show, why it matters, the one next step to consider." },
          link: { type: "string", enum: Object.keys(LINKS) },
          evidence: { type: "array", items: { type: "string" }, description: "The exact snapshot figures this rests on, e.g. 'mrr_cents: 4900'." },
        },
      },
    },
  },
} as const;

const PROMPT = `You are the operating analyst for Tomorrow's Tech AI, a small Central Texas consultancy that builds
websites, workflow systems and AI tools for contractors and field-service businesses. The owner, John, runs it
mostly solo. Read the JSON snapshot and write the few insights that would most change what he does this week.

Rules:
- Use ONLY numbers present in the snapshot. Money fields ending in _usd are US dollars; write them as dollars ($49, $1,709.56). Never estimate, extrapolate or invent figures, clients or events.
- Every insight must cite its figures in "evidence" using the snapshot's field names and values.
- Recommend, never claim to have acted. Phrase next steps as suggestions ("Consider…", "Worth…").
- Call small samples small (fewer than 5 leads or one month of data is a small sample).
- Skip anything already obvious from a single dashboard tile unless it needs action.
- Don't repeat the rule-based insights listed under "rule_insights_already_shown".
- Plain, direct, peer-to-peer voice. No hype, no exclamation marks, no generic advice.
- Fewer is better: 2 strong insights beat 6 weak ones. Return an empty list if nothing is worth saying.`;

/** The facts the model sees. Counts and totals only. */
export async function buildSnapshot(sb: SupabaseClient) {
  const [fin, subs, exp, leads, rules, social, invoices] = await Promise.all([
    loadFinanceOverview(sb, "mtd"),
    loadSubscriptions(sb),
    loadExpenses(sb, "ytd"),
    loadLeadAnalytics(sb, "90d", "channel"),
    loadInsights(sb, 10).catch(() => []),
    sb.from("social_posts").select("status, created_at").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
    sb.from("invoices").select("status, total_cents, recurring_cents, due_date, amount_paid_cents").in("status", ["draft", "sent", "partial"]),
  ]);
  const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});

  return toDollars({
    today: chicagoDate(),
    finance_month_to_date: {
      source: fin.source,
      revenue_cents: fin.revenueCents,
      revenue_same_days_last_month_cents: fin.revenuePrevCents,
      expenses_cents: fin.expensesCents,
      net_cents: fin.netCents,
      cash_in_bank_cents: fin.source === "bank" ? fin.cashCents : null,
      outstanding_invoices_cents: fin.outstandingCents,
      overdue_invoices_cents: fin.overdueCents,
      pipeline_weighted_cents: fin.pipelineWeightedCents,
      pipeline_open_deals: fin.pipelineCount,
      revenue_by_source: fin.revenueByCategory,
    },
    recurring: {
      mrr_cents: subs.mrrCents,
      mrr_charging_in_stripe_cents: subs.collectingCents,
      active_subscriptions: subs.activeCount,
      subscriptions_needing_attention: subs.active.filter((s) => s.problem).map((s) => ({ client: s.client, service: s.service, monthly_cents: s.monthlyCents, problem: s.problem })),
      paused_or_ended: subs.inactive.length,
    },
    expenses_year_to_date: {
      spent_cents: exp.spentCents,
      paid_personally_cents: exp.personalCents,
      business_owes_owner_cents: exp.owedTotalCents,
      receipts_waiting_review: exp.reviewCount,
      mercury_charges_missing_receipts: exp.missingReceipts,
      by_category: exp.byCategory,
    },
    leads_last_90_days: {
      real_leads: leads.total,
      spam_or_test_hidden: leads.hidden,
      previous_90_days: leads.previousTotal,
      funnel: leads.funnel,
      won: leads.won,
      lost: leads.lost,
      median_first_response_minutes: leads.medianResponseMins,
      by_channel: leads.breakdown.map((b) => ({ channel: b.key, leads: b.leads, talked_to: b.contacted, qualified: b.qualified, won: b.won })),
      lost_reasons: leads.lostReasons,
      current_statuses: leads.statusNow,
      revenue_from_leads_cents: leads.revenueCents,
      clients_linked_to_a_lead: leads.linkedClients,
    },
    open_invoices: (invoices.data ?? []).map((i) => ({ status: i.status, total_cents: i.total_cents, recurring_cents: i.recurring_cents, due: i.due_date, paid_cents: i.amount_paid_cents })),
    social_posts_last_30_days_by_status: tally((social.data ?? []).map((p) => p.status as string)),
    rule_insights_already_shown: rules.map((r) => r.title),
  });
}

/**
 * Money goes to the model in dollars, never cents: given `mrr_cents: 4900`
 * a model will happily say "$4,900 MRR". Every `*_cents` / `cents` key
 * becomes `*_usd` / `usd` with the value divided by 100.
 */
function toDollars<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toDollars) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if ((k === "cents" || k.endsWith("_cents")) && (typeof v === "number" || v === null)) {
      out[k === "cents" ? "usd" : k.replace(/_cents$/, "_usd")] = v === null ? null : Math.round(v) / 100;
    } else out[k] = toDollars(v);
  }
  return out as T;
}

export type GenerateResult = { created: number; skipped: number; model: string; preview?: unknown[] };

/** `save: false` runs everything but the insert and returns what would be stored. */
export async function generateInsights(sb: SupabaseClient, opts: { save?: boolean } = {}): Promise<GenerateResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY isn't set, so insights can't be generated.");
  const model = INSIGHT_MODEL();
  const snapshot = await buildSnapshot(sb);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
      text: { format: { type: "json_schema", name: "insights", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; output?: Array<{ content?: Array<{ type: string; text?: string }> }> };
  if (!res.ok) throw new Error(`Insight model failed (HTTP ${res.status}): ${body.error?.message ?? "no detail"}`);
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("The insight model returned nothing.");
  const parsed = JSON.parse(text) as { insights: Array<{ kind: string; severity: string; title: string; body: string; link: string; evidence: string[] }> };

  // Don't repeat an insight with the same title from the last two weeks.
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: recent } = await sb.from("ai_insights").select("title").gte("created_at", since);
  const seen = new Set((recent ?? []).map((r) => r.title.trim().toLowerCase()));

  const validUntil = new Date(Date.now() + 8 * 86_400_000).toISOString();
  const rows = parsed.insights
    .filter((i) => !seen.has(i.title.trim().toLowerCase()))
    .map((i) => ({
      kind: i.kind,
      severity: i.severity,
      title: i.title.slice(0, 200),
      body: i.body.slice(0, 1500),
      href: LINKS[i.link] ?? null,
      metric: { evidence: i.evidence.slice(0, 8), snapshot_date: snapshot.today },
      generated_by: "ai",
      model,
      status: "new",
      valid_until: validUntil,
    }));
  if (opts.save === false) return { created: 0, skipped: parsed.insights.length - rows.length, model, preview: rows };
  if (rows.length) {
    const { error } = await sb.from("ai_insights").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { created: rows.length, skipped: parsed.insights.length - rows.length, model };
}
