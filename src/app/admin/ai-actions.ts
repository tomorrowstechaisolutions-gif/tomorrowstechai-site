"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkAndStoreProvider } from "@/lib/ai/providers";
import { syncKnowledgeSource } from "@/lib/ai/knowledge";
import { estimateCostMicroUsd, recordAiUsage, scrub } from "@/lib/ai/record";
import { composePrompt, invalidatePromptCache, resolveSystemPrompt } from "@/lib/ai/prompt";
import { WEBSITE_CHAT_PROMPT } from "@/lib/ai/prompts/website-chat";
import { MICRO_PER_DOLLAR, slugify } from "@/lib/ai/types";

/**
 * Writes for the AI Solutions screens.
 *
 * Same posture as every other action file here: re-check the admin on each
 * call, use the request-scoped client so RLS applies on top of that check,
 * and reach for the service role only where a provider key has to be read.
 *
 * A "use server" module may export nothing but async functions. The shared
 * constants and types live in src/lib/ai/types.ts; an exported const array
 * here is a build error that only `next build` surfaces, so there is none.
 *
 * NOTHING IN THIS FILE ACCEPTS OR RETURNS A PROVIDER KEY. Keys are
 * environment variables read on the server; the forms have no field for one
 * and no action here writes one anywhere.
 */

const AI = "/admin/ai-solutions";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, role: session.admin.role };
}

