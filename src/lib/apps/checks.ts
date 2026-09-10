import "server-only";
import { connect as tlsConnect } from "node:tls";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listVercelProjects, safeMessage, supabaseProject, type VercelProject } from "./providers";
import { INTEGRATION_LABELS, type CheckType, type HealthState, type IntegrationProvider } from "./types";

/**
 * Running the health checks.
 *
 * This is the only thing in the module that is allowed to write a "healthy".
 * Everything else reads what this wrote, and reads a missing row as Unknown.
 *
 * What is actually checked, and what each answer means:
 *   application — HTTP GET of each environment URL. 2xx/3xx healthy,
 *                 401/403 healthy-but-noted (a login wall is the app
 *                 answering), other 4xx degraded, 5xx or no answer critical.
 *   api         — the same, against api_base_url.
 *   domain_ssl  — a real TLS handshake against each production domain, and
 *                 the certificate's own expiry date. Not a guess from a
 *                 stored field.
 *   hosting     — the linked Vercel project's latest production deployment.
 *   database    — the linked Supabase project's status and service health.
 *   integration — the app's own integration rows: any needing attention or
 *                 disconnected is a degraded integration surface.
 *   background_jobs — NOT CHECKED. Nothing in this system runs or observes
 *                 an app's background jobs, so no row is written and the
 *                 category stays Unknown. Writing a green row for something
 *                 nobody looked at is the exact failure this module exists
 *                 to avoid, and it would be trivially easy to do here.
 *
 * Incidents: a check that turns critical opens an incident attributed to
 * 'system' if one is not already open for that type. When the same check
 * comes back healthy, that system-opened incident is resolved and the
 * resolution is written to the timeline. Incidents a PERSON opened are
 * never auto-resolved — closing somebody's incident for them, because one
 * probe succeeded, would erase a judgement this system did not make.
 */

const HTTP_TIMEOUT_MS = 8_000;
const TLS_TIMEOUT_MS = 8_000;
const SSL_WARN_DAYS = 21;

export type CheckRunResult = {
  apps: number;
  checks: number;
  incidentsOpened: number;
  incidentsResolved: number;
  errors: string[];
};

type PendingCheck = {
  app_id: string;
  environment_id: string | null;
  check_type: CheckType;
  target: string | null;
  status: HealthState;
  response_time_ms: number | null;
  message: string;
};

