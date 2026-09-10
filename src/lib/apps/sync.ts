import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listVercelProjects, safeMessage, type VercelDeployment, type VercelProject } from "./providers";
import { normalizeHost, slugify, type DeploymentStatus } from "./types";

/**
 * Sync Apps.
 *
 * §33 of the brief is explicit and this file obeys it: syncing does NOT
 * create an app for every project it finds. Vercel teams are full of
 * preview forks, abandoned spikes and one-off landing pages; importing them
 * all would turn the portfolio into a list of noise on the first run and
 * John would stop opening it.
 *
 * So the contract is:
 *   - a project already linked to an app  → refresh it (deployments,
 *     domains, framework, repository, environment timestamps)
 *   - a project that matches an app by domain or repository → link it, and
 *     say so in the result
 *   - anything else → reported as an UNLINKED PROJECT for a person to
 *     decide about: create an app, link it to an existing one, or ignore it
 *
 * Nothing here overwrites a human's answer. Client ownership, lifecycle
 * status, billing, description and notes are never touched by a sync — only
 * facts the provider is the authority on.
 */

export type UnlinkedProject = {
  ref: string;
  name: string;
  provider: "vercel";
  domain: string | null;
  framework: string | null;
  repoSlug: string | null;
  lastDeployAt: string | null;
  lastDeployState: string | null;
};

export type SyncResult = {
  ok: boolean;
  error?: string;
  projects: number;
  linked: number;
  refreshed: number;
  deployments: number;
  domains: number;
  unlinked: UnlinkedProject[];
  ignored: number;
};

function deploymentStatus(state: string): DeploymentStatus {
  if (state === "READY") return "success";
  if (state === "BUILDING" || state === "INITIALIZING") return "building";
  if (state === "QUEUED") return "queued";
  if (state === "CANCELED") return "canceled";
  return "failed";
}

function environmentOf(target: string | null): "production" | "preview" {
  return target === "production" ? "production" : "preview";
}

/** Real custom domains, ignoring the *.vercel.app and per-branch aliases. */
function customDomains(project: VercelProject): string[] {
  return project.domains
    .filter((d) => d.verified && !d.gitBranch && !d.redirect)
    .map((d) => normalizeHost(d.name))
    .filter((d) => d && !d.endsWith(".vercel.app"));
}

export async function readIgnoredRefs(provider: "vercel"): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("integration_credentials")
    .select("ignored_refs")
    .eq("provider", provider)
    .maybeSingle();
  return ((data as { ignored_refs?: string[] } | null)?.ignored_refs ?? []).filter(Boolean);
}

export async function setIgnoredRef(
  provider: "vercel",
  ref: string,
  ignored: boolean
): Promise<void> {
  const current = await readIgnoredRefs(provider);
  const next = ignored
    ? [...new Set([...current, ref])]
    : current.filter((r) => r !== ref);
  const { error } = await supabaseAdmin()
    .from("integration_credentials")
    .update({ ignored_refs: next })
    .eq("provider", provider);
  if (error) throw new Error(error.message);
}