/** Providers, models, prompts and tool grants are owner/admin only. */
async function requireManager() {
  const session = await requireAdmin();
  if (!["owner", "admin"].includes(session.role)) {
    throw new Error("You do not have permission to change AI solutions.");
  }
  return session;
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function nullable(fd: FormData, key: string, max = 4000): string | null {
  return str(fd, key, max) || null;
}
function bool(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "true" || value === "1";
}
function cents(fd: FormData, key: string): number | null {
  const raw = str(fd, key, 20).replace(/[^0-9.]/g, "");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}
function num(fd: FormData, key: string): number | null {
  const raw = str(fd, key, 20).replace(/[^0-9.]/g, "");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
/** Dollars in the form, micro-dollars in the database. */
function microFromDollars(fd: FormData, key: string): number | null {
  const value = num(fd, key);
  return value === null ? null : Math.round(value * MICRO_PER_DOLLAR);
}
function pick(value: string, allowed: string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback;
}

const TYPES = ["chatbot", "agent", "automation", "internal_assistant", "content_ai", "sales_ai", "support_ai", "workflow_agent", "custom"];
const STATUSES = ["draft", "testing", "active", "paused", "error", "archived"];
const TARGETS = ["website", "app", "client_portal", "internal_admin", "api", "widget", "other"];
const BILLING = ["none", "one_time", "recurring", "usage_based", "included"];
const KNOWLEDGE_TYPES = ["document", "website", "faq", "database", "catalog", "policy", "manual_text", "vector_store", "api", "other"];
const KNOWLEDGE_STATUSES = ["current", "needs_sync", "syncing", "error", "disabled", "not_synced"];
const INTEGRATION_PROVIDERS = ["openai", "anthropic", "google", "perplexity", "supabase", "gmail", "google_calendar", "crm", "stripe", "twilio", "resend", "website_forms", "meta", "slack", "vector_store", "other"];
const INTEGRATION_STATUSES = ["connected", "warning", "disconnected", "not_configured"];
const TOOLS = ["crm_read", "crm_write", "client_data_read", "search_knowledge", "send_email", "send_sms", "create_meeting", "create_task", "generate_proposal", "generate_invoice", "create_content", "publish_social", "billing_read", "billing_write", "notify_admin", "route_ticket", "web_search", "other"];

async function logEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  solutionId: string | null,
  kind: string,
  body: string,
  actor: string
): Promise<void> {
  const { error } = await supabase
    .from("ai_events")
    .insert({ solution_id: solutionId, kind, body: body.slice(0, 500), actor });
  if (error) console.error("[ai:event]", error.message);
}

export type AiActionState = {
  success?: string;
  error?: string;
  completedAt?: string;
};

export type TestResult = AiActionState & {
  reply?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costMicroUsd?: number | null;
  costUnknown?: boolean;
};

/* ══════════════════════════════════════════════════════════════════════
   The solution record
   ══════════════════════════════════════════════════════════════════════ */

export async function createSolutionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();

  const name = str(formData, "name", 160);
  if (!name) return;

  const base = slugify(str(formData, "slug", 60) || name) || "solution";
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const { data: clash } = await supabase.from("ai_solutions").select("id").ilike("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const tags = str(formData, "tags", 300)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  const { data, error } = await supabase
    .from("ai_solutions")
    .insert({
      name,
      slug,
      internal_name: nullable(formData, "internal_name", 160),
      description: nullable(formData, "description", 1000),
      purpose: nullable(formData, "purpose", 500),
      tags,
      solution_type: pick(str(formData, "solution_type", 40), TYPES, "chatbot"),
      status: pick(str(formData, "status", 40), STATUSES, "draft"),
      customer_id: nullable(formData, "customer_id", 40),
      service_id: nullable(formData, "service_id", 40),
      app_id: nullable(formData, "app_id", 40),
      website_id: nullable(formData, "website_id", 40),
      owner: nullable(formData, "owner", 160),
      provider_key: nullable(formData, "provider_key", 40),
      model: nullable(formData, "model", 120),
      fallback_provider_key: nullable(formData, "fallback_provider_key", 40),
      fallback_model: nullable(formData, "fallback_model", 120),
      deployment_target: pick(str(formData, "deployment_target", 40), TARGETS, "internal_admin"),
      deployment_url: nullable(formData, "deployment_url", 500),
      monthly_price_cents: cents(formData, "monthly_price"),
      setup_fee_cents: cents(formData, "setup_fee"),
      usage_markup_pct: num(formData, "usage_markup"),
      billing_type: pick(str(formData, "billing_type", 30), BILLING, "none"),
      created_by: actor,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ai:create]", error?.message);
    return;
  }

  const solutionId = (data as { id: string }).id;

  // A starting prompt, if one was given, saved as version 1 and activated.
  const prompt = str(formData, "system_prompt", 20000);
  if (prompt.length > 20) {
    await supabase.from("ai_solution_versions").insert({
      solution_id: solutionId,
      version: 1,
      system_prompt: prompt,
      status: "active",
      change_notes: "Created with the solution.",
      created_by: actor,
    });
  }

  // Tools chosen on the form. Everything else stays ungranted, which is
  // what least privilege means when there is no row.
  const tools = formData.getAll("tools").filter((t): t is string => typeof t === "string");
  for (const tool of tools) {
    if (!TOOLS.includes(tool)) continue;
    await supabase.from("ai_solution_tools").insert({
      solution_id: solutionId,
      tool,
      allowed: true,
      requires_approval: true,
      granted_by: actor,
      granted_at: new Date().toISOString(),
    });
  }

  await logEvent(supabase, solutionId, "created", `${name} was created.`, actor);
  revalidatePath(AI);
  redirect(`/admin/ai-solutions/${solutionId}`);
}

export async function createFromTemplateAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const templateId = str(formData, "template_id", 40);
  if (!templateId) return;

  const { data: template } = await supabase
    .from("ai_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return;

  const t = template as {
    key: string; name: string; description: string | null; solution_type: string;
    provider_key: string | null; model: string | null; system_prompt: string | null;
    default_tools: string[]; suggested_service_id: string | null;
  };

  const name = str(formData, "name", 160) || t.name;
  const base = slugify(name) || t.key;
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const { data: clash } = await supabase.from("ai_solutions").select("id").ilike("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const { data, error } = await supabase
    .from("ai_solutions")
    .insert({
      name,
      slug,
      description: t.description,
      solution_type: t.solution_type,
      // Draft, always. A template is a starting point, not a deployment,
      // and nothing built from one should be live before a person looks.
      status: "draft",
      provider_key: t.provider_key,
      model: t.model,
      service_id: t.suggested_service_id,
      customer_id: nullable(formData, "customer_id", 40),
      created_by: actor,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ai:template]", error?.message);
    return;
  }

  const solutionId = (data as { id: string }).id;

  if (t.system_prompt) {
    await supabase.from("ai_solution_versions").insert({
      solution_id: solutionId,
      version: 1,
      system_prompt: t.system_prompt,
      status: "draft",
      change_notes: `From the ${t.name} template. Review before activating.`,
      created_by: actor,
    });
  }

  for (const tool of t.default_tools ?? []) {
    if (!TOOLS.includes(tool)) continue;
    await supabase.from("ai_solution_tools").insert({
      solution_id: solutionId,
      tool,
      allowed: true,
      requires_approval: true,
      granted_by: actor,
      granted_at: new Date().toISOString(),
      notes: `Default for the ${t.name} template.`,
    });
  }

  await logEvent(supabase, solutionId, "created", `Created from the ${t.name} template, as a draft.`, actor);
  revalidatePath(AI);
  redirect(`/admin/ai-solutions/${solutionId}`);
}

export async function updateSolutionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "solution_id", 40);
  if (!id) return;

  const { data: before } = await supabase
    .from("ai_solutions")
    .select("name, status, model, provider_key, customer_id, slug")
    .eq("id", id)
    .maybeSingle();
  const previous = before as
    | { name: string; status: string; model: string | null; provider_key: string | null; customer_id: string | null; slug: string }
    | null;

  const tags = str(formData, "tags", 300).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12);

  const patch = {
    name: str(formData, "name", 160) || previous?.name || "Untitled",
    internal_name: nullable(formData, "internal_name", 160),
    description: nullable(formData, "description", 1000),
    purpose: nullable(formData, "purpose", 500),
    tags,
    solution_type: pick(str(formData, "solution_type", 40), TYPES, "chatbot"),
    status: pick(str(formData, "status", 40), STATUSES, "draft"),
    customer_id: nullable(formData, "customer_id", 40),
    service_id: nullable(formData, "service_id", 40),
    app_id: nullable(formData, "app_id", 40),
    website_id: nullable(formData, "website_id", 40),
    owner: nullable(formData, "owner", 160),
    provider_key: nullable(formData, "provider_key", 40),
    model: nullable(formData, "model", 120),
    fallback_provider_key: nullable(formData, "fallback_provider_key", 40),
    fallback_model: nullable(formData, "fallback_model", 120),
    temperature: num(formData, "temperature"),
    max_output_tokens: num(formData, "max_output_tokens"),
    deployment_target: pick(str(formData, "deployment_target", 40), TARGETS, "internal_admin"),
    deployment_url: nullable(formData, "deployment_url", 500),
    monthly_price_cents: cents(formData, "monthly_price"),
    setup_fee_cents: cents(formData, "setup_fee"),
    usage_markup_pct: num(formData, "usage_markup"),
    billing_type: pick(str(formData, "billing_type", 30), BILLING, "none"),
    monthly_cost_warning_micro_usd: microFromDollars(formData, "monthly_cost_warning"),
    daily_spend_limit_micro_usd: microFromDollars(formData, "daily_spend_limit"),
    monthly_token_warning: num(formData, "monthly_token_warning"),
    error_rate_warning_pct: num(formData, "error_rate_warning"),
    notes: nullable(formData, "notes", 4000),
  };

  const { error } = await supabase.from("ai_solutions").update(patch).eq("id", id);
  if (error) {
    console.error("[ai:update]", error.message);
    return;
  }

  if (previous && previous.status !== patch.status) {
    await logEvent(supabase, id, "status_change", `Status moved from ${previous.status} to ${patch.status}.`, actor);
  }
  if (previous && previous.model !== patch.model) {
    await logEvent(supabase, id, "model_changed", `Model changed from ${previous.model ?? "none"} to ${patch.model ?? "none"}.`, actor);
  }
  if (previous && previous.provider_key !== patch.provider_key) {
    await logEvent(supabase, id, "provider_changed", `Provider changed to ${patch.provider_key ?? "none"}.`, actor);
  }
  if (previous && previous.customer_id !== patch.customer_id) {
    await logEvent(supabase, id, "updated", "The client on this solution was changed.", actor);
  }
  await logEvent(supabase, id, "updated", "Solution settings were updated.", actor);

  if (previous?.slug) invalidatePromptCache(previous.slug);
  revalidatePath(AI);
  revalidatePath(`/admin/ai-solutions/${id}`);
}

