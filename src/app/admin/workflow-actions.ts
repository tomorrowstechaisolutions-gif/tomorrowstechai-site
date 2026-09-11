"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { advanceWorkflowRun, startWorkflowRun } from "@/lib/workflows/engine";
import { COMPLETION_RULES, STAGE_TYPES, WORKFLOW_AREAS, WORKFLOW_STATUSES } from "@/lib/workflows/types";

const ROOT = "/admin/automations/workflows";
const str = (fd: FormData, key: string, max = 5000) => { const value = fd.get(key); return typeof value === "string" ? value.trim().slice(0, max) : ""; };
const integer = (fd: FormData, key: string, fallback = 0) => { const value = Number(str(fd, key, 30)); return Number.isFinite(value) ? Math.round(value) : fallback; };
const yes = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true";

async function manager(path = ROOT) {
  const session = await getAdminUser(); if (!session) redirect("/admin/login");
  if (!(["owner", "admin"] as string[]).includes(session.admin.role)) redirect(`${path}?error=${encodeURIComponent("You do not have permission to manage workflows.")}`);
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email, adminId: session.admin.id };
}

async function admin() { const session = await getAdminUser(); if (!session) redirect("/admin/login"); return { supabase: await createSupabaseServerClient(), actor: session.admin.email, adminId: session.admin.id, role: session.admin.role }; }
function go(path: string, message: string, error = false): never { revalidatePath(ROOT); revalidatePath(path); redirect(`${path}?${error ? "error" : "notice"}=${encodeURIComponent(message)}`); }
async function bump(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, workflowId: string) { const current = await sb.from("workflows").select("version").eq("id", workflowId).single(); if (current.data) await sb.from("workflows").update({ version: current.data.version + 1 }).eq("id", workflowId); }
async function activity(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, workflowId: string, type: string, body: string, actor: string) { await sb.from("workflow_activity_events").insert({ workflow_id: workflowId, event_type: type, body, actor }); }

export async function createWorkflowAction(fd: FormData) {
  const { supabase, actor, adminId } = await manager(); const name = str(fd, "name", 180); const area = str(fd, "area", 30);
  if (!name || !(WORKFLOW_AREAS as readonly string[]).includes(area)) go(ROOT, "Name and area are required.", true);
  const hours = integer(fd, "target_duration_hours", 0);
  const created = await supabase.from("workflows").insert({ name, description: str(fd, "description", 1200) || null, purpose: str(fd, "purpose", 1200) || null, area, owner_id: str(fd, "owner_id", 50) || adminId, default_priority: str(fd, "priority", 20) || "medium", target_duration_hours: hours > 0 ? hours : null, tags: str(fd, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean), status: "draft", created_by: actor }).select("id").single();
  if (created.error || !created.data) go(ROOT, created.error?.message ?? "Workflow could not be created.", true);
  await activity(supabase, created.data.id, "workflow_created", `${name} created as a draft.`, actor); go(`${ROOT}/${created.data.id}?tab=builder`, "Workflow created. Add stages, test the structure, then activate it.");
}

