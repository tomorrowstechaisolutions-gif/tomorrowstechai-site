"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { executeAutomation, invalidVariables, nextSchedule, SUPPORTED_ACTIONS } from "@/lib/automations/engine";
import { AUTOMATION_CATEGORIES, AUTOMATION_STATUSES, STEP_TYPES } from "@/lib/automations/types";

const ROOT = "/admin/automations";
const str = (fd: FormData, key: string, max = 5000) => { const value = fd.get(key); return typeof value === "string" ? value.trim().slice(0, max) : ""; };
const int = (fd: FormData, key: string, fallback = 0) => { const value = Number(str(fd, key, 20)); return Number.isFinite(value) ? Math.round(value) : fallback; };
const json = (value: string): Record<string, unknown> => { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } };

async function requireManager() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  if (!(["owner", "admin"] as string[]).includes(session.admin.role)) redirect(`${ROOT}?error=You+do+not+have+permission+to+change+automations`);
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email, adminId: session.admin.id };
}

function go(path: string, message: string, error = false): never {
  revalidatePath(ROOT); revalidatePath(path);
  redirect(`${path}?${error ? "error" : "notice"}=${encodeURIComponent(message)}`);
}

async function activity(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, input: { automationId?: string | null; runId?: string | null; type: string; body: string; actor: string }) {
  await sb.from("automation_activity_events").insert({ automation_id: input.automationId ?? null, run_id: input.runId ?? null, event_type: input.type, body: input.body, actor: input.actor });
}

export async function createAutomationAction(fd: FormData) {
  const { supabase, actor, adminId } = await requireManager();
  const name = str(fd, "name", 180); const triggerId = str(fd, "trigger_definition_id", 50);
  const category = str(fd, "category", 30); if (!name || !triggerId || !(AUTOMATION_CATEGORIES as readonly string[]).includes(category)) go(ROOT, "Name, category, and trigger are required.", true);
  const ownerId = str(fd, "owner_id", 50) || adminId; const estimated = int(fd, "estimated_minutes_saved", -1);
  const { data, error } = await supabase.from("automations").insert({
    name, description: str(fd, "description", 1000) || null, category, status: "draft", owner_id: ownerId,
    trigger_definition_id: triggerId, trigger_config: {}, tags: str(fd, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    estimated_minutes_saved: estimated >= 0 ? estimated : null, created_by: actor,
  }).select("id").single();
  if (error || !data) go(ROOT, error?.message ?? "Automation could not be created.", true);
  const trigger = await supabase.from("automation_trigger_definitions").select("name,key").eq("id", triggerId).single();
  await supabase.from("automation_steps").insert({ automation_id: data.id, step_order: 0, step_type: "trigger", name: trigger.data?.name ?? "Trigger", config: { event: trigger.data?.key ?? "unknown" } });
  await activity(supabase, { automationId: data.id, type: "automation_created", body: `${name} created as a draft.`, actor });
  go(`${ROOT}/${data.id}`, "Automation created. Add an action, dry-run it, then activate it.");
}

export async function updateAutomationAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); if (!id) go(ROOT, "Automation is missing.", true);
  const name = str(fd, "name", 180); const category = str(fd, "category", 30);
  if (!name || !(AUTOMATION_CATEGORIES as readonly string[]).includes(category)) go(`${ROOT}/${id}`, "Name and category are required.", true);
  const estimated = int(fd, "estimated_minutes_saved", -1);
  const { error } = await supabase.from("automations").update({ name, description: str(fd, "description", 1000) || null, category, owner_id: str(fd, "owner_id", 50) || null, tags: str(fd, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20), estimated_minutes_saved: estimated >= 0 ? estimated : null }).eq("id", id);
  if (error) go(`${ROOT}/${id}`, error.message, true);
  await activity(supabase, { automationId: id, type: "automation_edited", body: "Basic configuration updated.", actor }); go(`${ROOT}/${id}`, "Automation updated.");
}

