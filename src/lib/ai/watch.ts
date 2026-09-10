import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkAllProviders } from "./providers";
import { OBSERVATION_WINDOW_DAYS, DEFAULT_ERROR_WARN_PCT, DEFAULT_ERROR_CRITICAL_PCT } from "./health";
import { MICRO_PER_DOLLAR } from "./types";

/**
 * The standing job behind AI Solutions.
 *
 * Three things happen here and nothing else:
 *
 *   1. Each enabled provider is checked for real and its answer stored, so
 *      the board can say when it last learned anything rather than implying
 *      it knows right now.
 *   2. Thresholds the operator set — error rate, monthly cost, monthly
 *      tokens — are compared against what was actually recorded, and an
 *      alert is opened when one is crossed.
 *   3. Two conditions nobody sets by hand are checked: a knowledge source
 *      past its own refresh window, and a model with a retirement date
 *      inside the next sixty days.
 *
 * What this job deliberately does NOT do is stop anything. Crossing a spend
 * limit raises an alert; it does not pause a client's assistant. An AI going
 * silent because a number moved is a worse outage than the bill, and a
 * shutdown nobody chose is not a safety feature.
 *
 * Alerts are deduplicated on (solution, kind, open): a threshold that stays
 * crossed for a week is one alert that stays open, not seven.
 */

const DAY = 86_400_000;
const DEPRECATION_HORIZON_DAYS = 60;

export type WatchResult = {
  providers: Record<string, string>;
  solutionsExamined: number;
  alertsOpened: number;
  alertsResolved: number;
  errors: string[];
};

type AlertDraft = {
  solutionId: string | null;
  providerKey: string | null;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  metric: Record<string, number | string | null>;
};

