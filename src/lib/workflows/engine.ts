import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAutomation } from "@/lib/automations/engine";

type StartInput = { workflowId: string; name: string; clientId?: string | null; projectId?: string | null; ownerId?: string | null; actor: string };

const isoAfterHours = (hours: number | null | undefined, from = new Date()) => hours ? new Date(from.getTime() + hours * 3_600_000).toISOString() : null;
const decisionPasses = (rule: Record<string, unknown>, context: Record<string, unknown>) => { const actual = context[String(rule.field ?? "")]; const expected = rule.value; switch (String(rule.operator ?? "equals")) { case "not_equals": return String(actual ?? "") !== String(expected ?? ""); case "contains": return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase()); case "greater_than": return Number(actual) > Number(expected); case "less_than": return Number(actual) < Number(expected); case "is_empty": return actual == null || actual === ""; case "is_not_empty": return actual != null && actual !== ""; default: return String(actual ?? "") === String(expected ?? ""); } };

async function log(sb: SupabaseClient, input: { workflowId?: string; runId?: string; stageId?: string; type: string; body: string; actor: string; meta?: Record<string, unknown> }) {
  const result = await sb.from("workflow_activity_events").insert({ workflow_id: input.workflowId ?? null, run_id: input.runId ?? null, run_stage_id: input.stageId ?? null, event_type: input.type, body: input.body, actor: input.actor, meta: input.meta ?? {} });
  if (result.error) throw new Error(result.error.message);
}

async function linkedAutomations(sb: SupabaseClient, workflowId: string, sourceStageId: string | null, runId: string, eventType: string, actor: string, clientId?: string | null, projectId?: string | null) {
  if (!sourceStageId) return;
  const links = await sb.from("workflow_stage_automations").select("automation_id").eq("stage_id", sourceStageId).eq("event_type", eventType);
  for (const link of links.data ?? []) {
    const result = await executeAutomation(sb, { automationId: link.automation_id, mode: "live", triggerEventId: `workflow:${runId}:${sourceStageId}:${eventType}`, triggerSummary: `Workflow ${eventType.replace(/_/g, " ")}`, context: { workflow: { id: workflowId, run_id: runId, stage_id: sourceStageId, event: eventType } }, relatedClientId: clientId ?? null, relatedRecordType: projectId ? "project" : "workflow", relatedRecordId: projectId ?? runId, actor });
    if (result.status === "failed") throw new Error("A linked automation failed.");
    await log(sb, { workflowId, runId, type: "automation_succeeded", body: `Linked automation completed for ${eventType.replace(/_/g, " ")}.`, actor, meta: { automation_id: link.automation_id, automation_run_id: result.runId, source_stage_id: sourceStageId } });
  }
}