export async function runHealthChecks(appId?: string): Promise<CheckRunResult> {
  const db = supabaseAdmin();
  const errors: string[] = [];

  let appQuery = db
    .from("apps")
    .select("id, name, lifecycle_status, is_archived")
    .eq("is_archived", false);
  if (appId) appQuery = appQuery.eq("id", appId);

  const { data: appRows, error: appsError } = await appQuery;
  if (appsError) throw new Error(appsError.message);
  const apps = (appRows ?? []) as { id: string; name: string; lifecycle_status: string }[];
  if (apps.length === 0) {
    return { apps: 0, checks: 0, incidentsOpened: 0, incidentsResolved: 0, errors };
  }

  const ids = apps.map((a) => a.id);

  const [{ data: envRows }, { data: domainRows }, { data: integrationRows }] = await Promise.all([
    db.from("app_environments").select("id, app_id, name, url, api_base_url, environment_type, is_production").in("app_id", ids),
    db.from("app_domains").select("id, app_id, domain, environment, environment_id").in("app_id", ids),
    db.from("app_integrations").select("id, app_id, provider, status, account_ref, error").in("app_id", ids),
  ]);

  type Env = {
    id: string; app_id: string; name: string; url: string | null;
    api_base_url: string | null; environment_type: string; is_production: boolean;
  };
  type Domain = { id: string; app_id: string; domain: string; environment: string; environment_id: string | null };
  type Integration = {
    id: string; app_id: string; provider: IntegrationProvider;
    status: string; account_ref: string | null; error: string | null;
  };

  const envs = (envRows ?? []) as Env[];
  const domains = (domainRows ?? []) as Domain[];
  const integrations = (integrationRows ?? []) as Integration[];

  // One provider round-trip for the whole run, not one per app.
  const needsVercel = integrations.some((i) => i.provider === "vercel" && i.account_ref);
  const vercelProjects = new Map<string, VercelProject>();
  if (needsVercel) {
    const result = await listVercelProjects();
    if (result.ok) for (const project of result.data) vercelProjects.set(project.id, project);
    else errors.push(`Vercel: ${result.error}`);
  }

  const pending: PendingCheck[] = [];

  // ── HTTP reachability ─────────────────────────────────────────────
  const httpTargets: { env: Env; url: string; type: CheckType }[] = [];
  for (const env of envs) {
    if (env.url) httpTargets.push({ env, url: env.url, type: "application" });
    if (env.api_base_url) httpTargets.push({ env, url: env.api_base_url, type: "api" });
  }

  for (let index = 0; index < httpTargets.length; index += 8) {
    const batch = httpTargets.slice(index, index + 8);
    const results = await Promise.all(batch.map((t) => probeHttp(t.url)));
    results.forEach((result, offset) => {
      const target = batch[offset];
      pending.push({
        app_id: target.env.app_id,
        environment_id: target.env.id,
        check_type: target.type,
        target: target.url,
        status: result.status,
        response_time_ms: result.ms,
        message: `${target.env.name}: ${result.message}`,
      });
    });
  }

  // ── TLS certificates ──────────────────────────────────────────────
  const sslTargets = domains.filter((d) => d.environment === "production");
  for (let index = 0; index < sslTargets.length; index += 8) {
    const batch = sslTargets.slice(index, index + 8);
    const results = await Promise.all(batch.map((d) => probeTls(d.domain)));
    for (let offset = 0; offset < batch.length; offset += 1) {
      const domain = batch[offset];
      const result = results[offset];
      pending.push({
        app_id: domain.app_id,
        environment_id: domain.environment_id,
        check_type: "domain_ssl",
        target: domain.domain,
        status: result.status,
        response_time_ms: null,
        message: result.message,
      });

      const patch: Record<string, string | null> = {
        ssl_status: result.sslStatus,
        last_checked_at: new Date().toISOString(),
        ssl_expires_at: result.expiresAt,
      };
      const { error } = await db.from("app_domains").update(patch).eq("id", domain.id);
      if (error) errors.push(`Domain ${domain.domain}: ${error.message}`);
    }
  }

  // ── Providers ─────────────────────────────────────────────────────
  for (const integration of integrations) {
    if (integration.provider === "vercel" && integration.account_ref) {
      const project = vercelProjects.get(integration.account_ref);
      if (!project) {
        pending.push({
          app_id: integration.app_id,
          environment_id: null,
          check_type: "hosting",
          target: integration.account_ref,
          status: needsVercel && vercelProjects.size > 0 ? "critical" : "unknown",
          response_time_ms: null,
          message:
            vercelProjects.size > 0
              ? "The linked Vercel project no longer exists on this team."
              : "Vercel could not be reached, so hosting state is unknown.",
        });
        continue;
      }
      const latest = project.deployments.find((d) => d.target === "production") ?? null;
      const state = latest?.state ?? null;
      pending.push({
        app_id: integration.app_id,
        environment_id: null,
        check_type: "hosting",
        target: `Vercel — ${project.name}`,
        status:
          state === null ? "unknown"
            : state === "READY" ? "healthy"
            : state === "ERROR" ? "critical"
            : state === "CANCELED" ? "warning"
            : "healthy",
        response_time_ms: null,
        message:
          state === null
            ? "No production deployment has been made yet."
            : state === "READY"
              ? "Latest production deployment is live."
              : state === "ERROR"
                ? "The latest production deployment failed."
                : `Latest production deployment is ${state.toLowerCase()}.`,
      });
      await db
        .from("app_integrations")
        .update({ status: "connected", last_checked_at: new Date().toISOString(), error: null })
        .eq("id", integration.id);
    }

    if (integration.provider === "supabase" && integration.account_ref) {
      const result = await supabaseProject(integration.account_ref);
      if (!result.ok) {
        pending.push({
          app_id: integration.app_id,
          environment_id: null,
          check_type: "database",
          target: integration.account_ref,
          status: "unknown",
          response_time_ms: null,
          message: result.error,
        });
      } else {
        const unhealthy = result.data.services.filter((s) => s.healthy === false);
        const paused = result.data.status !== "ACTIVE_HEALTHY";
        pending.push({
          app_id: integration.app_id,
          environment_id: null,
          check_type: "database",
          target: `${result.data.name} (${result.data.region})`,
          status: unhealthy.length > 0 || paused ? "critical" : result.data.services.length === 0 ? "unknown" : "healthy",
          response_time_ms: null,
          message:
            unhealthy.length > 0
              ? `${unhealthy.map((s) => s.name).join(", ")} unhealthy.`
              : paused
                ? `Project status is ${result.data.status}.`
                : result.data.services.length === 0
                  ? "The project exists, but this token cannot read service health."
                  : `All ${result.data.services.length} services healthy.`,
        });
      }
    }
  }

  // ── The integration surface itself ────────────────────────────────
  const byApp = new Map<string, Integration[]>();
  for (const i of integrations) byApp.set(i.app_id, [...(byApp.get(i.app_id) ?? []), i]);
  for (const [app, rows] of byApp) {
    const bad = rows.filter((r) => r.status === "needs_attention" || r.status === "disconnected");
    pending.push({
      app_id: app,
      environment_id: null,
      check_type: "integration",
      target: null,
      status: bad.length > 0 ? "warning" : "healthy",
      response_time_ms: null,
      message:
        bad.length > 0
          ? `${bad.map((b) => INTEGRATION_LABELS[b.provider] ?? b.provider).join(", ")} need attention.`
          : `${rows.length} ${rows.length === 1 ? "integration" : "integrations"} connected.`,
    });
  }

  // ── Write everything ──────────────────────────────────────────────
  const checkedAt = new Date().toISOString();
  if (pending.length > 0) {
    const { error } = await db
      .from("app_health_checks")
      .insert(pending.map((p) => ({ ...p, checked_at: checkedAt })));
    if (error) throw new Error(error.message);
  }

  // Environment health = the worst check attached to that environment.
  const byEnvironment = new Map<string, HealthState>();
  for (const check of pending) {
    if (!check.environment_id) continue;
    const held = byEnvironment.get(check.environment_id);
    byEnvironment.set(check.environment_id, worse(held, check.status));
  }
  for (const [environmentId, status] of byEnvironment) {
    const { error } = await db
      .from("app_environments")
      .update({ health_status: status, last_checked_at: checkedAt })
      .eq("id", environmentId);
    if (error) errors.push(`Environment ${environmentId}: ${error.message}`);
  }

  const { opened, resolved } = await reconcileIncidents(pending, checkedAt);

  return {
    apps: apps.length,
    checks: pending.length,
    incidentsOpened: opened,
    incidentsResolved: resolved,
    errors,
  };
}

