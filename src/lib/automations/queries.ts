import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationBoard, AutomationCategory, AutomationDetail, AutomationError,
  AutomationFilters, AutomationListItem, AutomationRun, AutomationRunStep,
  AutomationStatus, HealthStatus, RunStatus, StepType,
} from "./types";

type ObjectRow = Record<string, unknown>;
const obj = (value: unknown): ObjectRow => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectRow : {};
const text = (value: unknown) => typeof value === "string" ? value : null;
const number = (value: unknown) => typeof value === "number" ? value : 0;
const first = (value: unknown) => Array.isArray(value) ? obj(value[0]) : obj(value);

function runFrom(row: ObjectRow): AutomationRun {
  const automation = first(row.automations);
  return {
    id: String(row.id), automationId: String(row.automation_id),
    automationName: text(automation.name) ?? "Automation",
    triggerKey: text(row.trigger_key) ?? "unknown",
    triggerSummary: text(row.trigger_summary), status: (text(row.status) ?? "running") as RunStatus,
    mode: (text(row.mode) ?? "live") as AutomationRun["mode"], startedAt: String(row.started_at),
    completedAt: text(row.completed_at), durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    relatedRecordType: text(row.related_record_type), errorSummary: text(row.error_summary),
  };
}

function errorFrom(row: ObjectRow): AutomationError {
  return {
    id: String(row.id), automationId: String(row.automation_id),
    automationName: text(first(row.automations).name) ?? "Automation", runId: text(row.run_id),
    stepName: text(first(row.automation_run_steps).name), message: text(row.message) ?? "Unknown error",
    retryStatus: text(row.retry_status) ?? "not_requested", resolved: Boolean(row.resolved),
    createdAt: String(row.created_at),
  };
}

function calculateHealth(row: ObjectRow, failures24h: number, completed24h: number, hasAction: boolean): HealthStatus {
  const status = text(row.status);
  if (!row.trigger_definition_id || !hasAction || status === "warning") return "warning";
  if (status === "error" || failures24h >= 3 || (completed24h >= 5 && failures24h / completed24h > 0.1)) return "critical";
  if (status !== "active" || !row.last_run_at) return "unknown";
  return failures24h === 0 ? "healthy" : "warning";
}