async function enterStage(sb: SupabaseClient, run: { id: string; workflow_id: string; client_id: string | null; project_id: string | null }, stage: Record<string, unknown>, actor: string) {
  const now = new Date(); const targetHours = Number(stage.target_duration_hours || 0) || null;
  const updated = await sb.from("workflow_run_stages").update({ status: "current", entered_at: now.toISOString(), due_at: isoAfterHours(targetHours, now) }).eq("id", String(stage.id));
  if (updated.error) throw new Error(updated.error.message);
  const snapshot = (stage.snapshot ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks as Array<Record<string, unknown>> : [];
  if (tasks.length) {
    const rows = tasks.map((task, index) => ({ title: String(task.title ?? "Workflow task"), notes: String(task.description ?? "") || null, kind: "task", type: String(task.task_type ?? "internal"), status: "not_started", priority: String(task.priority ?? "medium"), due_at: isoAfterHours(Number(task.due_offset_hours || 0), now), owner: task.assignee ? String(task.assignee) : null, created_by: actor, source: "system", customer_id: run.client_id, job_id: run.project_id, workflow_run_id: run.id, workflow_run_stage_id: String(stage.id), workflow_stage_task_id: task.id ? String(task.id) : null, sort_order: index, tags: ["workflow"] }));
    const inserted = await sb.from("tasks").insert(rows); if (inserted.error) throw new Error(inserted.error.message);
  }
  const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals as Array<Record<string, unknown>> : [];
  if (approvals.length) {
    const rows = approvals.map((approval) => ({ run_id: run.id, run_stage_id: String(stage.id), source_approval_id: approval.id ? String(approval.id) : null, name: String(approval.name ?? "Approval"), approval_type: String(approval.approval_type ?? "internal"), approver_id: approval.approver_id ? String(approval.approver_id) : null, approver_role: approval.approver_role ? String(approval.approver_role) : null, required: approval.required !== false, comments_required: approval.comments_required === true, due_at: isoAfterHours(Number(approval.due_offset_hours || 0), now) }));
    const inserted = await sb.from("workflow_run_approvals").insert(rows); if (inserted.error) throw new Error(inserted.error.message);
  }
  await linkedAutomations(sb, run.workflow_id, stage.source_stage_id ? String(stage.source_stage_id) : null, run.id, "stage_entered", actor, run.client_id, run.project_id);
  await log(sb, { workflowId: run.workflow_id, runId: run.id, stageId: String(stage.id), type: "stage_entered", body: `${String(stage.name)} entered.`, actor });
}

export async function startWorkflowRun(sb: SupabaseClient, input: StartInput) {
  const [workflowResult, stagesResult] = await Promise.all([
    sb.from("workflows").select("*").eq("id", input.workflowId).eq("status", "active").single(),
    sb.from("workflow_stages").select("*,workflow_stage_tasks(*),workflow_stage_approvals(*),workflow_stage_automations(*),workflow_stage_agents(*)").eq("workflow_id", input.workflowId).order("stage_order"),
  ]);
  const workflow = workflowResult.data; const stages = stagesResult.data ?? [];
  if (!workflow || !stages.length) throw new Error(workflowResult.error?.message ?? "Active workflow needs at least one stage.");
  const snapshot = { workflow: { id: workflow.id, name: workflow.name, version: workflow.version, area: workflow.area, target_duration_hours: workflow.target_duration_hours }, stages };
  const created = await sb.from("workflow_runs").insert({ workflow_id: workflow.id, workflow_version: workflow.version, definition_snapshot: snapshot, name: input.name, client_id: input.clientId ?? null, project_id: input.projectId ?? null, related_record_type: input.projectId ? "project" : input.clientId ? "client" : null, related_record_id: input.projectId ?? input.clientId ?? null, owner_id: input.ownerId ?? workflow.owner_id, status: "running", current_stage_order: 0, due_at: isoAfterHours(workflow.target_duration_hours), created_by: input.actor }).select("id,workflow_id,client_id,project_id").single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? "Workflow run could not be created.");
  const stageRows = stages.map((stage) => ({ run_id: created.data.id, source_stage_id: stage.id, stage_order: stage.stage_order, name: stage.name, stage_type: stage.stage_type, owner_id: stage.owner_id, target_duration_hours: stage.target_duration_hours, completion_rule: stage.completion_rule, required: stage.required, allow_skip: stage.allow_skip, snapshot: { description: stage.description, priority: stage.priority, branch_rules: stage.branch_rules, tasks: stage.workflow_stage_tasks ?? [], approvals: stage.workflow_stage_approvals ?? [], automations: stage.workflow_stage_automations ?? [], agents: stage.workflow_stage_agents ?? [] }, status: "upcoming" }));
  const inserted = await sb.from("workflow_run_stages").insert(stageRows).select("*").order("stage_order");
  if (inserted.error || !inserted.data?.length) { await sb.from("workflow_runs").delete().eq("id", created.data.id); throw new Error(inserted.error?.message ?? "Run stages could not be created."); }
  await enterStage(sb, created.data, inserted.data[0], input.actor);
  await log(sb, { workflowId: workflow.id, runId: created.data.id, type: "run_started", body: `${input.name} started on ${workflow.name} v${workflow.version}.`, actor: input.actor, meta: { version: workflow.version } });
  return created.data.id as string;
}

