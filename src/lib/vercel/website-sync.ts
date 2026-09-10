import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeDomain } from "@/lib/websites/queries";

const API = "https://api.vercel.com";
export const DEFAULT_VERCEL_TEAM_ID = "team_ei55NWvmcUuMarnRkBtCNORr";

type VercelProject = {
  id: string;
  name: string;
  accountId?: string;
};

type VercelDomain = {
  name: string;
  verified?: boolean;
  redirect?: string | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
};

type VercelDeployment = {
  uid?: string;
  id?: string;
  url?: string;
  state?: string;
  target?: string;
  created?: number;
  createdAt?: number;
  ready?: number;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
  };
};

type Credentials = {
  access_token: string | null;
  account_ref: string | null;
  connected_at: string | null;
  last_error: string | null;
};

export type VercelConnection = {
  connected: boolean;
  teamId: string;
  connectedAt: string | null;
  lastError: string | null;
};

export type VercelSyncResult = {
  projects: number;
  added: number;
  matched: number;
  deployments: number;
};

function titleFromSlug(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deploymentStatus(state?: string): "success" | "building" | "failed" | "canceled" {
  if (state === "READY") return "success";
  if (["BUILDING", "QUEUED", "INITIALIZING"].includes(state ?? "")) return "building";
  if (state === "CANCELED") return "canceled";
  return "failed";
}

function websiteStatus(state?: string): "live" | "development" | "issue" {
  if (state === "READY") return "live";
  if (["BUILDING", "QUEUED", "INITIALIZING"].includes(state ?? "")) return "development";
  return "issue";
}

function deploymentDate(d: VercelDeployment): string {
  const stamp = d.ready ?? d.created ?? d.createdAt ?? Date.now();
  return new Date(stamp).toISOString();
}

function safeError(value: unknown): string {
  const message = value instanceof Error ? value.message : "Vercel sync failed.";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

async function vercelFetch<T>(path: string, token: string, teamId: string): Promise<T> {
  const url = new URL(path, API);
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Vercel returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

async function listProjects(token: string, teamId: string): Promise<VercelProject[]> {
  const projects: VercelProject[] = [];
  let until: number | null = null;
  for (let page = 0; page < 10; page += 1) {
    const requestPath: string = `/v9/projects?limit=100${until ? `&until=${until}` : ""}`;
    const result: { projects?: VercelProject[]; pagination?: { next?: number | null } } = await vercelFetch(requestPath, token, teamId);
    projects.push(...(result.projects ?? []));
    until = result.pagination?.next ?? null;
    if (!until) break;
  }
  return projects;
}

async function projectContext(project: VercelProject, token: string, teamId: string) {
  const encoded = encodeURIComponent(project.id);
  const [domainResult, deploymentResult] = await Promise.all([
    vercelFetch<{ domains?: VercelDomain[] }>(`/v9/projects/${encoded}/domains?limit=100`, token, teamId),
    vercelFetch<{ deployments?: VercelDeployment[] }>(`/v6/deployments?projectId=${encoded}&target=production&limit=6`, token, teamId),
  ]);
  return {
    project,
    domains: domainResult.domains ?? [],
    deployments: deploymentResult.deployments ?? [],
  };
}

function canonicalDomain(project: VercelProject, domains: VercelDomain[], deployment?: VercelDeployment): string {
  const verified = domains.filter((d) => d.verified !== false && !d.gitBranch && !d.customEnvironmentId);
  const custom = verified
    .map((d) => normalizeDomain(d.name))
    .filter((name) => name && !name.endsWith(".vercel.app"))
    .sort((a, b) => Number(a.startsWith("www.")) - Number(b.startsWith("www.")))[0];
  return custom || normalizeDomain(deployment?.url || `${project.name}.vercel.app`);
}

async function readCredentials(db: SupabaseClient): Promise<Credentials | null> {
  const { data, error } = await db
    .from("integration_credentials")
    .select("access_token, account_ref, connected_at, last_error")
    .eq("provider", "vercel")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Credentials | null;
}

export async function getVercelConnection(): Promise<VercelConnection> {
  try {
    const row = await readCredentials(supabaseAdmin());
    return {
      connected: Boolean(row?.access_token && row?.account_ref),
      teamId: row?.account_ref || DEFAULT_VERCEL_TEAM_ID,
      connectedAt: row?.connected_at ?? null,
      lastError: row?.last_error ?? null,
    };
  } catch (error) {
    return {
      connected: false,
      teamId: DEFAULT_VERCEL_TEAM_ID,
      connectedAt: null,
      lastError: safeError(error),
    };
  }
}

export async function connectVercel(token: string, teamId: string, actor: string): Promise<void> {
  const trimmedToken = token.trim();
  const trimmedTeam = teamId.trim();
  if (!trimmedToken || !trimmedTeam.startsWith("team_")) {
    throw new Error("Enter a Vercel access token and team ID.");
  }
  await vercelFetch<{ projects?: VercelProject[] }>("/v9/projects?limit=1", trimmedToken, trimmedTeam);
  const db = supabaseAdmin();
  const { error } = await db.from("integration_credentials").upsert({
    provider: "vercel",
    access_token: trimmedToken,
    refresh_token: null,
    token_expires_at: null,
    account_ref: trimmedTeam,
    account_name: "Tomorrow's Tech AI Vercel team",
    connected_by: actor,
    connected_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
  }, { onConflict: "provider" });
  if (error) throw new Error(error.message);
}

export async function syncVercelWebsites(): Promise<VercelSyncResult> {
  const db = supabaseAdmin();
  const credentials = await readCredentials(db);
  if (!credentials?.access_token || !credentials.account_ref) {
    throw new Error("Connect Vercel before syncing websites.");
  }

  try {
    const projects = await listProjects(credentials.access_token, credentials.account_ref);
    const contexts: Awaited<ReturnType<typeof projectContext>>[] = [];
    for (let index = 0; index < projects.length; index += 5) {
      contexts.push(...await Promise.all(
        projects.slice(index, index + 5).map((project) =>
          projectContext(project, credentials.access_token!, credentials.account_ref!)
        )
      ));
    }

    const [{ data: sites, error: sitesError }, { data: integrations, error: integrationsError }] = await Promise.all([
      db.from("websites").select("id, domain, base_url, hosting_provider"),
      db.from("website_integrations").select("website_id, account_ref").eq("provider", "vercel"),
    ]);
    if (sitesError) throw new Error(sitesError.message);
    if (integrationsError) throw new Error(integrationsError.message);

    const siteByDomain = new Map((sites ?? []).map((site) => [normalizeDomain(site.domain), site]));
    const siteIdByProject = new Map((integrations ?? []).filter((row) => row.account_ref).map((row) => [row.account_ref!, row.website_id]));
    let added = 0;
    let matched = 0;
    let deploymentCount = 0;

    for (const context of contexts) {
      const latest = context.deployments[0];
      const candidates = new Set([
        ...context.domains.map((domain) => normalizeDomain(domain.name)),
        ...context.deployments.map((deployment) => normalizeDomain(deployment.url ?? "")),
        normalizeDomain(`${context.project.name}.vercel.app`),
      ].filter(Boolean));
      let websiteId = siteIdByProject.get(context.project.id);
      if (!websiteId) {
        for (const domain of candidates) {
          const match = siteByDomain.get(domain);
          if (match) { websiteId = match.id; break; }
        }
      }

      if (websiteId) {
        matched += 1;
        const { error } = await db.from("websites").update({ hosting_provider: "Vercel" }).eq("id", websiteId);
        if (error) throw new Error(error.message);
      } else {
        const domain = canonicalDomain(context.project, context.domains, latest);
        const { data: created, error } = await db.from("websites").insert({
          name: titleFromSlug(context.project.name),
          domain,
          base_url: `https://${domain}`,
          status: websiteStatus(latest?.state),
          website_type: "other",
          hosting_provider: "Vercel",
          owner: "Tomorrow's Tech AI",
        }).select("id, domain, base_url, hosting_provider").single();
        if (error) throw new Error(error.message);
        websiteId = created.id;
        siteByDomain.set(normalizeDomain(created.domain), created);
        added += 1;
      }

      siteIdByProject.set(context.project.id, websiteId);
      const { error: integrationError } = await db.from("website_integrations").upsert({
        website_id: websiteId,
        provider: "vercel",
        status: "connected",
        account_ref: context.project.id,
        last_synced_at: new Date().toISOString(),
        error: null,
      }, { onConflict: "website_id,provider" });
      if (integrationError) throw new Error(integrationError.message);

      const deploymentRows = context.deployments
        .filter((deployment) => deployment.uid || deployment.id)
        .map((deployment) => ({
          website_id: websiteId,
          provider: "vercel",
          external_id: deployment.uid || deployment.id,
          environment: deployment.target === "production" ? "production" : "preview",
          status: deploymentStatus(deployment.state),
          url: deployment.url ? `https://${deployment.url}` : null,
          git_branch: deployment.meta?.githubCommitRef ?? null,
          commit_sha: deployment.meta?.githubCommitSha ?? null,
          commit_message: deployment.meta?.githubCommitMessage ?? null,
          deployed_at: deploymentDate(deployment),
        }));
      if (deploymentRows.length) {
        const { error } = await db.from("website_deployments").upsert(deploymentRows, { onConflict: "provider,external_id" });
        if (error) throw new Error(error.message);
        deploymentCount += deploymentRows.length;
      }
    }

    await db.from("integration_credentials").update({ last_error: null, last_error_at: null }).eq("provider", "vercel");
    return { projects: projects.length, added, matched, deployments: deploymentCount };
  } catch (error) {
    const message = safeError(error);
    await db.from("integration_credentials").update({ last_error: message, last_error_at: new Date().toISOString() }).eq("provider", "vercel");
    throw new Error(message);
  }
}
