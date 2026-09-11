import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowBoard, WorkflowDetail, WorkflowFilters, WorkflowHealth, WorkflowListItem, WorkflowRun, WorkflowRunStage, WorkflowStage } from "./types";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const one = (value: unknown): Row | null => Array.isArray(value) ? value[0] as Row ?? null : value && typeof value === "object" ? value as Row : null;
const text = (value: unknown) => typeof value === "string" ? value : null;
const num = (value: unknown) => value == null ? null : Number(value);
const nameOf = (value: unknown, fallback = "Unknown") => { const row = one(value); return text(row?.full_name) || text(row?.business_name) || text(row?.name) || text(row?.title) || text(row?.email) || fallback; };
const hoursBetween = (from: unknown, to: unknown) => from && to ? Math.max(0, (new Date(String(to)).getTime() - new Date(String(from)).getTime()) / 3_600_000) : null;

function runFrom(row: Row): WorkflowRun {
  const stages = rows(row.workflow_run_stages).sort((a, b) => Number(a.stage_order) - Number(b.stage_order));
  const completed = stages.filter((stage) => ["completed", "skipped"].includes(String(stage.status))).length;
  const current = stages.find((stage) => ["current", "blocked"].includes(String(stage.status)));
  const now = Date.now();
  const isLate = Boolean(row.due_at && new Date(String(row.due_at)).getTime() < now) || Boolean(current?.due_at && new Date(String(current.due_at)).getTime() < now);
  const health: WorkflowHealth = String(row.status) === "blocked" || String(current?.status) === "blocked" ? "critical" : isLate ? "warning" : stages.length ? "healthy" : "unknown";
  return {
    id: String(row.id), workflowId: String(row.workflow_id), workflowName: nameOf(row.workflows, "Workflow"), name: String(row.name),
    clientId: text(row.client_id), client: row.customers ? nameOf(row.customers) : null,
    projectId: text(row.project_id), project: row.jobs ? nameOf(row.jobs) : null, owner: row.admin_users ? nameOf(row.admin_users) : null,
    status: String(row.status), health, currentStage: current ? String(current.name) : null,
    progress: stages.length ? Math.round(completed / stages.length * 100) : 0,
    startedAt: String(row.started_at), dueAt: text(row.due_at), completedAt: text(row.completed_at),
    stages: stages.map((stage): WorkflowRunStage => ({ id: String(stage.id), order: Number(stage.stage_order), name: String(stage.name), type: String(stage.stage_type), status: String(stage.status), targetHours: num(stage.target_duration_hours), enteredAt: text(stage.entered_at), dueAt: text(stage.due_at), completedAt: text(stage.completed_at), blockedReason: text(stage.blocked_reason), completionRule: String(stage.completion_rule) })),
  };
}

function workflowFrom(row: Row, runs: WorkflowRun[], stageCount: number): WorkflowListItem {
  const active = runs.filter((run) => run.workflowId === row.id && ["running", "paused", "blocked"].includes(run.status));
  const completed = runs.filter((run) => run.workflowId === row.id && run.completedAt);
  const durations = completed.map((run) => hoursBetween(run.startedAt, run.completedAt)).filter((value): value is number => value != null);
  const health: WorkflowHealth = active.some((run) => run.health === "critical") ? "critical" : active.some((run) => run.health === "warning") ? "warning" : active.length ? "healthy" : "unknown";
  return { id: String(row.id), name: String(row.name), description: text(row.description), area: String(row.area) as WorkflowListItem["area"], status: String(row.status) as WorkflowListItem["status"], ownerId: text(row.owner_id), owner: row.admin_users ? nameOf(row.admin_users) : null, priority: String(row.default_priority), targetHours: num(row.target_duration_hours), version: Number(row.version), stageCount, activeRuns: active.length, averageCompletion: active.length ? Math.round(active.reduce((sum, run) => sum + run.progress, 0) / active.length) : null, averageDurationHours: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null, health, updatedAt: String(row.updated_at) };
}