export async function loadAutomationBoard(sb: SupabaseClient, filters: AutomationFilters): Promise<AutomationBoard> {
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [automationsResult, runsResult, recentRunsResult, errorsResult, triggersResult, ownersResult, templatesResult, stepsResult] = await Promise.all([
    sb.from("automations").select("*, automation_trigger_definitions(id,key,name,area), admin_users(id,email,full_name,role)").order("updated_at", { ascending: false }),
    sb.from("automation_runs").select("id,automation_id,status,started_at,duration_ms,mode").gte("started_at", month.toISOString()).limit(5000),
    sb.from("automation_runs").select("*, automations(name)").order("started_at", { ascending: false }).limit(20),
    sb.from("automation_errors").select("*, automations(name), automation_run_steps(name)").eq("resolved", false).order("created_at", { ascending: false }).limit(30),
    sb.from("automation_trigger_definitions").select("id,key,name,area,description,enabled").eq("enabled", true).order("area").order("name"),
    sb.from("admin_users").select("id,email,full_name,role").order("full_name"),
    sb.from("automation_templates").select("id,name,description,category,definition").eq("enabled", true).order("category").order("name"),
    sb.from("automation_steps").select("automation_id,step_type,enabled"),
  ]);
  const failure = [automationsResult, runsResult, recentRunsResult, errorsResult, triggersResult, ownersResult, templatesResult, stepsResult].find((result) => result.error)?.error;
  if (failure) throw new Error(`Automation data could not be loaded: ${failure.message}`);

  const monthRuns = (runsResult.data ?? []) as ObjectRow[];
  const byAutomation = new Map<string, { total: number; success: number; failed: number; failures24h: number; completed24h: number }>();
  for (const run of monthRuns) {
    const id = String(run.automation_id); const stats = byAutomation.get(id) ?? { total: 0, success: 0, failed: 0, failures24h: 0, completed24h: 0 };
    stats.total += 1; if (run.status === "success") stats.success += 1; if (run.status === "failed") stats.failed += 1;
    if (String(run.started_at) >= dayAgo && ["success","failed","partial"].includes(String(run.status))) {
      stats.completed24h += 1; if (run.status === "failed") stats.failures24h += 1;
    }
    byAutomation.set(id, stats);
  }
  const actionIds = new Set(((stepsResult.data ?? []) as ObjectRow[]).filter((row) => row.enabled && row.step_type === "action").map((row) => String(row.automation_id)));

  let automations: AutomationListItem[] = ((automationsResult.data ?? []) as ObjectRow[]).map((row) => {
    const id = String(row.id); const stats = byAutomation.get(id) ?? { total: 0, success: 0, failed: 0, failures24h: 0, completed24h: 0 };
    const trigger = first(row.automation_trigger_definitions); const owner = first(row.admin_users);
    const completed = stats.success + stats.failed;
    return {
      id, key: text(row.key), name: String(row.name), description: text(row.description),
      category: String(row.category) as AutomationCategory, status: String(row.status) as AutomationStatus,
      health: calculateHealth(row, stats.failures24h, stats.completed24h, actionIds.has(id)),
      ownerId: text(row.owner_id), owner: text(owner.full_name) ?? text(owner.email),
      triggerId: text(row.trigger_definition_id), trigger: text(trigger.name) ?? "Not configured", triggerKey: text(trigger.key),
      sourceSystem: text(row.source_system) ?? "automation_engine", lockedExecution: Boolean(row.locked_execution),
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
      estimatedMinutesSaved: typeof row.estimated_minutes_saved === "number" ? row.estimated_minutes_saved : null,
      runs: stats.total, successes: stats.success, failures: stats.failed,
      successRate: completed ? Math.round(stats.success / completed * 1000) / 10 : null,
      lastRunAt: text(row.last_run_at), nextRunAt: text(row.next_run_at), updatedAt: String(row.updated_at),
    };
  });

  if (filters.q) { const q = filters.q.toLowerCase(); automations = automations.filter((a) => `${a.name} ${a.description ?? ""} ${a.trigger}`.toLowerCase().includes(q)); }
  if (filters.category && filters.category !== "all") automations = automations.filter((a) => a.category === filters.category);
  if (filters.status) automations = automations.filter((a) => a.status === filters.status);
  if (filters.trigger) automations = automations.filter((a) => a.triggerKey === filters.trigger);
  if (filters.owner) automations = automations.filter((a) => a.ownerId === filters.owner);
  if (filters.health) automations = automations.filter((a) => a.health === filters.health);
  if (filters.lastRun) { const cutoff = Date.now() - Number(filters.lastRun) * 86400_000; automations = automations.filter((a) => a.lastRunAt && new Date(a.lastRunAt).getTime() >= cutoff); }
  automations.sort((a, b) => filters.sort === "runs" ? b.runs - a.runs : filters.sort === "success" ? (a.successRate ?? -1) - (b.successRate ?? -1) : filters.sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : filters.sort === "name" ? a.name.localeCompare(b.name) : (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));

  const completed = monthRuns.filter((run) => ["success","failed","partial"].includes(String(run.status)));
  const successful = monthRuns.filter((run) => run.status === "success").length;
  const failed = monthRuns.filter((run) => run.status === "failed").length;
  const savedValues = automations.filter((a) => a.estimatedMinutesSaved !== null).map((a) => a.successes * (a.estimatedMinutesSaved ?? 0));
  return {
    automations, runs: ((recentRunsResult.data ?? []) as ObjectRow[]).map(runFrom), errors: ((errorsResult.data ?? []) as ObjectRow[]).map(errorFrom),
    triggers: ((triggersResult.data ?? []) as ObjectRow[]).map((row) => ({ id: String(row.id), key: String(row.key), name: String(row.name), area: String(row.area) as AutomationCategory, description: text(row.description), enabled: Boolean(row.enabled) })),
    owners: ((ownersResult.data ?? []) as ObjectRow[]).map((row) => ({ id: String(row.id), name: text(row.full_name) ?? String(row.email), email: String(row.email), role: String(row.role) })),
    templates: ((templatesResult.data ?? []) as ObjectRow[]).map((row) => ({ id: String(row.id), name: String(row.name), description: text(row.description), category: String(row.category) as AutomationCategory, definition: obj(row.definition) })),
    kpis: { active: automations.filter((a) => a.status === "active").length, runsThisMonth: monthRuns.length, successfulRuns: successful, failedRuns: failed, successRate: completed.length ? Math.round(successful / completed.length * 1000) / 10 : null, needsAttention: automations.filter((a) => ["warning","critical"].includes(a.health)).length, timeSavedMinutes: savedValues.length ? savedValues.reduce((sum, value) => sum + value, 0) : null },
  };
}