export async function setAutomationStatusAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const status = str(fd, "status", 20);
  if (!id || !(AUTOMATION_STATUSES as readonly string[]).includes(status)) go(ROOT, "Invalid status change.", true);
  if (status === "active") {
    const [automation, steps] = await Promise.all([supabase.from("automations").select("trigger_definition_id,trigger_config").eq("id", id).single(), supabase.from("automation_steps").select("step_type,action_type,config").eq("automation_id", id).eq("enabled", true)]);
    const actions = (steps.data ?? []).filter((step) => step.step_type === "action");
    const invalid = (steps.data ?? []).flatMap((step) => invalidVariables(step.config));
    const unsupported = actions.filter((step) => !SUPPORTED_ACTIONS.has(step.action_type ?? "") && !String(step.action_type ?? "").startsWith("send_legacy_followup"));
    if (!automation.data?.trigger_definition_id || !actions.length || invalid.length || unsupported.length) go(`${ROOT}/${id}`, invalid.length ? `Invalid variables: ${[...new Set(invalid)].join(", ")}` : unsupported.length ? "One or more actions are not supported by the live engine." : "Add a trigger and at least one action before activating.", true);
    const trigger = await supabase.from("automation_trigger_definitions").select("key").eq("id", automation.data.trigger_definition_id).single();
    const schedule = trigger.data?.key === "scheduled_time" ? nextSchedule(automation.data.trigger_config ?? {}).toISOString() : null;
    await supabase.from("automations").update({ status, next_run_at: schedule, archived_at: null }).eq("id", id);
  } else await supabase.from("automations").update({ status, archived_at: status === "archived" ? new Date().toISOString() : null, next_run_at: status === "paused" || status === "archived" ? null : undefined }).eq("id", id);
  await activity(supabase, { automationId: id, type: `automation_${status}`, body: `Automation moved to ${status}.`, actor }); go(`${ROOT}/${id}`, `Automation ${status}.`);
}

export async function duplicateAutomationAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50);
  const source = await supabase.from("automations").select("*").eq("id", id).single(); if (!source.data) go(ROOT, "Automation was not found.", true);
  const row = source.data; const { data: copy, error } = await supabase.from("automations").insert({ name: `${row.name} Copy`, description: row.description, category: row.category, status: "draft", owner_id: row.owner_id, trigger_definition_id: row.trigger_definition_id, trigger_config: row.trigger_config, tags: row.tags, estimated_minutes_saved: row.estimated_minutes_saved, retry_policy: row.retry_policy, failure_threshold: row.failure_threshold, failure_notifications: row.failure_notifications, source_system: "automation_engine", locked_execution: false, created_by: actor }).select("id").single();
  if (error || !copy) go(ROOT, error?.message ?? "Automation could not be duplicated.", true);
  const steps = await supabase.from("automation_steps").select("step_order,step_type,name,action_type,config,branch_key,enabled").eq("automation_id", id).order("step_order");
  if (steps.data?.length) await supabase.from("automation_steps").insert(steps.data.map((step) => ({ ...step, automation_id: copy.id })));
  await activity(supabase, { automationId: copy.id, type: "automation_created", body: `Duplicated from ${row.name}.`, actor }); go(`${ROOT}/${copy.id}`, "Automation duplicated as a draft.");
}

export async function addAutomationStepAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const type = str(fd, "step_type", 20);
  if (!id || !(STEP_TYPES as readonly string[]).includes(type) || type === "trigger") go(`${ROOT}/${id}`, "Choose a valid step type.", true);
  const orderResult = await supabase.from("automation_steps").select("step_order").eq("automation_id", id).eq("branch_key", "main").order("step_order", { ascending: false }).limit(1);
  const order = Number(orderResult.data?.[0]?.step_order ?? -1) + 1; let config: Record<string, unknown> = {};
  let actionType: string | null = null; const name = str(fd, "name", 180) || (type === "condition" ? "Condition" : type === "delay" ? "Wait" : type === "branch" ? "IF / ELSE" : "Action");
  if (type === "condition" || type === "branch") config = { logic: str(fd, "logic", 3) || "AND", rules: [{ field: str(fd, "field", 100), operator: str(fd, "operator", 30) || "equals", value: str(fd, "value", 500) }] };
  if (type === "delay") config = { amount: Math.max(1, int(fd, "amount", 1)), unit: str(fd, "unit", 20) || "hours", timezone: str(fd, "timezone", 80) || "America/Chicago" };
  if (type === "action") { actionType = str(fd, "action_type", 80); if (!SUPPORTED_ACTIONS.has(actionType)) go(`${ROOT}/${id}`, "That action is not backed by the current application and cannot be enabled.", true); config = actionType === "create_task" ? { title: str(fd, "title", 240) || "Automation follow-up", priority: str(fd, "priority", 20) || "medium", due_in_days: Math.max(0, int(fd, "due_in_days", 1)), type: str(fd, "task_type", 30) || "automation" } : { message: str(fd, "message", 500) || "Automation needs attention" }; }
  if (invalidVariables(config).length) go(`${ROOT}/${id}`, `Invalid variables: ${invalidVariables(config).join(", ")}`, true);
  const { error } = await supabase.from("automation_steps").insert({ automation_id: id, step_order: order, step_type: type, name, action_type: actionType, config }); if (error) go(`${ROOT}/${id}`, error.message, true);
  await activity(supabase, { automationId: id, type: "automation_step_added", body: `${name} added.`, actor }); go(`${ROOT}/${id}`, "Step added.");
}