export async function useWorkflowTemplateAction(fd: FormData) {
  const { supabase, actor, adminId } = await manager(); const templateId = str(fd, "template_id", 50);
  const template = await supabase.from("workflow_templates").select("*").eq("id", templateId).eq("status", "active").single(); if (!template.data) go(ROOT, "Template was not found.", true);
  const created = await supabase.from("workflows").insert({ name: template.data.name, description: template.data.description, purpose: template.data.description, area: template.data.area, owner_id: adminId, project_template_id: template.data.source_task_template_id, status: "draft", created_by: actor }).select("id").single();
  if (created.error || !created.data) go(ROOT, created.error?.message ?? "Template could not be used.", true);
  if (template.data.source_task_template_id) {
    const items = await supabase.from("task_template_items").select("*").eq("template_id", template.data.source_task_template_id).order("sort_order");
    const phases = [...new Set((items.data ?? []).map((item) => item.phase))];
    for (let stageOrder = 0; stageOrder < phases.length; stageOrder += 1) {
      const phase = phases[stageOrder]; const sourceTasks = (items.data ?? []).filter((item) => item.phase === phase);
      const stage = await supabase.from("workflow_stages").insert({ workflow_id: created.data.id, stage_order: stageOrder, name: phase, stage_type: /review/i.test(phase) ? "review" : /launch/i.test(phase) ? "launch" : /handoff|complete/i.test(phase) ? "completion" : /build|design|qa/i.test(phase) ? "delivery" : "standard", target_duration_hours: sourceTasks.length ? Math.max(...sourceTasks.map((item) => Number(item.offset_days))) * 24 || 24 : 24, completion_rule: "all_required_tasks" }).select("id").single();
      if (!stage.data) continue;
      const taskRows = sourceTasks.map((item, index) => ({ stage_id: stage.data.id, task_order: index, title: item.title, description: item.description, priority: item.priority, task_type: item.type, due_offset_hours: Math.max(0, Number(item.offset_days)) * 24, required: true }));
      if (taskRows.length) await supabase.from("workflow_stage_tasks").insert(taskRows);
    }
  }
  await activity(supabase, created.data.id, "workflow_created", `${template.data.name} created from a live task template.`, actor); go(`${ROOT}/${created.data.id}?tab=builder`, "Template copied into an editable workflow draft.");
}

export async function updateWorkflowAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}`; const { supabase, actor } = await manager(path); const name = str(fd, "name", 180); const area = str(fd, "area", 30);
  if (!id || !name || !(WORKFLOW_AREAS as readonly string[]).includes(area)) go(path, "Name and area are required.", true); const hours = integer(fd, "target_duration_hours", 0);
  const result = await supabase.from("workflows").update({ name, description: str(fd, "description", 1200) || null, purpose: str(fd, "purpose", 1200) || null, area, owner_id: str(fd, "owner_id", 50) || null, default_priority: str(fd, "priority", 20) || "medium", target_duration_hours: hours > 0 ? hours : null, tags: str(fd, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean) }).eq("id", id); if (result.error) go(path, result.error.message, true);
  await bump(supabase, id); await activity(supabase, id, "workflow_updated", "Workflow configuration updated.", actor); go(path, "Workflow updated.");
}

export async function setWorkflowStatusAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}`; const { supabase, actor } = await manager(path); const status = str(fd, "status", 30);
  if (!(WORKFLOW_STATUSES as readonly string[]).includes(status)) go(path, "Invalid workflow status.", true);
  if (status === "active") { const stages = await supabase.from("workflow_stages").select("id", { count: "exact", head: true }).eq("workflow_id", id); if (!stages.count) go(`${path}?tab=builder`, "Add at least one stage before activating.", true); }
  const result = await supabase.from("workflows").update({ status, archived_at: status === "archived" ? new Date().toISOString() : null }).eq("id", id); if (result.error) go(path, result.error.message, true);
  await activity(supabase, id, `workflow_${status}`, `Workflow moved to ${status}.`, actor); go(status === "archived" ? ROOT : path, `Workflow ${status}.`);
}

export async function addWorkflowStageAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const name = str(fd, "name", 180); const type = str(fd, "stage_type", 30); const rule = str(fd, "completion_rule", 40);
  if (!name || !(STAGE_TYPES as readonly string[]).includes(type) || !(COMPLETION_RULES as readonly string[]).includes(rule)) go(path, "Stage name, type, and completion rule are required.", true);
  const order = await supabase.from("workflow_stages").select("stage_order").eq("workflow_id", id).order("stage_order", { ascending: false }).limit(1); const hours = integer(fd, "target_duration_hours", 0);
  const result = await supabase.from("workflow_stages").insert({ workflow_id: id, stage_order: Number(order.data?.[0]?.stage_order ?? -1) + 1, name, description: str(fd, "description", 1200) || null, stage_type: type, owner_id: str(fd, "owner_id", 50) || null, team: str(fd, "team", 100) || null, target_duration_hours: hours > 0 ? hours : null, priority: str(fd, "priority", 20) || "medium", required: yes(fd, "required"), allow_skip: yes(fd, "allow_skip"), completion_rule: rule }); if (result.error) go(path, result.error.message, true);
  await bump(supabase, id); await activity(supabase, id, "stage_created", `${name} added.`, actor); go(path, "Stage added.");
}

