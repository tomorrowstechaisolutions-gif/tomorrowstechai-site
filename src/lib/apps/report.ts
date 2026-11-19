import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeMessage } from "./providers";
import { parseReport } from "./report-contract";
import { classifyResponse, planWrites } from "./report-writes";

/**
 * Pulling a product's business report.
 *
 * Each of our own products (Held, Storyborn, whatever comes next) answers
 * GET /api/portfolio/report with a ttai.app-report/v1 snapshot. This file
 * fetches it, proves it is a report, and stores it. See report-contract.ts
 * for the shape and the apps migration header for why the admin center asks
 * the product instead of reading the product's database.
 *
 * THE RULES
 *
 * 1. A failed pull stores nothing. The last good report keeps showing, and
 *    the screens mark it stale by its age. Only the connection row learns
 *    about the failure, in words a person can act on.
 * 2. The key never touches the database. The connection row names the
 *    environment variable; the value is read here, on the server, per call.
 * 3. Nothing in here throws to a page or a cron. Every path returns a result.
 * 4. Redirects are not followed. A product that redirects a machine to its
 *    sign-in page must fail loudly, not hand back a login page with a 200.
 */

export type PullResult =
  | { ok: true; appId: string; slug: string; events: number }
  | { ok: false; appId: string; slug: string; error: string };

type Connection = {
  integrationId: string;
  appId: string;
  slug: string;
  name: string;
  endpointUrl: string | null;
  keyEnv: string | null;
};

const TIMEOUT_MS = 20_000;

/** Our priority product leads every list it appears in. */
const byPriority = (a: { slug: string; name: string }, b: { slug: string; name: string }) => {
  if (a.slug === "held") return -1;
  if (b.slug === "held") return 1;
  return a.name.localeCompare(b.name);
};

async function loadConnections(appId?: string): Promise<Connection[]> {
  let query = supabaseAdmin()
    .from("app_integrations")
    .select("id, app_id, metadata, apps!inner(slug, name, is_archived)")
    .eq("provider", "report")
    .eq("apps.is_archived", false);
  if (appId) query = query.eq("app_id", appId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    app_id: string;
    metadata: Record<string, unknown> | null;
    apps: { slug: string; name: string } | { slug: string; name: string }[];
  };

  return ((data ?? []) as unknown as Row[])
    .map((row) => {
      const app = Array.isArray(row.apps) ? row.apps[0] : row.apps;
      const meta = row.metadata ?? {};
      return {
        integrationId: row.id,
        appId: row.app_id,
        slug: app?.slug ?? "",
        name: app?.name ?? "This app",
        endpointUrl: typeof meta.endpoint_url === "string" ? meta.endpoint_url : null,
        keyEnv: typeof meta.key_env === "string" ? meta.key_env : null,
      };
    })
    .sort(byPriority);
}

async function mark(
  integrationId: string,
  status: "connected" | "needs_attention" | "not_configured",
  error: string | null
): Promise<void> {
  await supabaseAdmin()
    .from("app_integrations")
    .update({ status, error, last_checked_at: new Date().toISOString() })
    .eq("id", integrationId);
}

async function fetchReport(c: Connection, key: string): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(c.endpointUrl as string, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: `Couldn't reach ${c.name}'s report. The product may be down or the address may be wrong.` };
  }

  const problem = classifyResponse(res.status, res.headers.get("content-type"));
  if (problem) return { ok: false, error: problem };

  try {
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, error: "The product answered with something that is not a report." };
  }
}

async function pull(c: Connection): Promise<PullResult> {
  const failed = async (error: string, status: "needs_attention" | "not_configured" = "needs_attention"): Promise<PullResult> => {
    const message = safeMessage(new Error(error), error);
    await mark(c.integrationId, status, message).catch(() => undefined);
    return { ok: false, appId: c.appId, slug: c.slug, error: message };
  };

  if (!c.endpointUrl || !/^https:\/\//i.test(c.endpointUrl)) {
    return failed("This connection has no https report address.", "not_configured");
  }
  if (!c.keyEnv) return failed("This connection does not name the key to use.", "not_configured");

  const key = process.env[c.keyEnv];
  if (!key) return failed(`${c.keyEnv} is not set in Vercel. Add it, redeploy, then Pull now.`, "not_configured");

  const fetched = await fetchReport(c, key);
  if (!fetched.ok) return failed(fetched.error);

  const parsed = parseReport(fetched.body);
  if (!parsed.ok) return failed(`${c.name} sent a report this admin center could not accept: ${parsed.error}`);

  // A key pointed at the wrong product would otherwise file one product's
  // numbers under another's name.
  if (parsed.report.app !== c.slug.toLowerCase()) {
    return failed(`This report says it is for "${parsed.report.app}", not "${c.slug}". Nothing was stored.`);
  }

  const writes = planWrites(c.appId, parsed.report, new Date());
  const sb = supabaseAdmin();

  try {
    const stored = await sb.from("app_reports").insert(writes.reportRow);
    if (stored.error) throw new Error(stored.error.message);

    const daily = await sb.from("app_metrics_daily").upsert(writes.dailyRow, { onConflict: "app_id,day" });
    if (daily.error) throw new Error(daily.error.message);

    if (writes.eventRows.length) {
      const events = await sb
        .from("app_report_events")
        .upsert(writes.eventRows, { onConflict: "app_id,external_id", ignoreDuplicates: true });
      if (events.error) throw new Error(events.error.message);
    }

    if (writes.healthRows.length) {
      const health = await sb.from("app_health_checks").insert(writes.healthRows);
      if (health.error) throw new Error(health.error.message);
    }
  } catch (error) {
    return failed(`The report arrived but could not be saved: ${safeMessage(error, "database error")}`);
  }

  await mark(c.integrationId, "connected", null).catch(() => undefined);
  return { ok: true, appId: c.appId, slug: c.slug, events: writes.eventRows.length };
}

/** Pulls one app's report now. Never throws. */
export async function pullAppReport(appId: string): Promise<PullResult> {
  try {
    const [connection] = await loadConnections(appId);
    if (!connection) {
      return { ok: false, appId, slug: "", error: "This app has no business report connection yet." };
    }
    return await pull(connection);
  } catch (error) {
    return { ok: false, appId, slug: "", error: safeMessage(error, "The report pull failed.") };
  }
}

/** Pulls every connected product. One product failing never stops another. */
export async function pullAllAppReports(): Promise<PullResult[]> {
  let connections: Connection[];
  try {
    connections = await loadConnections();
  } catch (error) {
    return [{ ok: false, appId: "", slug: "", error: safeMessage(error, "Could not read the report connections.") }];
  }

  const settled = await Promise.allSettled(connections.map((c) => pull(c)));
  return settled.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : {
          ok: false as const,
          appId: connections[i].appId,
          slug: connections[i].slug,
          error: safeMessage(result.reason, "The report pull failed."),
        }
  );
}

const DAY_MS = 86_400_000;

/**
 * Retention. Raw snapshots and reported health are evidence for a month;
 * events for six. The daily rollup is the long memory and is never pruned.
 */
export async function pruneReports(): Promise<void> {
  const sb = supabaseAdmin();
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const halfYearAgo = new Date(Date.now() - 180 * DAY_MS).toISOString();

  const results = await Promise.all([
    sb.from("app_reports").delete().lt("pulled_at", monthAgo),
    sb.from("app_health_checks").delete().like("target", "report:%").lt("checked_at", monthAgo),
    sb.from("app_report_events").delete().lt("occurred_at", halfYearAgo),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}