/* ── Incidents ─────────────────────────────────────────────────────── */

const INCIDENT_TYPE: Record<CheckType, string> = {
  application: "application",
  api: "api",
  hosting: "hosting",
  database: "database",
  domain_ssl: "domain",
  integration: "integration",
  background_jobs: "other",
};

async function reconcileIncidents(
  checks: PendingCheck[],
  at: string
): Promise<{ opened: number; resolved: number }> {
  const db = supabaseAdmin();
  const appIds = [...new Set(checks.map((c) => c.app_id))];
  if (appIds.length === 0) return { opened: 0, resolved: 0 };

  const { data: openRows, error } = await db
    .from("app_incidents")
    .select("id, app_id, incident_type, opened_by, status")
    .in("app_id", appIds)
    .neq("status", "resolved");
  if (error) throw new Error(error.message);

  const open = (openRows ?? []) as {
    id: string; app_id: string; incident_type: string; opened_by: string | null; status: string;
  }[];

  // Worst status seen per (app, incident type) in this run.
  const state = new Map<string, { status: HealthState; message: string; appId: string; type: string }>();
  for (const check of checks) {
    const type = INCIDENT_TYPE[check.check_type];
    const key = `${check.app_id}:${type}`;
    const held = state.get(key);
    const status = worse(held?.status, check.status);
    state.set(key, {
      status,
      message: status === check.status ? check.message : held?.message ?? check.message,
      appId: check.app_id,
      type,
    });
  }

  let opened = 0;
  let resolved = 0;

  for (const [key, value] of state) {
    const existing = open.find((i) => `${i.app_id}:${i.incident_type}` === key);

    if (value.status === "critical" && !existing) {
      const { error: insertError } = await db.from("app_incidents").insert({
        app_id: value.appId,
        incident_type: value.type,
        severity: "critical",
        message: value.message.slice(0, 300),
        detail: "Opened automatically by a health check.",
        status: "open",
        started_at: at,
        opened_by: "system",
      });
      if (insertError) throw new Error(insertError.message);
      await db.from("app_events").insert({
        app_id: value.appId,
        kind: "incident",
        body: `Health check opened a ${value.type} incident: ${value.message.slice(0, 200)}`,
        actor: "system",
      });
      opened += 1;
    }

    // Only close what this system opened.
    if (value.status === "healthy" && existing && existing.opened_by === "system") {
      const { error: updateError } = await db
        .from("app_incidents")
        .update({ status: "resolved", resolved_at: at, resolved_by: "system" })
        .eq("id", existing.id);
      if (updateError) throw new Error(updateError.message);
      await db.from("app_events").insert({
        app_id: value.appId,
        kind: "incident",
        body: `The ${value.type} check is passing again — the automatic incident was resolved.`,
        actor: "system",
      });
      resolved += 1;
    }
  }

  return { opened, resolved };
}

