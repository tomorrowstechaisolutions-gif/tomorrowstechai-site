"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runHealthChecks } from "@/lib/apps/checks";
import {
  connectGithubProvider,
  connectSupabaseProvider,
  connectVercelProvider,
  disconnectProvider,
  listVercelProjects,
  safeMessage,
  type ProviderKey,
} from "@/lib/apps/providers";
import {
  createAppFromProject,
  linkProjectToApp,
  setIgnoredRef,
  syncApps,
  type UnlinkedProject,
} from "@/lib/apps/sync";
import { normalizeHost, slugify } from "@/lib/apps/types";

/**
 * Writes for the Apps screens.
 *
 * Same posture as every other action file here:
 *   - re-check the admin on every call, because a form post is not a page
 *     view and the session may have gone;
 *   - use the REQUEST-SCOPED client so RLS applies on top of that check;
 *   - reach for the service role only where a token has to be read, which
 *     is the provider work, and never to skip a permission check.
 *
 * A NOTE ON THIS FILE'S SHAPE: a "use server" module may export nothing but
 * async functions. Constants and types that these actions and their forms
 * share live in src/lib/apps/types.ts. `export type` is fine — types are
 * erased — but an exported const array here is a build error that only
 * `next build` surfaces, so it does not happen.
 */

const APPS = "/admin/apps";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, role: session.admin.role };
}

/** Infrastructure writes are owner/admin only. Viewers can look, not touch. */
async function requireManager() {
  const session = await requireAdmin();
  if (!["owner", "admin"].includes(session.role)) {
    throw new Error("You do not have permission to change apps.");
  }
  return session;
}