export async function advanceWorkflowRun(sb: SupabaseClient, runId: string, actor: string, allowSkip = false) {
  const runResult = await sb.from("workflow_runs").select("id,workflow_id,client_id,project_id,status,current_stage_order").eq("id", runId).single(); const run = runResult.data;
  if (!run || !["running", "blocked"].includes(run.status)) throw new Error("Only a running workflow can advance.");
  const stagesResult = await sb.from("workflow_run_stages").select("*").eq("run_id", runId).order("stage_order"); const stages = stagesResult.data ?? [];
  const index = stages.findIndex((stage) => stage.stage_order === run.current_stage_order); const current = stages[index]; if (!current) throw new Error("Current stage was not found.");
  const [tasksResult, approvalsResult] = await Promise.all([
    sb.from("tasks").select("id,status,workflow_stage_task_id").eq("workflow_run_stage_id", current.id),
    sb.from("workflow_run_approvals").select("id,status,required").eq("run_stage_id", current.id),
  ]);
  const snapshot = (current.snapshot ?? {}) as Record<string, unknown>; const templates = Array.isArray(snapshot.tasks) ? snapshot.tasks as Array<Record<string, unknown>> : [];
  const requiredIds = new Set(templates.filter((task) => task.required !== false && task.id).map((task) => String(task.id)));
  const incomplete = (tasksResult.data ?? []).some((task) => requiredIds.has(String(task.workflow_stage_task_id)) && !["completed", "canceled"].includes(task.status));
  const pendingApproval = (approvalsResult.data ?? []).some((approval) => approval.required && approval.status !== "approved");
  const automationResult = await sb.from("workflow_activity_events").select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("event_type", "automation_succeeded").contains("meta", { source_stage_id: current.source_stage_id });
  const rule = String(current.completion_rule); const blocked = rule === "approval_received" ? pendingApproval : rule === "automation_success" ? (automationResult.count ?? 0) === 0 : rule === "all_required_tasks" || rule === "all_conditions" ? incomplete || pendingApproval : rule !== "manual";
  if (blocked && !allowSkip) throw new Error(pendingApproval ? "Required approval is still waiting." : incomplete ? "Required tasks are not complete." : "This completion rule cannot be bypassed manually.");
  const now = new Date().toISOString(); await sb.from("workflow_run_stages").update({ status: allowSkip ? "skipped" : "completed", completed_at: now, blocked_reason: null }).eq("id", current.id);
  try { await linkedAutomations(sb, run.workflow_id, current.source_stage_id, run.id, "stage_completed", actor, run.client_id, run.project_id); }
  catch (error) { const message = error instanceof Error ? error.message : "Linked automation failed."; await sb.from("workflow_run_stages").update({ status: "blocked", blocked_reason: message }).eq("id", current.id); await sb.from("workflow_runs").update({ status: "blocked" }).eq("id", run.id); await log(sb, { workflowId: run.workflow_id, runId: run.id, stageId: current.id, type: "run_blocked", body: message, actor }); throw error; }
  let next = stages[index + 1];
  if (String(current.stage_type) === "decision") {
    const snapshotRules = Array.isArray(snapshot.branch_rules) ? snapshot.branch_rules as Array<Record<string, unknown>> : [];
    let context: Record<string, unknown> = { run_status: run.status };
    if (run.client_id) { const record = await sb.from("customers").select("*").eq("id", run.client_id).maybeSingle(); context = { ...context, ...(record.data ?? {}) }; }
    if (run.project_id) { const record = await sb.from("jobs").select("*").eq("id", run.project_id).maybeSingle(); context = { ...context, ...(record.data ?? {}) }; }
    const matched = snapshotRules.find((rule) => decisionPasses(rule, context)); const target = matched ? Number(matched.target_stage_order) : Number.NaN;
    if (Number.isFinite(target)) { const targetIndex = stages.findIndex((stage) => stage.stage_order === target); if (targetIndex > index) { const skipped = stages.slice(index + 1, targetIndex).map((stage) => stage.id); if (skipped.length) await sb.from("workflow_run_stages").update({ status: "skipped", completed_at: now }).in("id", skipped); next = stages[targetIndex]; } }
  }
  if (!next) { await sb.from("workflow_runs").update({ status: "completed", completed_at: now }).eq("id", run.id); await log(sb, { workflowId: run.workflow_id, runId: run.id, type: "workflow_completed", body: "Workflow run completed.", actor }); return "completed"; }
  await sb.from("workflow_runs").update({ status: "running", current_stage_order: next.stage_order }).eq("id", run.id); await enterStage(sb, run, next, actor); return "advanced";
}
