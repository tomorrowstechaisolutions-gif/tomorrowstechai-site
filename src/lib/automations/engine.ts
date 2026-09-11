import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Json = Record<string, unknown>;
type Mode = "live" | "test" | "dry_run";

export const SAFE_VARIABLES = new Set([
  "lead.name", "lead.email", "lead.company", "lead.id", "client.name", "client.email",
  "client.id", "proposal.total", "proposal.id", "invoice.amount", "invoice.id",
  "project.name", "project.id", "task.title", "task.id", "event.id",
]);

export const SUPPORTED_ACTIONS = new Set(["create_task", "send_in_app_notification"]);

export function invalidVariables(value: unknown): string[] {
  const raw = JSON.stringify(value ?? ""); const found = [...raw.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((match) => match[1]);
  return [...new Set(found.filter((name) => !SAFE_VARIABLES.has(name)))];
}

function getPath(input: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Json)[key] : undefined, input);
}

function resolve(value: unknown, context: Json): unknown {
  if (typeof value === "string") return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => String(getPath(context, path) ?? ""));
  if (Array.isArray(value)) return value.map((item) => resolve(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Json).map(([key, item]) => [key, resolve(item, context)]));
  return value;
}

function compare(actual: unknown, operator: string, expected: unknown): boolean {
  const a = typeof actual === "string" ? actual.toLowerCase() : actual;
  const e = typeof expected === "string" ? expected.toLowerCase() : expected;
  switch (operator) {
    case "equals": return a === e;
    case "not_equals": return a !== e;
    case "contains": return String(a ?? "").includes(String(e ?? ""));
    case "not_contains": return !String(a ?? "").includes(String(e ?? ""));
    case "greater_than": return Number(a) > Number(e);
    case "less_than": return Number(a) < Number(e);
    case "is_empty": return a === null || a === undefined || a === "";
    case "is_not_empty": return a !== null && a !== undefined && a !== "";
    case "before": return new Date(String(a)).getTime() < new Date(String(e)).getTime();
    case "after": return new Date(String(a)).getTime() > new Date(String(e)).getTime();
    case "in_list": return Array.isArray(expected) && expected.map(String).map((v) => v.toLowerCase()).includes(String(a).toLowerCase());
    case "not_in_list": return Array.isArray(expected) && !expected.map(String).map((v) => v.toLowerCase()).includes(String(a).toLowerCase());
    default: return false;
  }
}

function conditionsPass(config: Json, context: Json) {
  const rules = Array.isArray(config.rules) ? config.rules.filter((rule): rule is Json => Boolean(rule && typeof rule === "object")) : [];
  const checks = rules.map((rule) => compare(getPath(context, String(rule.field ?? "")), String(rule.operator ?? "equals"), rule.value));
  return String(config.logic ?? "AND").toUpperCase() === "OR" ? checks.some(Boolean) : checks.every(Boolean);
}