export async function moveWorkflowStageAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase } = await manager(path); const stageId = str(fd, "stage_id", 50); const direction = str(fd, "direction", 10);
  const result = await supabase.from("workflow_stages").select("id,stage_order").eq("workflow_id", id).order("stage_order"); const list = result.data ?? []; const index = list.findIndex((stage) => stage.id === stageId); const targetIndex = direction === "up" ? index - 1 : index + 1; if (index < 0 || targetIndex < 0 || targetIndex >= list.length) go(path, "Stage cannot move there.", true);
  const current = list[index]; const target = list[targetIndex]; await supabase.from("workflow_stages").update({ stage_order: 100000 }).eq("id", current.id); await supabase.from("workflow_stages").update({ stage_order: current.stage_order }).eq("id", target.id); const moved = await supabase.from("workflow_stages").update({ stage_order: target.stage_order }).eq("id", current.id); if (moved.error) go(path, moved.error.message, true); await bump(supabase, id); go(path, "Stage order updated.");
}

export async function updateWorkflowDecisionAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const stageId = str(fd, "stage_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const field = str(fd, "field", 80); const operator = str(fd, "operator", 30); const target = integer(fd, "target_stage_order", -1);
  if (!field || target < 0 || !["equals","not_equals","contains","greater_than","less_than","is_empty","is_not_empty"].includes(operator)) go(path, "Complete the structured decision rule.", true);
  const result = await supabase.from("workflow_stages").update({ branch_rules: [{ field, operator, value: str(fd, "value", 500), target_stage_order: target }] }).eq("workflow_id", id).eq("id", stageId).eq("stage_type", "decision"); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "decision_updated", "A structured branch rule was updated.", actor); go(path, "Decision branch updated for future runs.");
}