function str(fd: FormData, key: string, max = 2000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(fd: FormData, key: string, max = 2000): string | null {
  const value = str(fd, key, max);
  return value || null;
}

function bool(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "true" || value === "1";
}

function cents(fd: FormData, key: string): number | null {
  const raw = str(fd, key, 20).replace(/[^0-9.]/g, "");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Only values the database will accept, so a bad post is ignored not thrown. */
function pick(value: string, allowed: string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback;
}

const LIFECYCLE = ["planning", "development", "qa", "staging", "live", "paused", "archived"];
const PLATFORMS = ["web", "ios", "android", "web_mobile", "pwa", "internal_tool", "api"];
const OWNERSHIP = ["internal", "client", "joint", "white_label"];
const ENVIRONMENTS = ["production", "staging", "development", "preview"];
const BILLING_TYPES = ["none", "one_time", "recurring", "usage_based", "included"];
const BILLING_STATUSES = ["not_connected", "active", "past_due", "paused", "cancelled"];
const PROVIDERS = [
  "vercel", "supabase", "github", "stripe", "openai", "resend",
  "twilio", "google", "meta", "cloudflare", "sentry", "uptime", "other",
];
const INTEGRATION_STATUSES = ["connected", "needs_attention", "disconnected", "not_configured"];
const REPO_PROVIDERS = ["github", "gitlab", "bitbucket", "other"];

/** The app's own timeline. Written next to the change, never instead of it. */
async function logEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  appId: string,
  kind: string,
  body: string,
  actor: string
): Promise<void> {
  const { error } = await supabase
    .from("app_events")
    .insert({ app_id: appId, kind, body: body.slice(0, 500), actor });
  // A missing audit line must not lose the change that was just made.
  if (error) console.error("[apps:event]", error.message);
}

export type AppActionState = {
  success?: string;
  error?: string;
  completedAt?: string;
};

export type SyncActionState = AppActionState & {
  summary?: {
    projects: number;
    linked: number;
    refreshed: number;
    deployments: number;
    domains: number;
    ignored: number;
  };
  unlinked?: UnlinkedProject[];
};

/* ══════════════════════════════════════════════════════════════════════
   The app record
   ══════════════════════════════════════════════════════════════════════ */

export async function createAppAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();

  const name = str(formData, "name", 160);
  if (!name) return;

  const requested = slugify(str(formData, "slug", 60) || name);
  const base = requested || "app";

  // Slug collisions are the expected failure — two clients both call it
  // "Portal". Suffix rather than reject: nobody should lose a filled form
  // to a name they cannot see.
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const { data: clash } = await supabase.from("apps").select("id").ilike("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const { data, error } = await supabase
    .from("apps")
    .insert({
      name,
      slug,
      internal_name: nullable(formData, "internal_name", 160),
      description: nullable(formData, "description", 1000),
      logo_url: nullable(formData, "logo_url", 500),
      ownership_type: pick(str(formData, "ownership_type", 40), OWNERSHIP, "internal"),
      platform_type: pick(str(formData, "platform_type", 40), PLATFORMS, "web"),
      lifecycle_status: pick(str(formData, "lifecycle_status", 40), LIFECYCLE, "planning"),
      framework: nullable(formData, "framework", 80),
      customer_id: nullable(formData, "customer_id", 40),
      job_id: nullable(formData, "job_id", 40),
      service_id: nullable(formData, "service_id", 40),
      technical_owner: nullable(formData, "technical_owner", 160),
      business_owner: nullable(formData, "business_owner", 160),
      repo_provider: nullable(formData, "repo_url", 500)
        ? pick(str(formData, "repo_provider", 20), REPO_PROVIDERS, "github")
        : null,
      repo_url: nullable(formData, "repo_url", 500),
      default_branch: nullable(formData, "default_branch", 120),
      production_branch: nullable(formData, "production_branch", 120),
      setup_fee_cents: cents(formData, "setup_fee"),
      monthly_fee_cents: cents(formData, "monthly_fee"),
      billing_type: pick(str(formData, "billing_type", 30), BILLING_TYPES, "none"),
      billing_status: pick(str(formData, "billing_status", 30), BILLING_STATUSES, "not_connected"),
      subscription_id: nullable(formData, "subscription_id", 120),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[apps:create]", error?.message);
    return;
  }

  const appId = (data as { id: string }).id;

  // The environments the form offered, created only where a URL was given.
  // An empty "Staging" row would be a promise of an environment that does
  // not exist.
  for (const environment of ["production", "staging", "development"] as const) {
    const url = nullable(formData, `${environment}_url`, 500);
    if (!url) continue;
    const { error: envError } = await supabase.from("app_environments").insert({
      app_id: appId,
      name: environment.charAt(0).toUpperCase() + environment.slice(1),
      environment_type: environment,
      is_production: environment === "production",
      url,
      branch:
        environment === "production"
          ? nullable(formData, "production_branch", 120)
          : nullable(formData, "default_branch", 120),
      hosting_provider: nullable(formData, "hosting_provider", 120),
      hosting_project_id: nullable(formData, "hosting_project_id", 200),
      database_provider: nullable(formData, "database_provider", 120),
      database_project_id: nullable(formData, "database_project_id", 200),
      database_region: nullable(formData, "database_region", 120),
    });
    if (envError) console.error("[apps:create:environment]", envError.message);
  }

  const productionDomain = normalizeHost(str(formData, "production_domain", 253));
  if (productionDomain) {
    const { data: env } = await supabase
      .from("app_environments")
      .select("id")
      .eq("app_id", appId)
      .eq("is_production", true)
      .maybeSingle();
    const { error: domainError } = await supabase.from("app_domains").insert({
      app_id: appId,
      environment_id: (env as { id: string } | null)?.id ?? null,
      domain: productionDomain,
      environment: "production",
      is_primary: true,
      provider: nullable(formData, "hosting_provider", 120),
    });
    if (domainError) console.error("[apps:create:domain]", domainError.message);
  }

  await logEvent(supabase, appId, "created", `${name} was registered.`, actor);
  revalidatePath(APPS);
  redirect(`/admin/apps/${appId}`);
}

export async function updateAppAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "app_id", 40);
  if (!id) return;

  const { data: before } = await supabase
    .from("apps")
    .select("name, lifecycle_status, customer_id, current_version")
    .eq("id", id)
    .maybeSingle();
  const previous = before as
    | { name: string; lifecycle_status: string; customer_id: string | null; current_version: string | null }
    | null;

  const patch: Record<string, string | number | null> = {
    name: str(formData, "name", 160) || previous?.name || "Untitled app",
    internal_name: nullable(formData, "internal_name", 160),
    description: nullable(formData, "description", 1000),
    logo_url: nullable(formData, "logo_url", 500),
    ownership_type: pick(str(formData, "ownership_type", 40), OWNERSHIP, "internal"),
    platform_type: pick(str(formData, "platform_type", 40), PLATFORMS, "web"),
    lifecycle_status: pick(str(formData, "lifecycle_status", 40), LIFECYCLE, "planning"),
    framework: nullable(formData, "framework", 80),
    current_version: nullable(formData, "current_version", 60),
    customer_id: nullable(formData, "customer_id", 40),
    job_id: nullable(formData, "job_id", 40),
    service_id: nullable(formData, "service_id", 40),
    technical_owner: nullable(formData, "technical_owner", 160),
    business_owner: nullable(formData, "business_owner", 160),
    repo_provider: nullable(formData, "repo_url", 500)
      ? pick(str(formData, "repo_provider", 20), REPO_PROVIDERS, "github")
      : null,
    repo_url: nullable(formData, "repo_url", 500),
    default_branch: nullable(formData, "default_branch", 120),
    production_branch: nullable(formData, "production_branch", 120),
    setup_fee_cents: cents(formData, "setup_fee"),
    monthly_fee_cents: cents(formData, "monthly_fee"),
    billing_type: pick(str(formData, "billing_type", 30), BILLING_TYPES, "none"),
    billing_status: pick(str(formData, "billing_status", 30), BILLING_STATUSES, "not_connected"),
    subscription_id: nullable(formData, "subscription_id", 120),
    notes: nullable(formData, "notes", 4000),
  };

  const { error } = await supabase.from("apps").update(patch).eq("id", id);
  if (error) {
    console.error("[apps:update]", error.message);
    return;
  }

  if (previous && previous.lifecycle_status !== patch.lifecycle_status) {
    await logEvent(
      supabase,
      id,
      "status_change",
      `Status moved from ${previous.lifecycle_status} to ${patch.lifecycle_status}.`,
      actor
    );
  }
  if (previous && previous.customer_id !== patch.customer_id) {
    await logEvent(supabase, id, "client_change", "The client on this app was changed.", actor);
  }
  if (previous && previous.current_version !== patch.current_version && patch.current_version) {
    await logEvent(supabase, id, "version", `Live version set to ${patch.current_version}.`, actor);
  }
  if (
    !previous ||
    (previous.lifecycle_status === patch.lifecycle_status && previous.customer_id === patch.customer_id)
  ) {
    await logEvent(supabase, id, "updated", "App details were updated.", actor);
  }

  revalidatePath(APPS);
  revalidatePath(`/admin/apps/${id}`);
}