async function recordStep(sb: SupabaseClient, input: {
  runId: string; stepId: string; order: number; type: string; name: string; status: string;
  input?: Json; output?: Json; error?: string | null; started: number;
}) {
  const now = new Date();
  const { data, error } = await sb.from("automation_run_steps").insert({
    run_id: input.runId, automation_step_id: input.stepId, step_order: input.order,
    step_type: input.type, name: input.name, status: input.status,
    input_summary: input.input ?? {}, output_summary: input.output ?? {}, error_message: input.error ?? null,
    idempotency_key: `${input.runId}:${input.stepId}`, started_at: new Date(input.started).toISOString(),
    completed_at: now.toISOString(), duration_ms: Math.max(0, now.getTime() - input.started),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function executeAutomation(sb: SupabaseClient, input: {
  automationId: string; mode: Mode; triggerEventId?: string | null; triggerSummary?: string;
  context?: Json; relatedClientId?: string | null; relatedRecordType?: string | null;
  relatedRecordId?: string | null; actor?: string;
}) {
  const started = Date.now();
  const { data: automation, error: automationError } = await sb.from("automations")
    .select("id,name,status,trigger_config,automation_trigger_definitions(key),automation_steps(*)")
    .eq("id", input.automationId).maybeSingle();
  if (automationError || !automation) throw new Error(automationError?.message ?? "Automation not found.");
  if (input.mode === "live" && automation.status !== "active") throw new Error("Only active automations can run live.");

  const triggerRelation = automation.automation_trigger_definitions as unknown;
  const trigger = (Array.isArray(triggerRelation) ? triggerRelation[0] : triggerRelation) as { key?: string } | null;
  const triggerKey = trigger?.key ?? "manual_test";
  const insert = await sb.from("automation_runs").insert({
    automation_id: input.automationId, trigger_event_id: input.mode === "live" ? input.triggerEventId ?? null : null,
    trigger_key: triggerKey, trigger_summary: input.triggerSummary ?? (input.mode === "dry_run" ? "Manual dry run" : "Manual test run"),
    trigger_payload: input.context ?? {}, status: "running", mode: input.mode,
    related_client_id: input.relatedClientId ?? null, related_record_type: input.relatedRecordType ?? null,
    related_record_id: input.relatedRecordId ?? null,
  }).select("id").single();
  if (insert.error || !insert.data) {
    if (input.mode === "live" && input.triggerEventId) {
      const existing = await sb.from("automation_runs").select("id,status").eq("automation_id", input.automationId).eq("trigger_event_id", input.triggerEventId).maybeSingle();
      if (existing.data) return { runId: existing.data.id as string, status: existing.data.status as string, duplicate: true };
    }
    throw new Error(insert.error?.message ?? "Run could not be created.");
  }
  const runId = insert.data.id as string; const context = input.context ?? {};
  const steps = [...((automation.automation_steps ?? []) as Array<Record<string, unknown>>)].filter((step) => step.enabled !== false).sort((a, b) => Number(a.step_order) - Number(b.step_order));
  let finalStatus: "success" | "failed" | "skipped" = "success"; let errorSummary: string | null = null;

  try {
    for (const step of steps) {
      const stepStarted = Date.now(); const type = String(step.step_type); const config = (step.config ?? {}) as Json; const resolved = resolve(config, context) as Json;
      if (type === "trigger") {
        await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: "success", input: { trigger: triggerKey }, output: { received: true }, started: stepStarted });
      } else if (type === "condition" || type === "branch") {
        const passed = conditionsPass(config, context);
        await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: passed ? "success" : "skipped", input: { rules: config.rules ?? [] }, output: { passed }, started: stepStarted });
        if (!passed && String(step.branch_key ?? "main") === "main") { finalStatus = "skipped"; break; }
      } else if (type === "delay") {
        await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: input.mode === "live" ? "success" : "skipped", input: resolved, output: input.mode === "live" ? { satisfied: true } : { skipped_in_test_mode: true }, started: stepStarted });
      } else if (type === "action") {
        const actionType = String(step.action_type ?? ""); const variables = invalidVariables(config);
        if (variables.length) throw new Error(`Invalid template variables: ${variables.join(", ")}`);
        if (!SUPPORTED_ACTIONS.has(actionType)) throw new Error(`Action ${actionType || "unknown"} is not enabled in the unified engine.`);
        if (input.mode !== "live") {
          await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: "preview", input: resolved, output: { would_execute: actionType, writes_performed: false }, started: stepStarted });
        } else if (actionType === "create_task") {
          const title = String(resolved.title ?? "Automation follow-up").slice(0, 240);
          const existing = await sb.from("tasks").select("id").eq("source", "system").eq("notes", `Automation run ${runId}`).maybeSingle();
          let taskId = existing.data?.id as string | undefined;
          if (!taskId) {
            const due = new Date(); due.setDate(due.getDate() + Math.max(0, Number(resolved.due_in_days ?? 1)));
            const created = await sb.from("tasks").insert({ title, notes: `Automation run ${runId}`, kind: "task", type: String(resolved.type ?? "automation"), status: "not_started", priority: String(resolved.priority ?? "medium"), due_at: due.toISOString(), owner: resolved.owner ? String(resolved.owner) : null, created_by: input.actor ?? "automation", source: "system", lead_id: input.relatedRecordType === "lead" ? input.relatedRecordId : null, customer_id: input.relatedClientId ?? null, job_id: input.relatedRecordType === "project" ? input.relatedRecordId : null }).select("id").single();
            if (created.error || !created.data) throw new Error(created.error?.message ?? "Task action failed."); taskId = created.data.id as string;
          }
          await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: "success", input: resolved, output: { task_id: taskId, idempotent: Boolean(existing.data) }, started: stepStarted });
        } else {
          await sb.from("automation_activity_events").insert({ automation_id: input.automationId, run_id: runId, event_type: "notification", body: String(resolved.message ?? automation.name), actor: input.actor ?? "automation" });
          await recordStep(sb, { runId, stepId: String(step.id), order: Number(step.step_order), type, name: String(step.name), status: "success", input: resolved, output: { notified: true, channel: "in_app" }, started: stepStarted });
        }
      }
    }
  } catch (error) {
    finalStatus = "failed"; errorSummary = error instanceof Error ? error.message : "Automation failed.";
  }

  const completed = new Date();
  await sb.from("automation_runs").update({ status: finalStatus, completed_at: completed.toISOString(), duration_ms: completed.getTime() - started, error_summary: errorSummary }).eq("id", runId);
  await sb.from("automations").update({ last_run_at: completed.toISOString(), status: finalStatus === "failed" && input.mode === "live" ? "warning" : automation.status }).eq("id", input.automationId);
  if (errorSummary) await sb.from("automation_errors").insert({ automation_id: input.automationId, run_id: runId, message: errorSummary, retry_status: input.mode === "live" ? "not_requested" : "not_safe", diagnostic: { mode: input.mode } });
  await sb.from("automation_activity_events").insert({ automation_id: input.automationId, run_id: runId, event_type: input.mode === "dry_run" ? "automation_dry_run" : "automation_test_run", body: `${input.mode === "live" ? "Live" : input.mode === "test" ? "Test" : "Dry"} run ${finalStatus}.`, actor: input.actor ?? "system" });
  return { runId, status: finalStatus, duplicate: false };
}

export function nextSchedule(config: Json, from = new Date()): Date {
  const next = new Date(from); const frequency = String(config.frequency ?? "daily");
  if (frequency === "hourly") next.setUTCHours(next.getUTCHours() + 1);
  else if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