export async function runAiWatch(): Promise<WatchResult> {
  const sb = supabaseAdmin();
  const errors: string[] = [];

  const providers = await checkAllProviders().catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : "Provider checks failed.");
    return {} as Record<string, { status: string; detail: string }>;
  });

  const drafts: AlertDraft[] = [];

  // A provider that answered "down" is worth an alert of its own: every
  // solution on it is affected, and one alert beats one per solution.
  for (const [key, result] of Object.entries(providers)) {
    if (result.status === "down") {
      drafts.push({
        solutionId: null,
        providerKey: key,
        kind: "provider_disconnected",
        severity: "critical",
        title: `${key} is not answering`,
        detail: result.detail,
        metric: { status: result.status },
      });
    }
  }

  const { data: solutions, error: solutionsError } = await sb
    .from("ai_solutions")
    .select(
      "id, name, model, provider_key, status, is_archived, error_rate_warning_pct, monthly_cost_warning_micro_usd, monthly_token_warning"
    )
    .eq("is_archived", false)
    .neq("status", "retired");

  if (solutionsError) {
    errors.push(`solutions: ${solutionsError.message}`);
    return { providers: summarize(providers), solutionsExamined: 0, alertsOpened: 0, alertsResolved: 0, errors };
  }

  type SolutionRow = {
    id: string;
    name: string;
    model: string | null;
    provider_key: string | null;
    status: string;
    error_rate_warning_pct: number | null;
    monthly_cost_warning_micro_usd: number | null;
    monthly_token_warning: number | null;
  };

  const rows = (solutions ?? []) as SolutionRow[];
  const observedFrom = new Date(Date.now() - OBSERVATION_WINDOW_DAYS * DAY).toISOString();
  const monthFrom = new Date(Date.now() - 30 * DAY).toISOString();

  for (const solution of rows) {
    if (solution.status === "paused" || solution.status === "draft") continue;

    const { data: recent, error: usageError } = await sb
      .from("ai_usage_events")
      .select("status, occurred_at, total_tokens, cost_micro_usd")
      .eq("solution_id", solution.id)
      .gte("occurred_at", monthFrom)
      .limit(5000);

    if (usageError) {
      errors.push(`usage ${solution.name}: ${usageError.message}`);
      continue;
    }

    type UsageRow = { status: string; occurred_at: string; total_tokens: number; cost_micro_usd: number | null };
    const usage = (recent ?? []) as UsageRow[];

    // Error rate is judged only on the observation window, and only when
    // there is enough of it. Two failures out of two calls is not a 100%
    // error rate worth waking anyone for.
    const observed = usage.filter((event) => event.occurred_at >= observedFrom);
    if (observed.length >= 20) {
      const failures = observed.filter((event) => event.status !== "success").length;
      const rate = (failures / observed.length) * 100;
      const warnAt = solution.error_rate_warning_pct ?? DEFAULT_ERROR_WARN_PCT;
      const criticalAt = Math.max(warnAt, DEFAULT_ERROR_CRITICAL_PCT);

      if (rate >= warnAt) {
        drafts.push({
          solutionId: solution.id,
          providerKey: solution.provider_key,
          kind: "error_rate",
          severity: rate >= criticalAt ? "critical" : "warning",
          title: `${solution.name} is failing ${rate.toFixed(1)}% of calls`,
          detail: `${failures} of ${observed.length} calls in the last ${OBSERVATION_WINDOW_DAYS} days did not succeed. The warning threshold is ${warnAt}%.`,
          metric: { errorRatePct: Number(rate.toFixed(2)), calls: observed.length, failures },
        });
      }
    }

    const priced = usage.filter((event) => event.cost_micro_usd !== null);
    const monthCost = priced.reduce((sum, event) => sum + (event.cost_micro_usd ?? 0), 0);
    const costWarn = solution.monthly_cost_warning_micro_usd;

    if (costWarn !== null && priced.length > 0 && monthCost >= costWarn) {
      drafts.push({
        solutionId: solution.id,
        providerKey: solution.provider_key,
        kind: "cost_threshold",
        severity: "warning",
        title: `${solution.name} has passed its monthly cost warning`,
        detail: `$${(monthCost / MICRO_PER_DOLLAR).toFixed(2)} of provider cost in the last 30 days against a warning set at $${(costWarn / MICRO_PER_DOLLAR).toFixed(2)}. Nothing has been stopped.`,
        metric: { costMicroUsd: monthCost, thresholdMicroUsd: costWarn },
      });
    }

    const monthTokens = usage.reduce((sum, event) => sum + (event.total_tokens ?? 0), 0);
    const tokenWarn = solution.monthly_token_warning;

    if (tokenWarn !== null && monthTokens >= tokenWarn) {
      drafts.push({
        solutionId: solution.id,
        providerKey: solution.provider_key,
        kind: "usage_threshold",
        severity: "info",
        title: `${solution.name} has passed its monthly token warning`,
        detail: `${monthTokens.toLocaleString("en-US")} tokens in the last 30 days against a warning set at ${tokenWarn.toLocaleString("en-US")}.`,
        metric: { tokens: monthTokens, thresholdTokens: tokenWarn },
      });
    }
  }

  // Knowledge past its own refresh window. A source nobody re-read is the
  // quiet way an assistant starts giving last quarter's prices.
  const { data: knowledge } = await sb
    .from("ai_knowledge_sources")
    .select("id, solution_id, name, refresh_days, last_synced_at")
    .not("refresh_days", "is", null);

  for (const source of (knowledge ?? []) as {
    id: string; solution_id: string; name: string; refresh_days: number; last_synced_at: string | null;
  }[]) {
    const dueAt = source.last_synced_at
      ? new Date(source.last_synced_at).getTime() + source.refresh_days * DAY
      : 0;
    if (dueAt > Date.now()) continue;

    drafts.push({
      solutionId: source.solution_id,
      providerKey: null,
      kind: "knowledge_stale",
      severity: "warning",
      title: `"${source.name}" is past its refresh window`,
      detail: source.last_synced_at
        ? `Last synced ${new Date(source.last_synced_at).toISOString().slice(0, 10)}, set to refresh every ${source.refresh_days} days.`
        : `Never synced, and set to refresh every ${source.refresh_days} days.`,
      metric: { refreshDays: source.refresh_days, lastSyncedAt: source.last_synced_at },
    });
  }

  // A model with a retirement date close enough to matter. Nothing is
  // switched automatically — choosing a replacement model is a decision
  // about behaviour, not a version bump.
  const horizon = new Date(Date.now() + DEPRECATION_HORIZON_DAYS * DAY).toISOString().slice(0, 10);
  const { data: retiring } = await sb
    .from("ai_models")
    .select("provider_key, model, deprecated_on")
    .not("deprecated_on", "is", null)
    .lte("deprecated_on", horizon);

  for (const model of (retiring ?? []) as { provider_key: string; model: string; deprecated_on: string }[]) {
    const users = rows.filter((solution) => solution.model === model.model);
    for (const solution of users) {
      drafts.push({
        solutionId: solution.id,
        providerKey: model.provider_key,
        kind: "model_deprecated",
        severity: "warning",
        title: `${solution.name} runs on a model that retires ${model.deprecated_on}`,
        detail: `${model.model} is scheduled for retirement. Choose a replacement in this solution's settings before then — nothing will be switched automatically.`,
        metric: { model: model.model, deprecatedOn: model.deprecated_on },
      });
    }
  }

  const { opened, resolved } = await reconcile(sb, drafts);

  return {
    providers: summarize(providers),
    solutionsExamined: rows.length,
    alertsOpened: opened,
    alertsResolved: resolved,
    errors,
  };
}