export async function syncApps(): Promise<SyncResult> {
  const empty: SyncResult = {
    ok: false, projects: 0, linked: 0, refreshed: 0,
    deployments: 0, domains: 0, unlinked: [], ignored: 0,
  };

  const projectResult = await listVercelProjects();
  if (!projectResult.ok) return { ...empty, error: projectResult.error };

  const db = supabaseAdmin();
  const projects = projectResult.data;

  try {
    const ignoredRefs = new Set(await readIgnoredRefs("vercel"));

    const [{ data: apps, error: appsError }, { data: links, error: linksError }, { data: domainRows, error: domainsError }, { data: envRows, error: envsError }] =
      await Promise.all([
        db.from("apps").select("id, name, slug, repo_url, framework, default_branch, production_branch"),
        db.from("app_integrations").select("app_id, account_ref").eq("provider", "vercel"),
        db.from("app_domains").select("app_id, domain"),
        db.from("app_environments").select("id, app_id, environment_type, is_production, url"),
      ]);
    if (appsError) throw new Error(appsError.message);
    if (linksError) throw new Error(linksError.message);
    if (domainsError) throw new Error(domainsError.message);
    if (envsError) throw new Error(envsError.message);

    type AppLite = {
      id: string; name: string; slug: string; repo_url: string | null;
      framework: string | null; default_branch: string | null; production_branch: string | null;
    };
    const appList = (apps ?? []) as AppLite[];

    const appByProject = new Map(
      ((links ?? []) as { app_id: string; account_ref: string | null }[])
        .filter((l) => l.account_ref)
        .map((l) => [l.account_ref!, l.app_id] as const)
    );

    const appByDomain = new Map<string, string>();
    for (const d of (domainRows ?? []) as { app_id: string; domain: string }[]) {
      appByDomain.set(normalizeHost(d.domain), d.app_id);
    }
    for (const e of (envRows ?? []) as { app_id: string; url: string | null }[]) {
      const host = e.url ? normalizeHost(e.url) : "";
      if (host && !appByDomain.has(host)) appByDomain.set(host, e.app_id);
    }

    const appByRepo = new Map<string, string>();
    for (const a of appList) {
      if (a.repo_url) appByRepo.set(a.repo_url.toLowerCase().replace(/\.git$/, ""), a.id);
    }

    const envByApp = new Map<string, { id: string; environment_type: string; is_production: boolean }[]>();
    for (const e of (envRows ?? []) as { id: string; app_id: string; environment_type: string; is_production: boolean }[]) {
      envByApp.set(e.app_id, [...(envByApp.get(e.app_id) ?? []), e]);
    }

    let linked = 0;
    let refreshed = 0;
    let deploymentCount = 0;
    let domainCount = 0;
    const unlinked: UnlinkedProject[] = [];
    let ignoredCount = 0;

    for (const project of projects) {
      const domains = customDomains(project);
      let appId = appByProject.get(project.id) ?? null;
      let newlyLinked = false;

      if (!appId) {
        for (const domain of domains) {
          const match = appByDomain.get(domain);
          if (match) { appId = match; newlyLinked = true; break; }
        }
      }
      if (!appId && project.repo) {
        const match = appByRepo.get(project.repo.url.toLowerCase());
        if (match) { appId = match; newlyLinked = true; }
      }

      if (!appId) {
        if (ignoredRefs.has(project.id)) { ignoredCount += 1; continue; }
        unlinked.push({
          ref: project.id,
          name: project.name,
          provider: "vercel",
          domain: domains[0] ?? null,
          framework: project.framework,
          repoSlug: project.repo?.slug ?? null,
          lastDeployAt: project.latest?.createdAt ?? null,
          lastDeployState: project.latest?.state ?? null,
        });
        continue;
      }

      if (newlyLinked) linked += 1;
      else refreshed += 1;

      const written = await applyProjectToApp(appId, project, envByApp.get(appId) ?? []);
      deploymentCount += written.deployments;
      domainCount += written.domains;
      appByProject.set(project.id, appId);
    }

    return {
      ok: true,
      projects: projects.length,
      linked,
      refreshed,
      deployments: deploymentCount,
      domains: domainCount,
      unlinked,
      ignored: ignoredCount,
    };
  } catch (error) {
    return { ...empty, projects: projects.length, error: safeMessage(error, "App sync failed.") };
  }
}

/**
 * Write one provider project onto one app.
 *
 * Only provider-owned facts are written. Framework, default branch and
 * repository fill in when the app has nothing recorded; they never
 * overwrite a value somebody typed.
 */