export async function loadAutomationDetail(sb: SupabaseClient, id: string): Promise<AutomationDetail | null> {
  const filters: AutomationFilters = { sort: "last_run", view: "table" };
  const [board, itemResult, stepsResult, runsResult, errorsResult, activityResult] = await Promise.all([
    loadAutomationBoard(sb, filters),
    sb.from("automations").select("trigger_config,retry_policy,failure_threshold,failure_notifications").eq("id", id).maybeSingle(),
    sb.from("automation_steps").select("*").eq("automation_id", id).order("branch_key").order("step_order"),
    sb.from("automation_runs").select("*, automations(name)").eq("automation_id", id).order("started_at", { ascending: false }).limit(50),
    sb.from("automation_errors").select("*, automations(name), automation_run_steps(name)").eq("automation_id", id).order("created_at", { ascending: false }).limit(50),
    sb.from("automation_activity_events").select("id,event_type,body,actor,created_at").eq("automation_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const base = board.automations.find((automation) => automation.id === id); if (!base || !itemResult.data) return null;
  const row = itemResult.data as ObjectRow;
  const runs = ((runsResult.data ?? []) as ObjectRow[]).map(runFrom);
  const runIds = runs.map((run) => run.id);
  if (runIds.length) {
    const stepRows = await sb.from("automation_run_steps").select("*").in("run_id", runIds).order("step_order");
    const grouped = new Map<string, AutomationRunStep[]>();
    for (const step of (stepRows.data ?? []) as ObjectRow[]) {
      const runId = String(step.run_id); const values = grouped.get(runId) ?? [];
      values.push({ id: String(step.id), order: number(step.step_order), type: String(step.step_type) as StepType, name: String(step.name), status: String(step.status) as AutomationRunStep["status"], input: obj(step.input_summary), output: obj(step.output_summary), error: text(step.error_message), durationMs: typeof step.duration_ms === "number" ? step.duration_ms : null, startedAt: String(step.started_at), completedAt: text(step.completed_at) }); grouped.set(runId, values);
    }
    runs.forEach((run) => { run.steps = grouped.get(run.id) ?? []; });
  }
  return {
    ...base, triggerConfig: obj(row.trigger_config), retryPolicy: obj(row.retry_policy), failureThreshold: obj(row.failure_threshold), notifications: obj(row.failure_notifications),
    steps: ((stepsResult.data ?? []) as ObjectRow[]).map((step) => ({ id: String(step.id), automationId: String(step.automation_id), order: number(step.step_order), type: String(step.step_type) as StepType, name: String(step.name), actionType: text(step.action_type), config: obj(step.config), branchKey: String(step.branch_key), enabled: Boolean(step.enabled) })),
    runsDetail: runs, errorsDetail: ((errorsResult.data ?? []) as ObjectRow[]).map(errorFrom),
    activity: ((activityResult.data ?? []) as ObjectRow[]).map((event) => ({ id: String(event.id), eventType: String(event.event_type), body: text(event.body), actor: String(event.actor), createdAt: String(event.created_at) })),
  };
}