const summarize = (providers: Record<string, { status: string; detail?: string }>): Record<string, string> =>
  Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, value.status]));

/**
 * Open what is newly wrong, close what this job opened and is no longer wrong.
 *
 * Only alerts this job raised are auto-resolved. An alert a person opened, or
 * acknowledged, is left alone: closing somebody's judgement because one probe
 * came back clean is not a decision code gets to make.
 */
async function reconcile(
  sb: ReturnType<typeof supabaseAdmin>,
  drafts: AlertDraft[]
): Promise<{ opened: number; resolved: number }> {
  const { data: existing } = await sb
    .from("ai_alerts")
    .select("id, solution_id, provider_key, kind, status, acknowledged_at")
    .eq("status", "open");

  type Existing = {
    id: string; solution_id: string | null; provider_key: string | null;
    kind: string; acknowledged_at: string | null;
  };

  const open = (existing ?? []) as Existing[];
  const keyOf = (solutionId: string | null, providerKey: string | null, kind: string): string =>
    `${solutionId ?? "-"}|${providerKey ?? "-"}|${kind}`;

  const wanted = new Set(drafts.map((draft) => keyOf(draft.solutionId, draft.providerKey, draft.kind)));
  const held = new Set(open.map((alert) => keyOf(alert.solution_id, alert.provider_key, alert.kind)));

  const toOpen = drafts.filter((draft) => !held.has(keyOf(draft.solutionId, draft.providerKey, draft.kind)));

  const AUTO_KINDS = new Set([
    "error_rate", "cost_threshold", "usage_threshold",
    "knowledge_stale", "model_deprecated", "provider_disconnected",
  ]);

  const toResolve = open.filter(
    (alert) =>
      AUTO_KINDS.has(alert.kind) &&
      alert.acknowledged_at === null &&
      !wanted.has(keyOf(alert.solution_id, alert.provider_key, alert.kind))
  );

  if (toOpen.length > 0) {
    await sb.from("ai_alerts").insert(
      toOpen.map((draft) => ({
        solution_id: draft.solutionId,
        provider_key: draft.providerKey,
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        metric: draft.metric,
      }))
    );

    const timeline = toOpen
      .filter((draft) => draft.solutionId !== null)
      .map((draft) => ({
        solution_id: draft.solutionId,
        kind: "alert",
        body: draft.title,
        actor: "system",
        meta: draft.metric,
      }));
    if (timeline.length > 0) await sb.from("ai_events").insert(timeline);
  }

  if (toResolve.length > 0) {
    await sb
      .from("ai_alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "system" })
      .in("id", toResolve.map((alert) => alert.id));
  }

  return { opened: toOpen.length, resolved: toResolve.length };
}