async function applyProjectToApp(
  appId: string,
  project: VercelProject,
  environments: { id: string; environment_type: string; is_production: boolean }[]
): Promise<{ deployments: number; domains: number }> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { error: integrationError } = await db.from("app_integrations").upsert(
    {
      app_id: appId,
      provider: "vercel",
      environment: "all",
      label: `Vercel — ${project.name}`,
      status: "connected",
      account_ref: project.id,
      last_checked_at: now,
      error: null,
      metadata: {
        project_name: project.name,
        framework: project.framework,
        production_branch: project.productionBranch,
      },
    },
    { onConflict: "app_id,provider,environment" }
  );
  if (integrationError) throw new Error(integrationError.message);

  // Fill in blanks only.
  const { data: appRow } = await db
    .from("apps")
    .select("framework, repo_url, repo_provider, production_branch, default_branch, repo_external_id")
    .eq("id", appId)
    .maybeSingle();
  const app = (appRow ?? {}) as Record<string, string | null>;
  const patch: Record<string, string> = {};
  if (!app.framework && project.framework) patch.framework = project.framework;
  if (!app.production_branch && project.productionBranch) patch.production_branch = project.productionBranch;
  if (!app.repo_url && project.repo) {
    patch.repo_url = project.repo.url;
    patch.repo_provider = project.repo.provider === "github" ? "github" : project.repo.provider === "gitlab" ? "gitlab" : "bitbucket";
    patch.repo_external_id = project.repo.slug;
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("apps").update(patch).eq("id", appId);
    if (error) throw new Error(error.message);
  }

  // ── Environments ──────────────────────────────────────────────────
  // A production environment is created when the project clearly has one
  // and the app has none; anything beyond that is a person's decision.
  let productionEnv = environments.find((e) => e.is_production) ?? null;
  const productionDomain = customDomains(project)[0] ?? null;
  const productionUrl = productionDomain
    ? `https://${productionDomain}`
    : project.latest?.target === "production"
      ? project.latest.url
      : null;

  if (!productionEnv && productionUrl) {
    const { data: created, error } = await db
      .from("app_environments")
      .insert({
        app_id: appId,
        name: "Production",
        environment_type: "production",
        is_production: true,
        url: productionUrl,
        branch: project.productionBranch,
        hosting_provider: "Vercel",
        hosting_project_id: project.id,
      })
      .select("id, environment_type, is_production")
      .single();
    if (error) throw new Error(error.message);
    productionEnv = created as { id: string; environment_type: string; is_production: boolean };
  } else if (productionEnv) {
    const { error } = await db
      .from("app_environments")
      .update({
        hosting_provider: "Vercel",
        hosting_project_id: project.id,
        branch: project.productionBranch,
      })
      .eq("id", productionEnv.id);
    if (error) throw new Error(error.message);
  }

  // ── Deployments ───────────────────────────────────────────────────
  const rows = project.deployments
    .filter((d: VercelDeployment) => d.id)
    .map((d) => ({
      app_id: appId,
      environment_id: d.target === "production" ? productionEnv?.id ?? null : null,
      provider: "vercel",
      external_deployment_id: d.id,
      environment: environmentOf(d.target),
      status: deploymentStatus(d.state),
      branch: d.branch,
      commit_sha: d.commitSha,
      commit_message: d.commitMessage,
      commit_url: null,
      deployment_url: d.url,
      logs_url: `https://vercel.com/deployments/${d.id}`,
      triggered_by: d.creator,
      started_at: d.createdAt,
      completed_at: d.readyAt,
      duration_ms: d.readyAt
        ? Math.max(0, new Date(d.readyAt).getTime() - new Date(d.createdAt).getTime())
        : null,
    }));

  if (rows.length > 0) {
    const { error } = await db
      .from("app_deployments")
      .upsert(rows, { onConflict: "provider,external_deployment_id" });
    if (error) throw new Error(error.message);
  }

  const lastProduction = project.deployments.find((d) => d.target === "production") ?? null;
  if (lastProduction && productionEnv) {
    const { error } = await db
      .from("app_environments")
      .update({ last_deployed_at: lastProduction.readyAt ?? lastProduction.createdAt })
      .eq("id", productionEnv.id);
    if (error) throw new Error(error.message);
  }

  // ── Domains ───────────────────────────────────────────────────────
  const domainRows = project.domains
    .filter((d) => !d.gitBranch)
    .map((d) => ({
      app_id: appId,
      environment_id: productionEnv?.id ?? null,
      domain: normalizeHost(d.name),
      environment: "production" as const,
      provider: "Vercel",
      is_primary: normalizeHost(d.name) === productionDomain,
      redirect_to: d.redirect,
      verified: d.verified,
      last_checked_at: now,
    }))
    .filter((d) => d.domain);

  let domainCount = 0;
  for (const domain of domainRows) {
    // No upsert: app_domains has a unique index on (app_id, lower(domain))
    // and PostgREST cannot target an expression index, so this reads then
    // writes. The list is short — a project has a handful of domains.
    const { data: existing } = await db
      .from("app_domains")
      .select("id")
      .eq("app_id", appId)
      .ilike("domain", domain.domain)
      .maybeSingle();

    if (existing) {
      const { error } = await db
        .from("app_domains")
        .update({
          provider: domain.provider,
          redirect_to: domain.redirect_to,
          verified: domain.verified,
          last_checked_at: domain.last_checked_at,
        })
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("app_domains").insert(domain);
      if (error) throw new Error(error.message);
    }
    domainCount += 1;
  }

  await db.from("app_events").insert({
    app_id: appId,
    kind: "integration",
    body: `Synced from Vercel project ${project.name}`,
    actor: "system",
    meta: { project: project.id, deployments: rows.length, domains: domainCount },
  });

  return { deployments: rows.length, domains: domainCount };
}