export async function setAppStatusAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "app_id", 40);
  const status = str(formData, "lifecycle_status", 40);
  if (!id || !LIFECYCLE.includes(status)) return;

  const { error } = await supabase.from("apps").update({ lifecycle_status: status }).eq("id", id);
  if (error) {
    console.error("[apps:status]", error.message);
    return;
  }
  await logEvent(supabase, id, "status_change", `Status set to ${status}.`, actor);
  revalidatePath(APPS);
  revalidatePath(`/admin/apps/${id}`);
}

/**
 * Archive, not delete.
 *
 * An app row carries its deployment history, its incidents and the invoices
 * attributed to it. Deleting one to tidy a list would orphan all of that, so
 * the destructive-looking action is a status change and everything stays.
 */
export async function archiveAppAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "app_id", 40);
  if (!id) return;

  const { error } = await supabase.from("apps").update({ lifecycle_status: "archived" }).eq("id", id);
  if (error) {
    console.error("[apps:archive]", error.message);
    return;
  }
  await logEvent(supabase, id, "archived", "App archived. Nothing was deleted.", actor);
  revalidatePath(APPS);
  revalidatePath(`/admin/apps/${id}`);
}

export async function restoreAppAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = str(formData, "app_id", 40);
  if (!id) return;

  const { error } = await supabase
    .from("apps")
    .update({ is_archived: false })
    .eq("id", id);
  if (error) {
    console.error("[apps:restore]", error.message);
    return;
  }
  await logEvent(supabase, id, "status_change", "App restored from the archive, paused.", actor);
  revalidatePath(APPS);
  revalidatePath(`/admin/apps/${id}`);
}

/* ══════════════════════════════════════════════════════════════════════
   Environments, domains, integrations
   ══════════════════════════════════════════════════════════════════════ */