export async function setSolutionStatusAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "solution_id", 40);
  const status = str(formData, "status", 40);
  if (!id || !STATUSES.includes(status)) return;

  await supabase.from("ai_solutions").update({ status }).eq("id", id);
  await logEvent(supabase, id, "status_change", `Status set to ${status}.`, actor);
  revalidatePath(AI);
  revalidatePath(`/admin/ai-solutions/${id}`);
}

export async function archiveSolutionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "solution_id", 40);
  if (!id) return;
  await supabase.from("ai_solutions").update({ status: "archived" }).eq("id", id);
  await logEvent(supabase, id, "archived", "Solution archived. Nothing was deleted.", actor);
  revalidatePath(AI);
  revalidatePath(`/admin/ai-solutions/${id}`);
}

export async function restoreSolutionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "solution_id", 40);
  if (!id) return;
  await supabase.from("ai_solutions").update({ is_archived: false }).eq("id", id);
  await logEvent(supabase, id, "status_change", "Restored from the archive, paused.", actor);
  revalidatePath(AI);
  revalidatePath(`/admin/ai-solutions/${id}`);
}

/* ══════════════════════════════════════════════════════════════════════
   Prompt versions
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Saves a NEW version. Never an update in place.
 *
 * §12: a prompt update must not overwrite history silently. So every save
 * inserts, the version number is the next one up, and what was live stays
 * exactly as it was until somebody activates the new one.
 */