/** Link a discovered project to an app that already exists. */
export async function linkProjectToApp(appId: string, projectRef: string): Promise<void> {
  const projects = await listVercelProjects();
  if (!projects.ok) throw new Error(projects.error);
  const project = projects.data.find((p) => p.id === projectRef);
  if (!project) throw new Error("That project is no longer on the connected Vercel team.");

  const db = supabaseAdmin();
  const { data: envs, error } = await db
    .from("app_environments")
    .select("id, environment_type, is_production")
    .eq("app_id", appId);
  if (error) throw new Error(error.message);

  await applyProjectToApp(
    appId,
    project,
    (envs ?? []) as { id: string; environment_type: string; is_production: boolean }[]
  );
  await setIgnoredRef("vercel", projectRef, false);
}

/**
 * Register a discovered project as a new app.
 *
 * The app is created in DEVELOPMENT with no client and no billing, because
 * the provider knows none of that. Somebody has to say who it belongs to
 * and what it earns; guessing would put a wrong client name on a screen
 * that is supposed to be the source of truth.
 */
export async function createAppFromProject(projectRef: string, actor: string): Promise<string> {
  const projects = await listVercelProjects();
  if (!projects.ok) throw new Error(projects.error);
  const project = projects.data.find((p) => p.id === projectRef);
  if (!project) throw new Error("That project is no longer on the connected Vercel team.");

  const db = supabaseAdmin();
  const base = slugify(project.name) || "app";
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const { data: clash } = await db.from("apps").select("id").ilike("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const live = project.latest?.state === "READY" && project.latest.target === "production";

  const { data: created, error } = await db
    .from("apps")
    .insert({
      name: titleFromSlug(project.name),
      slug,
      lifecycle_status: live ? "live" : "development",
      platform_type: "web",
      ownership_type: "internal",
      framework: project.framework,
      repo_provider: project.repo ? "github" : null,
      repo_url: project.repo?.url ?? null,
      repo_external_id: project.repo?.slug ?? null,
      production_branch: project.productionBranch,
      technical_owner: actor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const appId = (created as { id: string }).id;

  await db.from("app_events").insert({
    app_id: appId,
    kind: "created",
    body: `Registered from the Vercel project ${project.name}. Client, billing and lifecycle still need to be set.`,
    actor,
  });

  await applyProjectToApp(appId, project, []);
  await setIgnoredRef("vercel", projectRef, false);
  return appId;
}

function titleFromSlug(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