export async function saveEnvironmentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "environment_id", 40);
  const name = str(formData, "name", 60);
  if (!appId || !name) return;

  const type = pick(str(formData, "environment_type", 30), ENVIRONMENTS, "development");
  const isProduction = bool(formData, "is_production") && type === "production";

  const patch = {
    app_id: appId,
    name,
    environment_type: type,
    is_production: isProduction,
    url: nullable(formData, "url", 500),
    api_base_url: nullable(formData, "api_base_url", 500),
    branch: nullable(formData, "branch", 120),
    hosting_provider: nullable(formData, "hosting_provider", 120),
    hosting_project_id: nullable(formData, "hosting_project_id", 200),
    hosting_team_id: nullable(formData, "hosting_team_id", 200),
    database_provider: nullable(formData, "database_provider", 120),
    database_project_id: nullable(formData, "database_project_id", 200),
    database_region: nullable(formData, "database_region", 120),
    current_version: nullable(formData, "current_version", 60),
  };

  // Only one environment can be production, so demote the incumbent first
  // rather than letting the unique index reject the whole save.
  if (isProduction) {
    let demote = supabase.from("app_environments").update({ is_production: false }).eq("app_id", appId);
    if (id) demote = demote.neq("id", id);
    await demote;
  }

  const { error } = id
    ? await supabase.from("app_environments").update(patch).eq("id", id)
    : await supabase.from("app_environments").insert(patch);

  if (error) {
    console.error("[apps:environment]", error.message);
    return;
  }

  await logEvent(supabase, appId, "updated", `${name} environment ${id ? "updated" : "added"}.`, actor);
  revalidatePath(`/admin/apps/${appId}`);
}

export async function deleteEnvironmentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "environment_id", 40);
  if (!appId || !id) return;

  const { error } = await supabase.from("app_environments").delete().eq("id", id).eq("app_id", appId);
  if (error) {
    console.error("[apps:environment:delete]", error.message);
    return;
  }
  // Deployments and domains keep their rows; their environment_id is set
  // null by the foreign key, so the history is not lost with the label.
  await logEvent(supabase, appId, "updated", "An environment was removed.", actor);
  revalidatePath(`/admin/apps/${appId}`);
}

export async function saveDomainAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "domain_id", 40);
  const domain = normalizeHost(str(formData, "domain", 253));
  if (!appId || !domain || !domain.includes(".")) return;

  const environment = pick(str(formData, "environment", 30), ENVIRONMENTS, "production");
  const isPrimary = bool(formData, "is_primary");

  if (isPrimary) {
    let demote = supabase
      .from("app_domains")
      .update({ is_primary: false })
      .eq("app_id", appId)
      .eq("environment", environment);
    if (id) demote = demote.neq("id", id);
    await demote;
  }

  const patch = {
    app_id: appId,
    domain,
    environment,
    environment_id: nullable(formData, "environment_id", 40),
    provider: nullable(formData, "provider", 120),
    is_primary: isPrimary,
    redirect_to: nullable(formData, "redirect_to", 253),
    website_id: nullable(formData, "website_id", 40),
  };

  const { error } = id
    ? await supabase.from("app_domains").update(patch).eq("id", id)
    : await supabase.from("app_domains").insert(patch);

  if (error) {
    console.error("[apps:domain]", error.message);
    return;
  }
  await logEvent(supabase, appId, "domain", `${domain} ${id ? "updated" : "added"}.`, actor);
  revalidatePath(`/admin/apps/${appId}`);
}

export async function deleteDomainAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "domain_id", 40);
  if (!appId || !id) return;

  const { error } = await supabase.from("app_domains").delete().eq("id", id).eq("app_id", appId);
  if (error) {
    console.error("[apps:domain:delete]", error.message);
    return;
  }
  await logEvent(supabase, appId, "domain", "A domain was removed from this app.", actor);
  revalidatePath(`/admin/apps/${appId}`);
}

/**
 * Recording an integration.
 *
 * This writes an identifier and a status. It does NOT accept a token: there
 * is no secret field on this form and no code path from it to
 * integration_credentials. Connecting an account is a separate, deliberate
 * action further down this file.
 */
