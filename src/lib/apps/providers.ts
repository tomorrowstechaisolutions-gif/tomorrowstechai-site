import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side provider access for the Apps module.
 *
 * THE SECURITY RULE, and it is the whole reason this file exists:
 * a token never leaves the server. Every function here runs on the server,
 * reads its credential out of `integration_credentials` with the service
 * role, and returns only display-safe facts. Nothing in this file is ever
 * imported by a client component — "server-only" makes that a build error
 * rather than a code review.
 *
 * `integration_credentials` has RLS enabled and DELIBERATELY NO POLICY, so
 * even a signed-in admin's browser session cannot select from it. The token
 * is reachable only through the service role, which lives in this process.
 *
 * The second rule: a provider being down must never take a page with it.
 * Every call returns a result object with `ok` and a message, and callers
 * degrade one panel rather than throwing.
 */

export type ProviderKey = "vercel" | "github" | "supabase";

export type ProviderConnection = {
  provider: ProviderKey;
  connected: boolean;
  /** Which account, in words. Never a token. */
  accountLabel: string | null;
  accountRef: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Strips anything that looks like a credential out of an error message. */
export function safeMessage(value: unknown, fallback: string): string {
  const message = value instanceof Error ? value.message : fallback;
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, "[redacted]")
    .replace(/sbp_[A-Za-z0-9]{16,}/g, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/g, "[redacted]")
    .slice(0, 500);
}

type CredentialRow = {
  provider: string;
  access_token: string | null;
  account_ref: string | null;
  account_name: string | null;
  account_email: string | null;
  connected_at: string | null;
  last_error: string | null;
};

async function readCredential(provider: ProviderKey): Promise<CredentialRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("integration_credentials")
    .select("provider, access_token, account_ref, account_name, account_email, connected_at, last_error")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CredentialRow | null) ?? null;
}

async function noteError(provider: ProviderKey, message: string | null): Promise<void> {
  await supabaseAdmin()
    .from("integration_credentials")
    .update({ last_error: message, last_error_at: message ? new Date().toISOString() : null })
    .eq("provider", provider);
}

/** Is this provider connected, and to what? Never throws. */
export async function providerConnection(provider: ProviderKey): Promise<ProviderConnection> {
  try {
    const row = await readCredential(provider);
    return {
      provider,
      connected: Boolean(row?.access_token),
      accountLabel: row?.account_name || row?.account_email || null,
      accountRef: row?.account_ref ?? null,
      connectedAt: row?.connected_at ?? null,
      lastError: row?.last_error ?? null,
    };
  } catch (error) {
    return {
      provider,
      connected: false,
      accountLabel: null,
      accountRef: null,
      connectedAt: null,
      lastError: safeMessage(error, "Could not read the integration vault."),
    };
  }
}

export async function providerConnections(): Promise<Record<ProviderKey, ProviderConnection>> {
  const [vercel, github, supabase] = await Promise.all([
    providerConnection("vercel"),
    providerConnection("github"),
    providerConnection("supabase"),
  ]);
  return { vercel, github, supabase };
}

/** Saves a token after proving it works. The token is never returned. */
async function storeCredential(
  provider: ProviderKey,
  fields: {
    token: string;
    accountRef?: string | null;
    accountName?: string | null;
    actor: string;
  }
): Promise<void> {
  const { error } = await supabaseAdmin().from("integration_credentials").upsert(
    {
      provider,
      access_token: fields.token,
      refresh_token: null,
      token_expires_at: null,
      account_ref: fields.accountRef ?? null,
      account_name: fields.accountName ?? null,
      connected_by: fields.actor,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    },
    { onConflict: "provider" }
  );
  if (error) throw new Error(error.message);
}

export async function disconnectProvider(provider: ProviderKey): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("integration_credentials")
    .delete()
    .eq("provider", provider);
  if (error) throw new Error(error.message);
}

/* ══════════════════════════════════════════════════════════════════════
   Vercel
   ══════════════════════════════════════════════════════════════════════ */