export async function deleteAutomationStepAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const stepId = str(fd, "step_id", 50);
  const step = await supabase.from("automation_steps").select("step_type,name").eq("id", stepId).eq("automation_id", id).single();
  if (!step.data || step.data.step_type === "trigger") go(`${ROOT}/${id}`, "The trigger cannot be deleted; edit the automation trigger instead.", true);
  await supabase.from("automation_steps").delete().eq("id", stepId).eq("automation_id", id); await activity(supabase, { automationId: id, type: "automation_step_deleted", body: `${step.data.name} removed.`, actor }); go(`${ROOT}/${id}`, "Step removed.");
}

export async function duplicateAutomationStepAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const stepId = str(fd, "step_id", 50);
  const [step, order] = await Promise.all([supabase.from("automation_steps").select("*").eq("id", stepId).eq("automation_id", id).single(), supabase.from("automation_steps").select("step_order").eq("automation_id", id).eq("branch_key", "main").order("step_order", { ascending: false }).limit(1)]);
  if (!step.data || step.data.step_type === "trigger") go(`${ROOT}/${id}`, "That step cannot be duplicated.", true);
  const row = step.data; const { error } = await supabase.from("automation_steps").insert({ automation_id: id, step_order: Number(order.data?.[0]?.step_order ?? 0) + 1, step_type: row.step_type, name: `${row.name} Copy`, action_type: row.action_type, config: row.config, branch_key: row.branch_key, enabled: row.enabled }); if (error) go(`${ROOT}/${id}`, error.message, true);
  await activity(supabase, { automationId: id, type: "automation_step_added", body: `${row.name} duplicated.`, actor }); go(`${ROOT}/${id}`, "Step duplicated.");
}

export async function updateAutomationStepAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const stepId = str(fd, "step_id", 50);
  const step = await supabase.from("automation_steps").select("step_type,action_type").eq("id", stepId).eq("automation_id", id).single(); if (!step.data) go(`${ROOT}/${id}`, "Step not found.", true);
  const config = json(str(fd, "config_json", 10000) || "{}"); const invalid = invalidVariables(config); if (invalid.length) go(`${ROOT}/${id}`, `Invalid variables: ${invalid.join(", ")}`, true);
  const actionType = step.data.step_type === "action" ? str(fd, "action_type", 80) || step.data.action_type : null;
  if (step.data.step_type === "action" && !SUPPORTED_ACTIONS.has(actionType ?? "") && !String(actionType).startsWith("send_legacy_followup")) go(`${ROOT}/${id}`, "That action is not backed by the current application.", true);
  const { error } = await supabase.from("automation_steps").update({ name: str(fd, "name", 180) || "Step", action_type: actionType, config }).eq("id", stepId).eq("automation_id", id); if (error) go(`${ROOT}/${id}`, error.message, true);
  await activity(supabase, { automationId: id, type: "automation_step_edited", body: "A flow step was updated.", actor }); go(`${ROOT}/${id}`, "Step updated.");
}