export async function duplicateWorkflowAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}`; const { supabase, actor } = await manager(path); const [source, stages] = await Promise.all([supabase.from("workflows").select("*").eq("id", id).single(), supabase.from("workflow_stages").select("*,workflow_stage_tasks(*),workflow_stage_approvals(*),workflow_stage_automations(*),workflow_stage_agents(*)").eq("workflow_id", id).order("stage_order")]); if (!source.data) go(path, "Workflow not found.", true);
  const row = source.data; const copy = await supabase.from("workflows").insert({ name: `${row.name} Copy`, description: row.description, purpose: row.purpose, area: row.area, status: "draft", owner_id: row.owner_id, default_priority: row.default_priority, target_duration_hours: row.target_duration_hours, service_id: row.service_id, project_template_id: row.project_template_id, tags: row.tags, created_by: actor }).select("id").single(); if (copy.error || !copy.data) go(path, copy.error?.message ?? "Workflow could not be duplicated.", true);
  for (const stage of stages.data ?? []) { const created = await supabase.from("workflow_stages").insert({ workflow_id: copy.data.id, stage_order: stage.stage_order, name: stage.name, description: stage.description, stage_type: stage.stage_type, owner_id: stage.owner_id, owner_label: stage.owner_label, team: stage.team, target_duration_hours: stage.target_duration_hours, due_date_rule: stage.due_date_rule, priority: stage.priority, required: stage.required, allow_skip: stage.allow_skip, completion_rule: stage.completion_rule, branch_rules: stage.branch_rules }).select("id").single(); if (!created.data) continue; const tasks = (stage.workflow_stage_tasks ?? []).map((task: Record<string, unknown>) => ({ stage_id: created.data.id, task_order: task.task_order, title: task.title, description: task.description, assignee: task.assignee, priority: task.priority, task_type: task.task_type, due_offset_hours: task.due_offset_hours, required: task.required, checklist: task.checklist, status_mapping: task.status_mapping })); const approvals = (stage.workflow_stage_approvals ?? []).map((approval: Record<string, unknown>) => ({ stage_id: created.data.id, name: approval.name, approval_type: approval.approval_type, approver_id: approval.approver_id, approver_role: approval.approver_role, due_offset_hours: approval.due_offset_hours, required: approval.required, escalation_rule: approval.escalation_rule, comments_required: approval.comments_required })); const automations = (stage.workflow_stage_automations ?? []).map((link: Record<string, unknown>) => ({ stage_id: created.data.id, automation_id: link.automation_id, event_type: link.event_type })); const agents = (stage.workflow_stage_agents ?? []).map((link: Record<string, unknown>) => ({ stage_id: created.data.id, ai_solution_id: link.ai_solution_id, event_type: link.event_type, instructions: link.instructions, require_human_review: link.require_human_review })); if (tasks.length) await supabase.from("workflow_stage_tasks").insert(tasks); if (approvals.length) await supabase.from("workflow_stage_approvals").insert(approvals); if (automations.length) await supabase.from("workflow_stage_automations").insert(automations); if (agents.length) await supabase.from("workflow_stage_agents").insert(agents); }
  await activity(supabase, copy.data.id, "workflow_created", `Duplicated from ${row.name}.`, actor); go(`${ROOT}/${copy.data.id}?tab=builder`, "Workflow duplicated as a draft.");
}

export async function deleteWorkflowStageAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const stageId = str(fd, "stage_id", 50); const runs = await supabase.from("workflow_run_stages").select("id", { count: "exact", head: true }).eq("source_stage_id", stageId); if (runs.count) go(path, "This stage is preserved because a run has used it. Create a new workflow version instead.", true); const result = await supabase.from("workflow_stages").delete().eq("workflow_id", id).eq("id", stageId); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "stage_deleted", "An unused stage was removed.", actor); go(path, "Stage removed.");
}

export async function addWorkflowTaskAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const stageId = str(fd, "stage_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const title = str(fd, "title", 240); if (!title) go(path, "Task title is required.", true);
  const order = await supabase.from("workflow_stage_tasks").select("task_order").eq("stage_id", stageId).order("task_order", { ascending: false }).limit(1); const due = integer(fd, "due_offset_hours", -1);
  const result = await supabase.from("workflow_stage_tasks").insert({ stage_id: stageId, task_order: Number(order.data?.[0]?.task_order ?? -1) + 1, title, description: str(fd, "description", 1000) || null, assignee: str(fd, "assignee", 180) || null, priority: str(fd, "priority", 20) || "medium", task_type: str(fd, "task_type", 30) || "internal", due_offset_hours: due >= 0 ? due : null, required: yes(fd, "required") }); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "stage_task_added", `${title} added as a task template.`, actor); go(path, "Stage task added.");
}

export async function addWorkflowApprovalAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const stageId = str(fd, "stage_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const name = str(fd, "name", 180); if (!name) go(path, "Approval name is required.", true); const due = integer(fd, "due_offset_hours", -1);
  const result = await supabase.from("workflow_stage_approvals").insert({ stage_id: stageId, name, approval_type: str(fd, "approval_type", 30) || "internal", approver_id: str(fd, "approver_id", 50) || null, approver_role: str(fd, "approver_role", 100) || null, due_offset_hours: due >= 0 ? due : null, required: yes(fd, "required"), comments_required: yes(fd, "comments_required") }); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "stage_approval_added", `${name} approval added.`, actor); go(path, "Approval added.");
}

export async function linkWorkflowAutomationAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const stageId = str(fd, "stage_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const automationId = str(fd, "automation_id", 50); const eventType = str(fd, "event_type", 40); if (!automationId) go(path, "Choose an automation.", true);
  const result = await supabase.from("workflow_stage_automations").insert({ stage_id: stageId, automation_id: automationId, event_type: eventType || "stage_entered" }); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "automation_linked", "An existing automation was linked to a stage event.", actor); go(path, "Automation linked.");
}

export async function linkWorkflowAgentAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const stageId = str(fd, "stage_id", 50); const path = `${ROOT}/${id}?tab=builder`; const { supabase, actor } = await manager(path); const solutionId = str(fd, "ai_solution_id", 50); if (!solutionId) go(path, "Choose an AI solution.", true);
  const result = await supabase.from("workflow_stage_agents").insert({ stage_id: stageId, ai_solution_id: solutionId, event_type: str(fd, "event_type", 40) || "stage_entered", instructions: str(fd, "instructions", 2000) || null, require_human_review: true }); if (result.error) go(path, result.error.message, true); await bump(supabase, id); await activity(supabase, id, "ai_agent_linked", "An AI solution was linked with required human review.", actor); go(path, "AI solution linked; human approval remains required.");
}

export async function startWorkflowRunAction(fd: FormData) {
  const id = str(fd, "workflow_id", 50); const path = `${ROOT}/${id}`; const { supabase, actor } = await manager(path); try { const runId = await startWorkflowRun(supabase, { workflowId: id, name: str(fd, "name", 180) || "Workflow Run", clientId: str(fd, "client_id", 50) || null, projectId: str(fd, "project_id", 50) || null, ownerId: str(fd, "owner_id", 50) || null, actor }); go(`${path}/runs/${runId}`, "Workflow run started."); } catch (error) { go(path, error instanceof Error ? error.message : "Run could not start.", true); }
}

export async function advanceWorkflowRunAction(fd: FormData) {
  const workflowId = str(fd, "workflow_id", 50); const runId = str(fd, "run_id", 50); const path = `${ROOT}/${workflowId}/runs/${runId}`; const { supabase, actor } = await manager(path); try { const result = await advanceWorkflowRun(supabase, runId, actor, yes(fd, "allow_skip")); go(path, result === "completed" ? "Workflow completed." : "Advanced to the next stage."); } catch (error) { go(path, error instanceof Error ? error.message : "Run could not advance.", true); }
}

export async function setWorkflowRunStatusAction(fd: FormData) {
  const workflowId = str(fd, "workflow_id", 50); const runId = str(fd, "run_id", 50); const path = `${ROOT}/${workflowId}/runs/${runId}`; const { supabase, actor } = await manager(path); const status = str(fd, "status", 30); if (!["running", "paused", "canceled"].includes(status)) go(path, "Invalid run status.", true); const result = await supabase.from("workflow_runs").update({ status, canceled_at: status === "canceled" ? new Date().toISOString() : null }).eq("id", runId).eq("workflow_id", workflowId); if (result.error) go(path, result.error.message, true); await supabase.from("workflow_activity_events").insert({ workflow_id: workflowId, run_id: runId, event_type: `run_${status}`, body: `Run ${status}.`, actor }); go(path, `Run ${status}.`);
}

export async function decideWorkflowApprovalAction(fd: FormData) {
  const workflowId = str(fd, "workflow_id", 50); const runId = str(fd, "run_id", 50); const path = `${ROOT}/${workflowId}/runs/${runId}`; const { supabase, actor, adminId, role } = await admin(); const approvalId = str(fd, "approval_id", 50); const status = str(fd, "status", 30); if (!['approved','changes_requested','rejected'].includes(status)) go(path, "Invalid approval decision.", true);
  const approval = await supabase.from("workflow_run_approvals").select("approver_id,comments_required").eq("id", approvalId).eq("run_id", runId).single(); if (!approval.data) go(path, "Approval was not found.", true); if (approval.data.approver_id && approval.data.approver_id !== adminId && !["owner", "admin"].includes(role)) go(path, "This approval is assigned to someone else.", true); const comments = str(fd, "comments", 2000); if (approval.data.comments_required && !comments) go(path, "Comments are required for this decision.", true);
  const result = await supabase.from("workflow_run_approvals").update({ status, comments: comments || null, approved_by: status === "approved" ? adminId : null, approved_at: status === "approved" ? new Date().toISOString() : null }).eq("id", approvalId); if (result.error) go(path, result.error.message, true); await supabase.from("workflow_activity_events").insert({ workflow_id: workflowId, run_id: runId, event_type: `approval_${status}`, body: `Approval ${status.replace(/_/g, " ")}.`, actor }); go(path, `Approval ${status.replace(/_/g, " ")}.`);
}