const VERCEL_API = "https://api.vercel.com";

export type VercelProject = {
  id: string;
  name: string;
  framework: string | null;
  domains: { name: string; verified: boolean; redirect: string | null; gitBranch: string | null }[];
  repo: { provider: string; slug: string; url: string } | null;
  productionBranch: string | null;
  latest: VercelDeployment | null;
  deployments: VercelDeployment[];
};

export type VercelDeployment = {
  id: string;
  url: string | null;
  state: string;
  target: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  createdAt: string;
  readyAt: string | null;
  creator: string | null;
};

export async function vercelFetch<T>(path: string, token: string, teamId: string | null): Promise<T> {
  const url = new URL(path, VERCEL_API);
  if (teamId) url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Vercel returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function connectVercelProvider(
  token: string,
  teamId: string,
  actor: string
): Promise<void> {
  const trimmedToken = token.trim();
  const trimmedTeam = teamId.trim();
  if (!trimmedToken) throw new Error("Enter a Vercel access token.");
  if (!trimmedTeam.startsWith("team_")) throw new Error("Enter the Vercel team ID (it starts with team_).");
  // Prove it works before storing it. A stored token that 401s is worse
  // than no token: the screen would claim to be connected.
  await vercelFetch<{ projects?: unknown[] }>("/v9/projects?limit=1", trimmedToken, trimmedTeam);
  await storeCredential("vercel", {
    token: trimmedToken,
    accountRef: trimmedTeam,
    accountName: "Vercel team",
    actor,
  });
}

function vercelDeployment(raw: Record<string, unknown>): VercelDeployment {
  const meta = (raw.meta ?? {}) as Record<string, string | undefined>;
  const created = Number(raw.created ?? raw.createdAt ?? Date.now());
  const ready = raw.ready ? Number(raw.ready) : null;
  const creator = raw.creator as { username?: string; email?: string } | undefined;
  return {
    id: String(raw.uid ?? raw.id ?? ""),
    url: raw.url ? `https://${String(raw.url)}` : null,
    state: String(raw.state ?? raw.readyState ?? "UNKNOWN"),
    target: (raw.target as string | null) ?? null,
    branch: meta.githubCommitRef ?? meta.gitlabCommitRef ?? meta.bitbucketCommitRef ?? null,
    commitSha: meta.githubCommitSha ?? meta.gitlabCommitSha ?? meta.bitbucketCommitSha ?? null,
    commitMessage: meta.githubCommitMessage ?? meta.gitlabCommitMessage ?? meta.bitbucketCommitMessage ?? null,
    createdAt: new Date(created).toISOString(),
    readyAt: ready ? new Date(ready).toISOString() : null,
    creator: creator?.username ?? creator?.email ?? null,
  };
}

/** Every project on the team, with its domains and last few deployments. */
export async function listVercelProjects(): Promise<ProviderResult<VercelProject[]>> {
  try {
    const credential = await readCredential("vercel");
    if (!credential?.access_token) {
      return { ok: false, error: "Vercel is not connected." };
    }
    const token = credential.access_token;
    const teamId = credential.account_ref;

    const projects: Record<string, unknown>[] = [];
    let until: number | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: { projects?: Record<string, unknown>[]; pagination?: { next?: number | null } } =
        await vercelFetch(`/v9/projects?limit=100${until ? `&until=${until}` : ""}`, token, teamId);
      projects.push(...(result.projects ?? []));
      until = result.pagination?.next ?? null;
      if (!until) break;
    }

    // Batched five at a time so a large team does not open 60 sockets.
    const detailed: VercelProject[] = [];
    for (let index = 0; index < projects.length; index += 5) {
      const slice = projects.slice(index, index + 5);
      const batch = await Promise.all(
        slice.map(async (project) => {
          const projectId = String(project.id);
          const encoded = encodeURIComponent(projectId);
          const [domainResult, deploymentResult] = await Promise.all([
            vercelFetch<{ domains?: Record<string, unknown>[] }>(
              `/v9/projects/${encoded}/domains?limit=100`, token, teamId
            ).catch(() => ({ domains: [] as Record<string, unknown>[] })),
            vercelFetch<{ deployments?: Record<string, unknown>[] }>(
              `/v6/deployments?projectId=${encoded}&limit=10`, token, teamId
            ).catch(() => ({ deployments: [] as Record<string, unknown>[] })),
          ]);

          const link = project.link as
            | { type?: string; org?: string; repo?: string; repoId?: number; productionBranch?: string }
            | undefined;
          const deployments = (deploymentResult.deployments ?? []).map(vercelDeployment);

          return {
            id: projectId,
            name: String(project.name ?? projectId),
            framework: (project.framework as string | null) ?? null,
            domains: (domainResult.domains ?? []).map((d) => ({
              name: String(d.name),
              verified: d.verified !== false,
              redirect: (d.redirect as string | null) ?? null,
              gitBranch: (d.gitBranch as string | null) ?? null,
            })),
            repo:
              link?.org && link?.repo
                ? {
                    provider: link.type ?? "github",
                    slug: `${link.org}/${link.repo}`,
                    url: `https://${link.type === "gitlab" ? "gitlab.com" : link.type === "bitbucket" ? "bitbucket.org" : "github.com"}/${link.org}/${link.repo}`,
                  }
                : null,
            productionBranch: link?.productionBranch ?? null,
            latest: deployments.find((d) => d.target === "production") ?? deployments[0] ?? null,
            deployments,
          } satisfies VercelProject;
        })
      );
      detailed.push(...batch);
    }

    await noteError("vercel", null);
    return { ok: true, data: detailed };
  } catch (error) {
    const message = safeMessage(error, "Vercel request failed.");
    await noteError("vercel", message).catch(() => {});
    return { ok: false, error: message };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   GitHub
   ══════════════════════════════════════════════════════════════════════ */

export type GithubRepo = {
  slug: string;
  url: string;
  defaultBranch: string;
  private: boolean;
  openIssues: number;
  openPullRequests: number | null;
  pushedAt: string | null;
  latestCommit: {
    sha: string;
    shortSha: string;
    message: string;
    author: string | null;
    date: string | null;
    url: string;
  } | null;
};

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `GitHub returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function connectGithubProvider(token: string, actor: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Enter a GitHub access token.");
  const user = await githubFetch<{ login?: string }>("/user", trimmed);
  await storeCredential("github", {
    token: trimmed,
    accountRef: user.login ?? null,
    accountName: user.login ? `GitHub — ${user.login}` : "GitHub",
    actor,
  });
}

/**
 * One repository, as far as the token can see it.
 *
 * Open pull requests come back null rather than 0 when the search call
 * fails — a token without the right scope must not be allowed to report
 * "no open PRs" when the truth is "not allowed to look".
 */
export async function githubRepo(slug: string): Promise<ProviderResult<GithubRepo>> {
  try {
    const credential = await readCredential("github");
    if (!credential?.access_token) return { ok: false, error: "GitHub is not connected." };
    if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) return { ok: false, error: "That is not a repository path." };
    const token = credential.access_token;

    const repo = await githubFetch<{
      full_name: string;
      html_url: string;
      default_branch: string;
      private: boolean;
      open_issues_count: number;
      pushed_at: string | null;
    }>(`/repos/${slug}`, token);

    const [commits, pulls] = await Promise.all([
      githubFetch<
        {
          sha: string;
          html_url: string;
          commit: { message: string; author: { name?: string; date?: string } };
        }[]
      >(`/repos/${slug}/commits?per_page=1`, token).catch(() => []),
      githubFetch<{ total_count: number }>(
        `/search/issues?q=${encodeURIComponent(`repo:${slug} is:pr is:open`)}&per_page=1`,
        token
      ).catch(() => null),
    ]);

    const head = commits[0] ?? null;

    await noteError("github", null);
    return {
      ok: true,
      data: {
        slug: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch,
        private: repo.private,
        // GitHub counts pull requests inside open_issues_count. Subtracting
        // the PR count is the only way to report issues honestly.
        openIssues: Math.max(0, repo.open_issues_count - (pulls?.total_count ?? 0)),
        openPullRequests: pulls?.total_count ?? null,
        pushedAt: repo.pushed_at,
        latestCommit: head
          ? {
              sha: head.sha,
              shortSha: head.sha.slice(0, 7),
              message: head.commit.message.split("\n")[0].slice(0, 160),
              author: head.commit.author?.name ?? null,
              date: head.commit.author?.date ?? null,
              url: head.html_url,
            }
          : null,
      },
    };
  } catch (error) {
    const message = safeMessage(error, "GitHub request failed.");
    await noteError("github", message).catch(() => {});
    return { ok: false, error: message };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Supabase
   ══════════════════════════════════════════════════════════════════════ */

export type SupabaseProject = {
  ref: string;
  name: string;
  region: string;
  status: string;
  createdAt: string | null;
  /** Health per service, when the management API reports it. */
  services: { name: string; healthy: boolean | null; status: string }[];
};

async function supabaseMgmtFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.supabase.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `Supabase returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function connectSupabaseProvider(token: string, actor: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error("Enter a Supabase management API token.");
  const projects = await supabaseMgmtFetch<{ id: string }[]>("/v1/projects", trimmed);
  await storeCredential("supabase", {
    token: trimmed,
    accountRef: null,
    accountName: `Supabase — ${projects.length} ${projects.length === 1 ? "project" : "projects"}`,
    actor,
  });
}

export async function listSupabaseProjects(): Promise<ProviderResult<SupabaseProject[]>> {
  try {
    const credential = await readCredential("supabase");
    if (!credential?.access_token) return { ok: false, error: "Supabase is not connected." };

    const projects = await supabaseMgmtFetch<
      { id: string; name: string; region: string; status: string; created_at?: string }[]
    >("/v1/projects", credential.access_token);

    await noteError("supabase", null);
    return {
      ok: true,
      data: projects.map((p) => ({
        ref: p.id,
        name: p.name,
        region: p.region,
        status: p.status,
        createdAt: p.created_at ?? null,
        services: [],
      })),
    };
  } catch (error) {
    const message = safeMessage(error, "Supabase request failed.");
    await noteError("supabase", message).catch(() => {});
    return { ok: false, error: message };
  }
}

/**
 * One Supabase project, with per-service health when the API allows it.
 *
 * Service health is a separate, more privileged endpoint than the project
 * list, so it is allowed to fail on its own: the project facts still come
 * back and `services` is simply empty, which the screen reports as
 * "not reported" rather than as healthy.
 */
export async function supabaseProject(ref: string): Promise<ProviderResult<SupabaseProject>> {
  try {
    const credential = await readCredential("supabase");
    if (!credential?.access_token) return { ok: false, error: "Supabase is not connected." };
    if (!/^[a-z0-9]{16,32}$/i.test(ref)) return { ok: false, error: "That is not a Supabase project ref." };
    const token = credential.access_token;

    const projects = await supabaseMgmtFetch<
      { id: string; name: string; region: string; status: string; created_at?: string }[]
    >("/v1/projects", token);
    const project = projects.find((p) => p.id === ref);
    if (!project) return { ok: false, error: "This token cannot see that project." };

    const services = await supabaseMgmtFetch<
      { name: string; healthy?: boolean; status?: string }[]
    >(
      `/v1/projects/${ref}/health?services=db&services=rest&services=auth&services=storage&services=realtime`,
      token
    ).catch(() => [] as { name: string; healthy?: boolean; status?: string }[]);

    return {
      ok: true,
      data: {
        ref: project.id,
        name: project.name,
        region: project.region,
        status: project.status,
        createdAt: project.created_at ?? null,
        services: services.map((s) => ({
          name: s.name,
          healthy: s.healthy ?? null,
          status: s.status ?? (s.healthy ? "healthy" : "unknown"),
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: safeMessage(error, "Supabase request failed.") };
  }
}