export async function saveIntegrationAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "integration_id", 40);
  const provider = pick(str(formData, "provider", 40), PROVIDERS, "other");
  if (!appId) return;

  const patch = {
    app_id: appId,
    provider,
    label: nullable(formData, "label", 160),
    status: pick(str(formData, "status", 40), INTEGRATION_STATUSES, "not_configured"),
    environment: pick(str(formData, "environment", 30), [...ENVIRONMENTS, "all"], "all"),
    account_ref: nullable(formData, "account_ref", 200),
    owner: nullable(formData, "owner", 160),
  };

  const { error } = id
    ? await supabase.from("app_integrations").update(patch).eq("id", id)
    : await supabase
        .from("app_integrations")
        .upsert(patch, { onConflict: "app_id,provider,environment" });

  if (error) {
    console.error("[apps:integration]", error.message);
    return;
  }
  await logEvent(supabase, appId, "integration", `${provider} integration ${id ? "updated" : "added"}.`, actor);
  revalidatePath(`/admin/apps/${appId}`);
}

export async function deleteIntegrationAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "integration_id", 40);
  if (!appId || !id) return;

  const { error } = await supabase.from("app_integrations").delete().eq("id", id).eq("app_id", appId);
  if (error) {
    console.error("[apps:integration:delete]", error.message);
    return;
  }
  await logEvent(supabase, appId, "integration", "An integration was disconnected from this app.", actor);
  revalidatePath(`/admin/apps/${appId}`);
}

/* ══════════════════════════════════════════════════════════════════════
   Incidents and tasks
   ══════════════════════════════════════════════════════════════════════ */

export async function openIncidentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const message = str(formData, "message", 300);
  if (!appId || !message) return;

  const { error } = await supabase.from("app_incidents").insert({
    app_id: appId,
    severity: pick(str(formData, "severity", 20), ["critical", "high", "medium", "low"], "medium"),
    incident_type: pick(
      str(formData, "incident_type", 30),
      ["deployment", "hosting", "database", "api", "domain", "integration", "application", "billing", "other"],
      "other"
    ),
    message,
    detail: nullable(formData, "detail", 2000),
    status: "open",
    opened_by: actor,
  });

  if (error) {
    console.error("[apps:incident]", error.message);
    return;
  }
  await logEvent(supabase, appId, "incident", `Incident opened: ${message}`, actor);
  revalidatePath(`/admin/apps/${appId}`);
  revalidatePath(APPS);
}

export async function resolveIncidentAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const id = str(formData, "incident_id", 40);
  if (!appId || !id) return;

  const { error } = await supabase
    .from("app_incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: actor })
    .eq("id", id)
    .eq("app_id", appId);

  if (error) {
    console.error("[apps:incident:resolve]", error.message);
    return;
  }
  await logEvent(supabase, appId, "incident", "An incident was resolved.", actor);
  revalidatePath(`/admin/apps/${appId}`);
  revalidatePath(APPS);
}

/**
 * Work on an app is a task in the existing Tasks system, with an app_id on
 * it. There is no second task table here, so everything the Tasks board can
 * do — templates, assignment, priority ranking, the drawer — works on these
 * the moment they are created.
 */
export async function createAppTaskAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const title = str(formData, "title", 200);
  if (!appId || !title) return;

  const { data: app } = await supabase
    .from("apps")
    .select("customer_id, job_id, service_id")
    .eq("id", appId)
    .maybeSingle();
  const linked = app as { customer_id: string | null; job_id: string | null; service_id: string | null } | null;

  const dueDate = str(formData, "due_date", 20);

  const { error } = await supabase.from("tasks").insert({
    title,
    notes: nullable(formData, "notes", 2000),
    app_id: appId,
    customer_id: linked?.customer_id ?? null,
    job_id: linked?.job_id ?? null,
    service_id: linked?.service_id ?? null,
    type: pick(
      str(formData, "type", 30),
      ["development", "design", "quality", "launch", "support", "hosting", "internal"],
      "development"
    ),
    priority: pick(str(formData, "priority", 20), ["low", "medium", "high", "critical"], "medium"),
    status: "not_started",
    owner: nullable(formData, "owner", 160),
    due_at: dueDate ? new Date(`${dueDate}T17:00:00Z`).toISOString() : null,
    created_by: actor,
    source: "manual",
  });

  if (error) {
    console.error("[apps:task]", error.message);
    return;
  }
  await logEvent(supabase, appId, "note", `Task created: ${title}`, actor);
  revalidatePath(`/admin/apps/${appId}`);
  revalidatePath("/admin/tasks");
}

/* ══════════════════════════════════════════════════════════════════════
   Providers — connecting, syncing, checking
   ══════════════════════════════════════════════════════════════════════ */