export async function loadWorkflowBoard(sb: SupabaseClient, filters: WorkflowFilters): Promise<WorkflowBoard> {
  let workflowQuery = sb.from("workflows").select("*,admin_users(full_name,email)").neq("status", "archived").limit(100);
  if (filters.q) workflowQuery = workflowQuery.or(`name.ilike.%${filters.q.replace(/[,%()]/g, "")}%,description.ilike.%${filters.q.replace(/[,%()]/g, "")}%`);
  if (filters.area && filters.area !== "all") workflowQuery = workflowQuery.eq("area", filters.area);
  if (filters.status) workflowQuery = workflowQuery.eq("status", filters.status);
  if (filters.owner) workflowQuery = workflowQuery.eq("owner_id", filters.owner);
  const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [workflowResult, stagesResult, runResult, overdueTasks, overdueApprovals, waitingApprovals, templatesResult, ownersResult, clientsResult, projectsResult, automationsResult, agentsResult, activityResult] = await Promise.all([
    workflowQuery,
    sb.from("workflow_stages").select("id,workflow_id").limit(1000),
    sb.from("workflow_runs").select("*,workflows(name),customers(name,business_name),jobs(title),admin_users(full_name,email),workflow_run_stages(*)").order("started_at", { ascending: false }).limit(200),
    sb.from("tasks").select("id,workflow_run_id,title,due_at").not("workflow_run_id", "is", null).not("status", "in", "(completed,canceled)").lt("due_at", now.toISOString()).limit(100),
    sb.from("workflow_run_approvals").select("id,run_id,name,due_at").eq("status", "waiting").lt("due_at", now.toISOString()).limit(100),
    sb.from("workflow_run_approvals").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    sb.from("workflow_templates").select("*").neq("status", "archived").order("updated_at", { ascending: false }).limit(30),
    sb.from("admin_users").select("id,full_name,email").order("full_name"),
    sb.from("customers").select("id,name,business_name").order("business_name").limit(200),
    sb.from("jobs").select("id,title,business_name,customer_id").is("completed_at", null).order("updated_at", { ascending: false }).limit(200),
    sb.from("automations").select("id,name,status").neq("status", "archived").order("name"),
    sb.from("ai_solutions").select("id,name,status").eq("is_archived", false).order("name"),
    sb.from("workflow_activity_events").select("id,event_type,body,actor,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const errors = [workflowResult, stagesResult, runResult, overdueTasks, overdueApprovals, templatesResult, ownersResult, clientsResult, projectsResult, automationsResult, agentsResult, activityResult].map((result) => result.error).filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "Workflow data could not be loaded.");
  const runRows = (runResult.data ?? []) as Row[]; const runs = runRows.map(runFrom);
  const stageCounts = new Map<string, number>(); for (const stage of stagesResult.data ?? []) stageCounts.set(stage.workflow_id, (stageCounts.get(stage.workflow_id) ?? 0) + 1);
  let workflows = ((workflowResult.data ?? []) as Row[]).map((row) => workflowFrom(row, runs, stageCounts.get(String(row.id)) ?? 0));
  if (filters.health) workflows = workflows.filter((workflow) => workflow.health === filters.health);
  if (filters.activeRuns === "yes") workflows = workflows.filter((workflow) => workflow.activeRuns > 0);
  if (filters.activeRuns === "none") workflows = workflows.filter((workflow) => workflow.activeRuns === 0);
  const sorters: Record<WorkflowFilters["sort"], (a: WorkflowListItem, b: WorkflowListItem) => number> = {
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt), active: (a, b) => b.activeRuns - a.activeRuns,
    completion: (a, b) => (a.averageCompletion ?? 101) - (b.averageCompletion ?? 101), duration: (a, b) => (b.averageDurationHours ?? -1) - (a.averageDurationHours ?? -1), name: (a, b) => a.name.localeCompare(b.name),
  }; workflows.sort(sorters[filters.sort]);
  const runMap = new Map(runs.map((run) => [run.id, run]));
  const attention: WorkflowBoard["attention"] = [];
  for (const run of runs) if (run.health === "critical" || run.health === "warning") attention.push({ id: `run-${run.id}`, workflowId: run.workflowId, title: run.name, detail: run.health === "critical" ? `Blocked${run.currentStage ? ` at ${run.currentStage}` : ""}` : `Past target${run.currentStage ? ` in ${run.currentStage}` : ""}`, severity: run.health === "critical" ? "critical" : "warning", href: `/admin/automations/workflows/${run.workflowId}/runs/${run.id}` });
  for (const task of overdueTasks.data ?? []) { const run = runMap.get(task.workflow_run_id); if (run) attention.push({ id: `task-${task.id}`, workflowId: run.workflowId, title: run.name, detail: `Overdue task: ${task.title}`, severity: "warning", href: `/admin/automations/workflows/${run.workflowId}/runs/${run.id}` }); }
  for (const approval of overdueApprovals.data ?? []) { const run = runMap.get(approval.run_id); if (run) attention.push({ id: `approval-${approval.id}`, workflowId: run.workflowId, title: run.name, detail: `Approval overdue: ${approval.name}`, severity: "critical", href: `/admin/automations/workflows/${run.workflowId}/runs/${run.id}` }); }
  const stageDurations = new Map<string, { total: number; target: number; targetCount: number; runs: Set<string> }>();
  for (const row of runRows) for (const stage of rows(row.workflow_run_stages)) { const duration = hoursBetween(stage.entered_at, stage.completed_at); if (duration == null) continue; const key = String(stage.name); const existing = stageDurations.get(key) ?? { total: 0, target: 0, targetCount: 0, runs: new Set<string>() }; existing.total += duration; existing.runs.add(String(row.id)); if (stage.target_duration_hours) { existing.target += Number(stage.target_duration_hours); existing.targetCount += 1; } stageDurations.set(key, existing); }
  const bottlenecks = [...stageDurations].map(([stage, value]) => { const average = value.total / value.runs.size; const target = value.targetCount ? value.target / value.targetCount : null; return { stage, averageHours: average, targetHours: target, varianceHours: target == null ? null : average - target, runs: value.runs.size }; }).sort((a, b) => (b.varianceHours ?? b.averageHours) - (a.varianceHours ?? a.averageHours)).slice(0, 5);
  const completedThisMonth = runs.filter((run) => run.completedAt && run.completedAt >= monthStart).length;
  const activeRuns = runs.filter((run) => ["running", "paused", "blocked"].includes(run.status));
  return {
    workflows, runs: activeRuns, attention: attention.slice(0, 20), bottlenecks,
    templates: ((templatesResult.data ?? []) as Row[]).map((template) => ({ id: String(template.id), name: String(template.name), description: text(template.description), area: String(template.area) as WorkflowListItem["area"], stageCount: rows((template.definition as Row)?.stages).length, sourceTaskTemplateId: text(template.source_task_template_id), status: String(template.status) })),
    owners: (ownersResult.data ?? []).map((owner) => ({ id: owner.id, name: owner.full_name || owner.email, email: owner.email })),
    clients: (clientsResult.data ?? []).map((client) => ({ id: client.id, name: client.business_name || client.name || "Client" })),
    projects: (projectsResult.data ?? []).map((project) => ({ id: project.id, name: project.title || project.business_name || "Project", clientId: project.customer_id })),
    automations: (automationsResult.data ?? []).map((automation) => ({ id: automation.id, name: automation.name, status: automation.status })),
    agents: (agentsResult.data ?? []).map((agent) => ({ id: agent.id, name: agent.name, status: agent.status })),
    activity: (activityResult.data ?? []).map((event) => ({ id: event.id, body: event.body, eventType: event.event_type, actor: event.actor, createdAt: event.created_at })),
    kpis: { activeWorkflows: workflows.filter((workflow) => workflow.status === "active").length, runningInstances: activeRuns.length, waitingApproval: waitingApprovals.count ?? 0, overdueSteps: (overdueTasks.data?.length ?? 0) + (overdueApprovals.data?.length ?? 0), completedThisMonth, needsAttention: new Set(attention.map((item) => item.id)).size },
  };
}

export async function loadWorkflowDetail(sb: SupabaseClient, id: string): Promise<WorkflowDetail | null> {
  const [workflowResult, stagesResult, runsResult, activityResult] = await Promise.all([
    sb.from("workflows").select("*,admin_users(full_name,email)").eq("id", id).maybeSingle(),
    sb.from("workflow_stages").select("*,admin_users(full_name,email),workflow_stage_tasks(*),workflow_stage_approvals(*,admin_users(full_name,email)),workflow_stage_automations(id,automation_id,event_type,automations(name)),workflow_stage_agents(id,ai_solution_id,event_type,require_human_review,ai_solutions(name))").eq("workflow_id", id).order("stage_order"),
    sb.from("workflow_runs").select("*,workflows(name),customers(name,business_name),jobs(title),admin_users(full_name,email),workflow_run_stages(*)").eq("workflow_id", id).order("started_at", { ascending: false }).limit(100),
    sb.from("workflow_activity_events").select("id,event_type,body,actor,created_at").eq("workflow_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!workflowResult.data) return null;
  if (stagesResult.error || runsResult.error || activityResult.error) throw new Error(stagesResult.error?.message ?? runsResult.error?.message ?? activityResult.error?.message);
  const runs = ((runsResult.data ?? []) as Row[]).map(runFrom); const base = workflowFrom(workflowResult.data as Row, runs, stagesResult.data?.length ?? 0);
  const stages: WorkflowStage[] = ((stagesResult.data ?? []) as Row[]).map((stage) => ({
    id: String(stage.id), workflowId: String(stage.workflow_id), order: Number(stage.stage_order), name: String(stage.name), description: text(stage.description), type: String(stage.stage_type) as WorkflowStage["type"], ownerId: text(stage.owner_id), owner: stage.admin_users ? nameOf(stage.admin_users) : text(stage.owner_label), team: text(stage.team), targetHours: num(stage.target_duration_hours), priority: String(stage.priority), required: Boolean(stage.required), allowSkip: Boolean(stage.allow_skip), completionRule: String(stage.completion_rule), branchRules: rows(stage.branch_rules),
    tasks: rows(stage.workflow_stage_tasks).sort((a, b) => Number(a.task_order) - Number(b.task_order)).map((task) => ({ id: String(task.id), order: Number(task.task_order), title: String(task.title), description: text(task.description), assignee: text(task.assignee), priority: String(task.priority), type: String(task.task_type), dueOffsetHours: num(task.due_offset_hours), required: Boolean(task.required) })),
    approvals: rows(stage.workflow_stage_approvals).map((approval) => ({ id: String(approval.id), name: String(approval.name), type: String(approval.approval_type), approverId: text(approval.approver_id), approver: approval.admin_users ? nameOf(approval.admin_users) : text(approval.approver_role), dueOffsetHours: num(approval.due_offset_hours), required: Boolean(approval.required), commentsRequired: Boolean(approval.comments_required) })),
    automations: rows(stage.workflow_stage_automations).map((link) => ({ id: String(link.id), automationId: String(link.automation_id), name: nameOf(link.automations, "Automation"), eventType: String(link.event_type) })),
    agents: rows(stage.workflow_stage_agents).map((link) => ({ id: String(link.id), solutionId: String(link.ai_solution_id), name: nameOf(link.ai_solutions, "AI solution"), eventType: String(link.event_type), requireReview: Boolean(link.require_human_review) })),
  }));
  const runIds = runs.map((run) => run.id); const [tasksResult, approvalsResult] = runIds.length ? await Promise.all([sb.from("tasks").select("id,title,status,priority,due_at,owner,workflow_run_id,workflow_run_stage_id,customers(name,business_name)").in("workflow_run_id", runIds).order("due_at").limit(300), sb.from("workflow_run_approvals").select("*,admin_users!workflow_run_approvals_approver_id_fkey(full_name,email)").in("run_id", runIds).order("requested_at", { ascending: false }).limit(200)]) : [{ data: [] }, { data: [] }];
  return { ...base, purpose: text(workflowResult.data.purpose), createdAt: workflowResult.data.created_at, stages, runsDetail: runs, tasks: (tasksResult.data ?? []) as Array<Record<string, unknown>>, approvals: (approvalsResult.data ?? []) as Array<Record<string, unknown>>, activity: (activityResult.data ?? []).map((event) => ({ id: event.id, body: event.body, eventType: event.event_type, actor: event.actor, createdAt: event.created_at })) };
}

export async function loadWorkflowRun(sb: SupabaseClient, workflowId: string, runId: string) {
  const [run, tasks, approvals, activity] = await Promise.all([
    sb.from("workflow_runs").select("*,workflows(name),customers(name,business_name),jobs(title),admin_users(full_name,email),workflow_run_stages(*)").eq("workflow_id", workflowId).eq("id", runId).maybeSingle(),
    sb.from("tasks").select("*").eq("workflow_run_id", runId).order("due_at"),
    sb.from("workflow_run_approvals").select("*,admin_users!workflow_run_approvals_approver_id_fkey(full_name,email)").eq("run_id", runId).order("requested_at"),
    sb.from("workflow_activity_events").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!run.data) return null; return { run: runFrom(run.data as Row), tasks: tasks.data ?? [], approvals: approvals.data ?? [], activity: activity.data ?? [] };
}