export async function moveAutomationStepAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const stepId = str(fd, "step_id", 50); const direction = str(fd, "direction", 10);
  const rows = await supabase.from("automation_steps").select("id,step_order,step_type").eq("automation_id", id).eq("branch_key", "main").order("step_order");
  const list = rows.data ?? []; const index = list.findIndex((row) => row.id === stepId); const target = direction === "up" ? index - 1 : index + 1;
  if (index <= 0 && direction === "up" || target < 0 || target >= list.length || list[index]?.step_type === "trigger") go(`${ROOT}/${id}`, "That step cannot move there.", true);
  const moving = list[index]; const other = list[target]; if (other.step_type === "trigger") go(`${ROOT}/${id}`, "The trigger must remain first.", true);
  await supabase.from("automation_steps").update({ step_order: 100000 }).eq("id", moving.id);
  await supabase.from("automation_steps").update({ step_order: moving.step_order }).eq("id", other.id);
  const result = await supabase.from("automation_steps").update({ step_order: other.step_order }).eq("id", moving.id); if (result.error) go(`${ROOT}/${id}`, result.error.message, true);
  await activity(supabase, { automationId: id, type: "automation_step_reordered", body: "Flow order changed.", actor }); go(`${ROOT}/${id}`, "Step reordered.");
}

export async function updateAutomationTriggerAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const triggerId = str(fd, "trigger_definition_id", 50); const config = json(str(fd, "trigger_config", 10000) || "{}");
  const trigger = await supabase.from("automation_trigger_definitions").select("name,key").eq("id", triggerId).eq("enabled", true).single(); if (!trigger.data) go(`${ROOT}/${id}`, "Choose a supported trigger.", true);
  const { error } = await supabase.from("automations").update({ trigger_definition_id: triggerId, trigger_config: config, next_run_at: trigger.data.key === "scheduled_time" ? nextSchedule(config).toISOString() : null }).eq("id", id); if (error) go(`${ROOT}/${id}`, error.message, true);
  await supabase.from("automation_steps").update({ name: trigger.data.name, config: { event: trigger.data.key, ...config } }).eq("automation_id", id).eq("step_type", "trigger");
  await activity(supabase, { automationId: id, type: "automation_trigger_changed", body: `Trigger changed to ${trigger.data.name}.`, actor }); go(`${ROOT}/${id}`, "Trigger updated.");
}

export async function testAutomationAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const id = str(fd, "automation_id", 50); const mode = str(fd, "mode", 20) === "test" ? "test" : "dry_run";
  const context = json(str(fd, "context", 10000) || "{}"); const result = await executeAutomation(supabase, { automationId: id, mode, context, actor }); go(`${ROOT}/${id}`, `${mode === "dry_run" ? "Dry run" : "Test run"} ${result.status}. Open Run History for the step-by-step result.`);
}

export async function applyAutomationTemplateAction(fd: FormData) {
  const { supabase, actor, adminId } = await requireManager(); const templateId = str(fd, "template_id", 50);
  const template = await supabase.from("automation_templates").select("*").eq("id", templateId).eq("enabled", true).single(); if (!template.data) go(ROOT, "Template not found.", true);
  const { data: automation, error } = await supabase.from("automations").insert({ name: template.data.name, description: template.data.description, category: template.data.category, status: "draft", owner_id: adminId, trigger_definition_id: template.data.trigger_definition_id, trigger_config: {}, tags: ["template"], created_by: actor }).select("id").single(); if (error || !automation) go(ROOT, error?.message ?? "Template could not be copied.", true);
  const definition = template.data.definition as { steps?: Array<{ type?: string; name?: string; action_type?: string; config?: Record<string, unknown> }> };
  const trigger = await supabase.from("automation_trigger_definitions").select("name,key").eq("id", template.data.trigger_definition_id).single();
  const rows = [{ automation_id: automation.id, step_order: 0, step_type: "trigger", name: trigger.data?.name ?? "Trigger", config: { event: trigger.data?.key ?? "unknown" } }, ...(definition.steps ?? []).map((step, index) => ({ automation_id: automation.id, step_order: index + 1, step_type: step.type ?? "action", name: step.name ?? "Action", action_type: step.action_type ?? null, config: step.config ?? {} }))];
  await supabase.from("automation_steps").insert(rows); await activity(supabase, { automationId: automation.id, type: "automation_template_applied", body: `Created from ${template.data.name}.`, actor }); go(`${ROOT}/${automation.id}`, "Template copied into an editable draft.");
}

export async function resolveAutomationErrorAction(fd: FormData) {
  const { supabase, actor } = await requireManager(); const errorId = str(fd, "error_id", 50); const automationId = str(fd, "automation_id", 50);
  await supabase.from("automation_errors").update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: actor }).eq("id", errorId).eq("automation_id", automationId); await activity(supabase, { automationId, type: "automation_recovered", body: "An automation error was marked resolved.", actor }); go(`${ROOT}/${automationId}`, "Error marked resolved.");
}