export async function connectProviderAction(
  _previous: AppActionState,
  formData: FormData
): Promise<AppActionState> {
  try {
    const { actor } = await requireManager();
    const provider = str(formData, "provider", 20) as ProviderKey;
    const token = str(formData, "token", 500);

    if (provider === "vercel") {
      await connectVercelProvider(token, str(formData, "team_id", 120), actor);
    } else if (provider === "github") {
      await connectGithubProvider(token, actor);
    } else if (provider === "supabase") {
      await connectSupabaseProvider(token, actor);
    } else {
      return { error: "That provider cannot be connected from here." };
    }

    revalidatePath(APPS);
    return {
      success: `${provider} connected. The token is stored server-side and is never sent to a browser.`,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { error: safeMessage(error, "The connection failed.") };
  }
}

export async function disconnectProviderAction(
  _previous: AppActionState,
  formData: FormData
): Promise<AppActionState> {
  try {
    await requireManager();
    const provider = str(formData, "provider", 20) as ProviderKey;
    if (!["vercel", "github", "supabase"].includes(provider)) {
      return { error: "Unknown provider." };
    }
    await disconnectProvider(provider);
    revalidatePath(APPS);
    return {
      success: `${provider} disconnected. Everything it had already synced is kept.`,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { error: safeMessage(error, "Could not disconnect.") };
  }
}

export async function syncAppsAction(
  previous: SyncActionState,
  formData: FormData
): Promise<SyncActionState> {
  void previous;
  void formData;
  try {
    await requireManager();
    const result = await syncApps();
    if (!result.ok) return { error: result.error ?? "Sync failed." };

    revalidatePath(APPS);
    return {
      success:
        `${result.projects} ${result.projects === 1 ? "project" : "projects"} checked — ` +
        `${result.linked} newly linked, ${result.refreshed} refreshed, ` +
        `${result.unlinked.length} not matched to any app.`,
      summary: {
        projects: result.projects,
        linked: result.linked,
        refreshed: result.refreshed,
        deployments: result.deployments,
        domains: result.domains,
        ignored: result.ignored,
      },
      unlinked: result.unlinked,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { error: safeMessage(error, "Sync failed.") };
  }
}

export async function adoptProjectAction(
  _previous: AppActionState,
  formData: FormData
): Promise<AppActionState> {
  try {
    const { actor } = await requireManager();
    const ref = str(formData, "ref", 120);
    const mode = str(formData, "mode", 20);
    if (!ref) return { error: "No project reference." };

    if (mode === "ignore") {
      await setIgnoredRef("vercel", ref, true);
      revalidatePath(APPS);
      return { success: "Ignored. It will stay out of future syncs until you un-ignore it.", completedAt: new Date().toISOString() };
    }

    if (mode === "link") {
      const appId = str(formData, "app_id", 40);
      if (!appId) return { error: "Choose an app to link it to." };
      await linkProjectToApp(appId, ref);
      revalidatePath(APPS);
      revalidatePath(`/admin/apps/${appId}`);
      return { success: "Linked. Deployments and domains have been pulled in.", completedAt: new Date().toISOString() };
    }

    const appId = await createAppFromProject(ref, actor);
    revalidatePath(APPS);
    revalidatePath(`/admin/apps/${appId}`);
    return {
      success: "App created in development. Set its client, lifecycle and billing when you know them.",
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { error: safeMessage(error, "Could not handle that project.") };
  }
}

export async function runChecksAction(
  _previous: AppActionState,
  formData: FormData
): Promise<AppActionState> {
  try {
    await requireManager();
    const appId = str(formData, "app_id", 40);
    const result = await runHealthChecks(appId || undefined);

    if (appId) revalidatePath(`/admin/apps/${appId}`);
    revalidatePath(APPS);

    if (result.checks === 0) {
      return {
        success:
          "Nothing to check yet. Add an environment URL, a production domain or a provider connection, and the checks will have something to look at.",
        completedAt: new Date().toISOString(),
      };
    }

    const parts = [
      `${result.checks} ${result.checks === 1 ? "check" : "checks"} run across ${result.apps} ${result.apps === 1 ? "app" : "apps"}`,
    ];
    if (result.incidentsOpened > 0) parts.push(`${result.incidentsOpened} incident(s) opened`);
    if (result.incidentsResolved > 0) parts.push(`${result.incidentsResolved} auto-resolved`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} provider error(s)`);

    return { success: `${parts.join(" · ")}.`, completedAt: new Date().toISOString() };
  } catch (error) {
    return { error: safeMessage(error, "The health check run failed.") };
  }
}

/**
 * Redeploy.
 *
 * This really does start a build on Vercel, so it is gated three ways: the
 * integration must exist, the caller must be an owner or admin, and the UI
 * asks for confirmation naming the environment. It records what it did
 * before it returns, so a production build started from this screen is
 * never a mystery afterwards.
 */
export async function redeployAction(
  _previous: AppActionState,
  formData: FormData
): Promise<AppActionState> {
  try {
    const { supabase, actor } = await requireManager();
    const appId = str(formData, "app_id", 40);
    const deploymentId = str(formData, "deployment_id", 120);
    if (!appId || !deploymentId) return { error: "No deployment selected." };

    const { data: row } = await supabase
      .from("app_deployments")
      .select("external_deployment_id, environment, provider")
      .eq("id", deploymentId)
      .eq("app_id", appId)
      .maybeSingle();
    const deployment = row as
      | { external_deployment_id: string | null; environment: string; provider: string }
      | null;

    if (!deployment?.external_deployment_id || deployment.provider !== "vercel") {
      return { error: "This deployment did not come from a connected provider, so it cannot be redeployed." };
    }

    const { data: integration } = await supabase
      .from("app_integrations")
      .select("account_ref")
      .eq("app_id", appId)
      .eq("provider", "vercel")
      .maybeSingle();
    const projectRef = (integration as { account_ref: string | null } | null)?.account_ref;
    if (!projectRef) return { error: "This app is not linked to a Vercel project." };

    const projects = await listVercelProjects();
    if (!projects.ok) return { error: projects.error };
    const project = projects.data.find((p) => p.id === projectRef);
    if (!project) return { error: "The linked Vercel project is no longer on this team." };

    const credential = await supabaseAdmin()
      .from("integration_credentials")
      .select("access_token, account_ref")
      .eq("provider", "vercel")
      .maybeSingle();
    const token = (credential.data as { access_token: string | null } | null)?.access_token;
    const teamId = (credential.data as { account_ref: string | null } | null)?.account_ref ?? null;
    if (!token) return { error: "Vercel is not connected." };

    const created = await fetch(
      `https://api.vercel.com/v13/deployments${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          deploymentId: deployment.external_deployment_id,
          target: deployment.environment === "production" ? "production" : undefined,
          meta: { redeployedFrom: "tomorrowstechai-admin", redeployedBy: actor },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!created.ok) {
      const body = (await created.json().catch(() => ({}))) as { error?: { message?: string } };
      return { error: safeMessage(new Error(body.error?.message ?? `Vercel returned ${created.status}.`), "Redeploy failed.") };
    }

    await logEvent(
      supabase,
      appId,
      "deployment",
      `Redeploy of the ${deployment.environment} deployment was started from the admin.`,
      actor
    );
    revalidatePath(`/admin/apps/${appId}`);
    return {
      success: "Redeploy started on Vercel. Sync in a minute to see the result — this screen does not guess at build states.",
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { error: safeMessage(error, "Redeploy failed.") };
  }
}

/**
 * Marks a deployment's version as the one believed to be live.
 *
 * It does not promote anything on the provider — that would be a deploy.
 * It records what production is running, which is the question the Overview
 * tab asks and nothing else could answer.
 */
export async function markLiveVersionAction(formData: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const appId = str(formData, "app_id", 40);
  const deploymentId = str(formData, "deployment_id", 40);
  if (!appId || !deploymentId) return;

  const { data: row } = await supabase
    .from("app_deployments")
    .select("version, commit_sha, environment")
    .eq("id", deploymentId)
    .eq("app_id", appId)
    .maybeSingle();
  const deployment = row as { version: string | null; commit_sha: string | null; environment: string } | null;
  if (!deployment) return;

  const version = deployment.version ?? deployment.commit_sha?.slice(0, 7) ?? null;
  if (!version) return;

  await supabase.from("apps").update({ current_version: version }).eq("id", appId);
  await supabase
    .from("app_environments")
    .update({ current_version: version })
    .eq("app_id", appId)
    .eq("is_production", true);

  await logEvent(supabase, appId, "version", `Production is recorded as running ${version}.`, actor);
  revalidatePath(`/admin/apps/${appId}`);
}