/* ── Probes ────────────────────────────────────────────────────────── */

async function probeHttp(url: string): Promise<{ status: HealthState; ms: number | null; message: string }> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": "TomorrowsTechAI-AppMonitor/1.0" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const ms = Date.now() - started;

    if (response.status >= 500) {
      return { status: "critical", ms, message: `Responded ${response.status}.` };
    }
    if (response.status === 401 || response.status === 403) {
      // A login wall is the application answering. That is up.
      return { status: "healthy", ms, message: `Responded ${response.status} — protected, but answering.` };
    }
    if (response.status >= 400) {
      return { status: "warning", ms, message: `Responded ${response.status}.` };
    }
    if (ms > 4000) {
      return { status: "warning", ms, message: `Responded ${response.status} but took ${(ms / 1000).toFixed(1)}s.` };
    }
    return { status: "healthy", ms, message: `Responded ${response.status} in ${ms}ms.` };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? `No response within ${HTTP_TIMEOUT_MS / 1000}s.`
      : safeMessage(error, "The request failed.");
    return { status: "critical", ms: null, message };
  }
}

function probeTls(
  domain: string
): Promise<{ status: HealthState; sslStatus: string; expiresAt: string | null; message: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { status: HealthState; sslStatus: string; expiresAt: string | null; message: string }) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already gone */ }
      resolve(value);
    };

    const socket = tlsConnect(
      { host: domain, port: 443, servername: domain, timeout: TLS_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          finish({
            status: "unknown",
            sslStatus: "unknown",
            expiresAt: null,
            message: `${domain}: connected, but no certificate was presented.`,
          });
          return;
        }
        const expires = new Date(cert.valid_to);
        const days = Math.round((expires.getTime() - Date.now()) / 86_400_000);
        if (!socket.authorized) {
          finish({
            status: "critical",
            sslStatus: "invalid",
            expiresAt: expires.toISOString(),
            message: `${domain}: certificate rejected — ${socket.authorizationError ?? "not trusted"}.`,
          });
          return;
        }
        if (days < 0) {
          finish({
            status: "critical",
            sslStatus: "invalid",
            expiresAt: expires.toISOString(),
            message: `${domain}: certificate expired ${Math.abs(days)} days ago.`,
          });
          return;
        }
        if (days <= SSL_WARN_DAYS) {
          finish({
            status: "warning",
            sslStatus: "expiring",
            expiresAt: expires.toISOString(),
            message: `${domain}: certificate expires in ${days} ${days === 1 ? "day" : "days"}.`,
          });
          return;
        }
        finish({
          status: "healthy",
          sslStatus: "valid",
          expiresAt: expires.toISOString(),
          message: `${domain}: certificate valid for ${days} more days.`,
        });
      }
    );

    socket.on("timeout", () =>
      finish({
        status: "critical",
        sslStatus: "unknown",
        expiresAt: null,
        message: `${domain}: no TLS handshake within ${TLS_TIMEOUT_MS / 1000}s.`,
      })
    );
    socket.on("error", (error) =>
      finish({
        status: "critical",
        sslStatus: "invalid",
        expiresAt: null,
        message: `${domain}: ${safeMessage(error, "TLS connection failed.")}`,
      })
    );
  });
}

const RANK: Record<HealthState, number> = { healthy: 0, unknown: 1, warning: 2, critical: 3 };

function worse(a: HealthState | undefined, b: HealthState): HealthState {
  if (!a) return b;
  return RANK[b] > RANK[a] ? b : a;
}