export async function savePromptVersionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const prompt = str(formData, "system_prompt", 40000);
  if (!solutionId || prompt.length < 20) return;

  const { data: solution } = await supabase
    .from("ai_solutions")
    .select("slug, prompt_editable")
    .eq("id", solutionId)
    .maybeSingle();
  const row = solution as { slug: string; prompt_editable: boolean } | null;
  if (!row?.prompt_editable) return;

  const { data: latest } = await supabase
    .from("ai_solution_versions")
    .select("version")
    .eq("solution_id", solutionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = ((latest as { version: number } | null)?.version ?? 0) + 1;
  const activate = bool(formData, "activate");

  const { error } = await supabase.from("ai_solution_versions").insert({
    solution_id: solutionId,
    version: nextVersion,
    system_prompt: prompt,
    persona: nullable(formData, "persona", 1000),
    tone: nullable(formData, "tone", 500),
    purpose: nullable(formData, "purpose", 1000),
    response_rules: nullable(formData, "response_rules", 4000),
    escalation_rules: nullable(formData, "escalation_rules", 4000),
    fallback_behavior: nullable(formData, "fallback_behavior", 2000),
    safety_rules: nullable(formData, "safety_rules", 4000),
    temperature: num(formData, "temperature"),
    max_output_tokens: num(formData, "max_output_tokens"),
    status: activate ? "active" : "draft",
    change_notes: nullable(formData, "change_notes", 1000),
    created_by: actor,
  });

  if (error) {
    console.error("[ai:prompt]", error.message);
    return;
  }

  await logEvent(
    supabase,
    solutionId,
    "prompt_changed",
    activate
      ? `Prompt version ${nextVersion} saved and activated.`
      : `Prompt version ${nextVersion} saved as a draft.`,
    actor
  );

  if (activate) invalidatePromptCache(row.slug);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function activateVersionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const versionId = str(formData, "version_id", 40);
  if (!solutionId || !versionId) return;

  const { data: solution } = await supabase
    .from("ai_solutions").select("slug, prompt_editable").eq("id", solutionId).maybeSingle();
  const row = solution as { slug: string; prompt_editable: boolean } | null;
  if (!row?.prompt_editable) return;

  const { data: version } = await supabase
    .from("ai_solution_versions").select("version").eq("id", versionId).maybeSingle();

  // The database trigger retires whichever version was live, in the same
  // statement, so there is never a moment with two active or none.
  const { error } = await supabase
    .from("ai_solution_versions")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", versionId)
    .eq("solution_id", solutionId);

  if (error) {
    console.error("[ai:activate]", error.message);
    return;
  }

  await logEvent(
    supabase,
    solutionId,
    "prompt_changed",
    `Version ${(version as { version: number } | null)?.version ?? "?"} is now live.`,
    actor
  );
  invalidatePromptCache(row.slug);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

/**
 * Copies the prompt that is running in the code into version 1.
 *
 * This is how an existing assistant becomes editable without a behaviour
 * change: the first version is byte-for-byte what it was already using.
 */
export async function importCodePromptAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  if (!solutionId) return;

  const { data: solution } = await supabase
    .from("ai_solutions").select("slug, prompt_editable").eq("id", solutionId).maybeSingle();
  const row = solution as { slug: string; prompt_editable: boolean } | null;
  if (!row?.prompt_editable) return;

  const source: Record<string, string> = { "website-chat": WEBSITE_CHAT_PROMPT };
  const prompt = source[row.slug];
  if (!prompt) return;

  const { data: latest } = await supabase
    .from("ai_solution_versions").select("version").eq("solution_id", solutionId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = ((latest as { version: number } | null)?.version ?? 0) + 1;

  await supabase.from("ai_solution_versions").insert({
    solution_id: solutionId,
    version: nextVersion,
    system_prompt: prompt,
    status: "active",
    change_notes: "Imported from the prompt shipped in the code. Identical to what was already running.",
    created_by: actor,
  });

  await logEvent(supabase, solutionId, "prompt_changed",
    `Imported the shipped prompt as version ${nextVersion} and made it live. Behaviour is unchanged.`, actor);
  invalidatePromptCache(row.slug);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

/* ══════════════════════════════════════════════════════════════════════
   The test console
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Runs one message against a prompt, live.
 *
 * It calls the real provider with the real model, so latency and tokens
 * are real. The call is recorded with source = 'test', which keeps it out
 * of the client-facing conversation counts while still charging it
 * honestly against the cost of running this solution — because it did
 * cost that.
 */
export async function testPromptAction(
  _previous: TestResult,
  formData: FormData
): Promise<TestResult> {
  try {
    await requireManager();

    const solutionId = str(formData, "solution_id", 40);
    const message = str(formData, "message", 4000);
    if (!solutionId || !message) return { error: "Type a message to send." };

    const db = supabaseAdmin();
    const { data } = await db
      .from("ai_solutions")
      .select("slug, name, model, provider_key, max_output_tokens, temperature, prompt_editable")
      .eq("id", solutionId)
      .maybeSingle();
    const solution = data as {
      slug: string; name: string; model: string | null; provider_key: string | null;
      max_output_tokens: number | null; temperature: number | null; prompt_editable: boolean;
    } | null;
    if (!solution) return { error: "That solution no longer exists." };
    if (solution.provider_key !== "anthropic") {
      return { error: "Testing is wired up for Anthropic today. Other providers need their client adding first." };
    }
    if (!solution.model) return { error: "Set a model on this solution before testing it." };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { error: "ANTHROPIC_API_KEY is not set on this server." };

    // The draft in the box wins, so a prompt can be tried before it is
    // activated. Otherwise whatever is live.
    const draft = str(formData, "system_prompt", 40000);
    const fallback = solution.slug === "website-chat" ? WEBSITE_CHAT_PROMPT : "You are a helpful assistant.";
    const system = draft.length > 20
      ? draft
      : await resolveSystemPrompt(solution.slug, fallback);

    const override = nullable(formData, "prompt_override", 4000);
    const brandVoice = nullable(formData, "brand_voice", 2000);

    const client = new Anthropic({ apiKey });
    const startedAt = Date.now();

    const response = await client.messages.create({
      model: solution.model,
      max_tokens: Math.min(2048, solution.max_output_tokens ?? 1024),
      system: composePrompt(system, override, brandVoice),
      ...(solution.temperature !== null ? { temperature: Number(solution.temperature) } : {}),
      messages: [{ role: "user", content: message }],
    });

    const latencyMs = Date.now() - startedAt;
    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const { data: rateRow } = await db
      .from("ai_models")
      .select("input_micro_usd_per_mtok, output_micro_usd_per_mtok")
      .eq("provider_key", "anthropic")
      .eq("model", solution.model)
      .maybeSingle();
    const rate = rateRow as { input_micro_usd_per_mtok: number | null; output_micro_usd_per_mtok: number | null } | null;
    const costMicroUsd = estimateCostMicroUsd(
      rate ? { input: rate.input_micro_usd_per_mtok, output: rate.output_micro_usd_per_mtok } : null,
      response.usage?.input_tokens ?? null,
      response.usage?.output_tokens ?? null
    );

    await recordAiUsage({
      slug: solution.slug,
      model: response.model ?? solution.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      latencyMs,
      status: "success",
      eventType: "test",
      source: "test",
      requestRef: response.id ?? null,
      metadata: { surface: "test-console" },
    });

    revalidatePath(`/admin/ai-solutions/${solutionId}`);

    return {
      reply,
      model: response.model ?? solution.model,
      latencyMs,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      costMicroUsd,
      costUnknown: costMicroUsd === null,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { error: scrub(err instanceof Error ? err.message : "The test call failed.").slice(0, 300) };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Knowledge, integrations, tools, deployments
   ══════════════════════════════════════════════════════════════════════ */

export async function saveKnowledgeAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "source_id", 40);
  const name = str(formData, "name", 160);
  if (!solutionId || !name) return;

  const patch = {
    solution_id: solutionId,
    name,
    source_type: pick(str(formData, "source_type", 40), KNOWLEDGE_TYPES, "manual_text"),
    location: nullable(formData, "location", 1000),
    content: nullable(formData, "content", 40000),
    status: id ? pick(str(formData, "status", 40), KNOWLEDGE_STATUSES, "not_synced") : "not_synced",
    refresh_days: num(formData, "refresh_days"),
    owner: nullable(formData, "owner", 160),
  };

  const { error } = id
    ? await supabase.from("ai_knowledge_sources").update(patch).eq("id", id)
    : await supabase.from("ai_knowledge_sources").insert(patch);

  if (error) {
    console.error("[ai:knowledge]", error.message);
    return;
  }
  await logEvent(supabase, solutionId, "knowledge_added", `Knowledge source "${name}" ${id ? "updated" : "added"}.`, actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function deleteKnowledgeAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "source_id", 40);
  if (!solutionId || !id) return;
  await supabase.from("ai_knowledge_sources").delete().eq("id", id).eq("solution_id", solutionId);
  await logEvent(supabase, solutionId, "knowledge_added", "A knowledge source was removed.", actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function syncKnowledgeAction(
  _previous: AiActionState,
  formData: FormData
): Promise<AiActionState> {
  try {
    await requireManager();
    const solutionId = str(formData, "solution_id", 40);
    const sourceId = str(formData, "source_id", 40);
    if (!sourceId) return { error: "No source selected." };

    const result = await syncKnowledgeSource(sourceId);
    revalidatePath(`/admin/ai-solutions/${solutionId}`);
    return result.ok
      ? { success: result.message, completedAt: new Date().toISOString() }
      : { error: result.message, completedAt: new Date().toISOString() };
  } catch (err) {
    return { error: scrub(err instanceof Error ? err.message : "Sync failed.") };
  }
}

export async function saveIntegrationAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "integration_id", 40);
  if (!solutionId) return;

  const provider = pick(str(formData, "provider", 40), INTEGRATION_PROVIDERS, "other");
  const patch = {
    solution_id: solutionId,
    provider,
    label: nullable(formData, "label", 160),
    status: pick(str(formData, "status", 40), INTEGRATION_STATUSES, "not_configured"),
    environment: pick(str(formData, "environment", 30), ["all", "production", "staging", "development"], "all"),
    account_ref: nullable(formData, "account_ref", 200),
    is_required: bool(formData, "is_required"),
  };

  const { error } = id
    ? await supabase.from("ai_integrations").update(patch).eq("id", id)
    : await supabase.from("ai_integrations").upsert(patch, { onConflict: "solution_id,provider,environment" });

  if (error) {
    console.error("[ai:integration]", error.message);
    return;
  }
  await logEvent(supabase, solutionId, "integration", `${provider} integration ${id ? "updated" : "added"}.`, actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function deleteIntegrationAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "integration_id", 40);
  if (!solutionId || !id) return;
  await supabase.from("ai_integrations").delete().eq("id", id).eq("solution_id", solutionId);
  await logEvent(supabase, solutionId, "integration", "An integration was removed.", actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

/**
 * Grant or revoke one tool.
 *
 * Deliberately one tool at a time with an audit line each: a screen that
 * saves a whole permission matrix in one click is a screen where nobody
 * notices what changed.
 */
export async function setToolAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const tool = str(formData, "tool", 40);
  if (!solutionId || !TOOLS.includes(tool)) return;

  const allowed = bool(formData, "allowed");
  const requiresApproval = bool(formData, "requires_approval");

  const { error } = await supabase.from("ai_solution_tools").upsert(
    {
      solution_id: solutionId,
      tool,
      allowed,
      requires_approval: requiresApproval,
      notes: nullable(formData, "notes", 500),
      granted_by: allowed ? actor : null,
      granted_at: allowed ? new Date().toISOString() : null,
    },
    { onConflict: "solution_id,tool" }
  );

  if (error) {
    console.error("[ai:tool]", error.message);
    return;
  }
  await logEvent(
    supabase,
    solutionId,
    "tool_changed",
    `${allowed ? "Granted" : "Revoked"} "${tool}"${allowed && requiresApproval ? " (requires approval)" : ""}.`,
    actor
  );
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function saveDeploymentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "deployment_id", 40);
  const name = str(formData, "name", 160);
  if (!solutionId || !name) return;

  const patch = {
    solution_id: solutionId,
    name,
    customer_id: nullable(formData, "customer_id", 40),
    app_id: nullable(formData, "app_id", 40),
    website_id: nullable(formData, "website_id", 40),
    environment: pick(str(formData, "environment", 30), ["production", "staging", "development"], "production"),
    deployment_url: nullable(formData, "deployment_url", 500),
    prompt_override: nullable(formData, "prompt_override", 8000),
    brand_voice: nullable(formData, "brand_voice", 2000),
    status: pick(str(formData, "status", 30), ["active", "paused", "error", "draft", "ended"], "active"),
    monthly_price_cents: cents(formData, "monthly_price"),
  };

  const { error } = id
    ? await supabase.from("ai_deployments").update(patch).eq("id", id)
    : await supabase.from("ai_deployments").insert(patch);

  if (error) {
    console.error("[ai:deployment]", error.message);
    return;
  }
  await logEvent(supabase, solutionId, "deployment_created", `Deployment "${name}" ${id ? "updated" : "created"}.`, actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function deleteDeploymentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const id = str(formData, "deployment_id", 40);
  if (!solutionId || !id) return;
  await supabase.from("ai_deployments").delete().eq("id", id).eq("solution_id", solutionId);
  await logEvent(supabase, solutionId, "deployment_created", "A client deployment was removed.", actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

/* ══════════════════════════════════════════════════════════════════════
   Providers, models and the rate card
   ══════════════════════════════════════════════════════════════════════ */

export async function testProviderAction(
  _previous: AiActionState,
  formData: FormData
): Promise<AiActionState> {
  try {
    await requireManager();
    const providerKey = str(formData, "provider_key", 40);
    if (!providerKey) return { error: "No provider selected." };

    const result = await checkAndStoreProvider(providerKey);
    revalidatePath(AI);

    const ok = result.status === "operational";
    return ok
      ? { success: `${providerKey}: ${result.detail}`, completedAt: new Date().toISOString() }
      : { error: `${providerKey}: ${result.detail}`, completedAt: new Date().toISOString() };
  } catch (err) {
    return { error: scrub(err instanceof Error ? err.message : "The check failed.") };
  }
}

/**
 * The rate card.
 *
 * Entering a rate here is what turns every cost and margin on these screens
 * from "Rate not set" into a number. It applies from now on: usage already
 * recorded keeps the cost it was priced at, the same way an invoice keeps
 * its amounts.
 */
export async function saveModelRateAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const providerKey = str(formData, "provider_key", 40);
  const model = str(formData, "model", 120);
  if (!providerKey || !model) return;

  const inputRate = num(formData, "input_rate");
  const outputRate = num(formData, "output_rate");

  const { error } = await supabase.from("ai_models").upsert(
    {
      provider_key: providerKey,
      model,
      display_name: nullable(formData, "display_name", 120),
      input_micro_usd_per_mtok: inputRate === null ? null : Math.round(inputRate * MICRO_PER_DOLLAR),
      output_micro_usd_per_mtok: outputRate === null ? null : Math.round(outputRate * MICRO_PER_DOLLAR),
      active: bool(formData, "active"),
      deprecated_on: nullable(formData, "deprecated_on", 20),
    },
    { onConflict: "provider_key,model" }
  );

  if (error) {
    console.error("[ai:rate]", error.message);
    return;
  }
  await logEvent(
    supabase,
    null,
    "updated",
    `Rate card updated for ${providerKey}/${model}${inputRate !== null && outputRate !== null ? "" : " (rate cleared)"}.`,
    actor
  );
  revalidatePath(AI);
}

export async function setDefaultModelAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const providerKey = str(formData, "provider_key", 40);
  const model = str(formData, "model", 120);
  if (!providerKey || !model) return;

  await supabase.from("ai_models").update({ is_default: false }).eq("provider_key", providerKey);
  await supabase.from("ai_models").update({ is_default: true }).eq("provider_key", providerKey).eq("model", model);
  await logEvent(supabase, null, "model_changed", `${model} is now the default for ${providerKey}.`, actor);
  revalidatePath(AI);
}

export async function setProviderEnabledAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const providerKey = str(formData, "provider_key", 40);
  if (!providerKey) return;
  const enabled = bool(formData, "enabled");

  await supabase
    .from("ai_providers")
    .update({ enabled, ...(enabled ? {} : { status: "not_configured", status_detail: "Disabled." }) })
    .eq("key", providerKey);

  await logEvent(supabase, null, "provider_changed", `${providerKey} ${enabled ? "enabled" : "disabled"}.`, actor);
  revalidatePath(AI);
}

/* ══════════════════════════════════════════════════════════════════════
   Alerts and tasks
   ══════════════════════════════════════════════════════════════════════ */

export async function resolveAlertAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "alert_id", 40);
  const solutionId = str(formData, "solution_id", 40);
  if (!id) return;

  await supabase
    .from("ai_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: actor })
    .eq("id", id);

  await logEvent(supabase, solutionId || null, "alert", "An alert was resolved.", actor);
  revalidatePath(AI);
  if (solutionId) revalidatePath(`/admin/ai-solutions/${solutionId}`);
}

export async function createAiTaskAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const solutionId = str(formData, "solution_id", 40);
  const title = str(formData, "title", 200);
  if (!solutionId || !title) return;

  const { data: solution } = await supabase
    .from("ai_solutions").select("customer_id, service_id").eq("id", solutionId).maybeSingle();
  const linked = solution as { customer_id: string | null; service_id: string | null } | null;

  const dueDate = str(formData, "due_date", 20);

  const { error } = await supabase.from("tasks").insert({
    title,
    notes: nullable(formData, "notes", 2000),
    ai_solution_id: solutionId,
    customer_id: linked?.customer_id ?? null,
    service_id: linked?.service_id ?? null,
    type: pick(str(formData, "type", 30), ["ai", "development", "quality", "support", "internal"], "ai"),
    priority: pick(str(formData, "priority", 20), ["low", "medium", "high", "critical"], "medium"),
    status: "not_started",
    owner: nullable(formData, "owner", 160),
    due_at: dueDate ? new Date(`${dueDate}T17:00:00Z`).toISOString() : null,
    created_by: actor,
    source: "manual",
  });

  if (error) {
    console.error("[ai:task]", error.message);
    return;
  }
  await logEvent(supabase, solutionId, "note", `Task created: ${title}`, actor);
  revalidatePath(`/admin/ai-solutions/${solutionId}`);
  revalidatePath("/admin/tasks");
}
