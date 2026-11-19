import "server-only";
import { createSign } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { explainGoogleError, parseServiceKey, syncWindow, toRecords, type ApiRow } from "./gsc-core";

/**
 * Google Search Console → seo_queries.
 *
 * Read-only against Google: one scope (webmasters.readonly), one endpoint
 * (searchAnalytics.query). Runs daily from /api/cron/search-console and from
 * "Sync now" on the SEO screen. Every run, good or bad, is written to
 * seo_sync_runs, which is what the Integrations card and the SEO screen report
 * from — so "connected" means a sync actually worked, not that keys exist.
 *
 * Never throws: a failed run is a recorded result, not an exception.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const PAGE_SIZE = 25_000;
/** Four pages is 100,000 rows; a site this size is nowhere near it. */
const MAX_PAGES = 4;

export type GscSyncResult = {
  ok: boolean;
  rows: number;
  startDate: string | null;
  endDate: string | null;
  error: string | null;
};

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** A short-lived access token from a signed service-account assertion. */
async function accessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 600 })
  )}`;

  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not a usable private key. Paste the key exactly as Google issued it.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Google would not sign in the service account: ${body.error_description ?? body.error ?? res.status}.`);
  }
  return body.access_token;
}

async function fetchRows(token: string, site: string, email: string, startDate: string, endDate: string): Promise<ApiRow[]> {
  const out: ApiRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate, endDate,
          dimensions: ["date", "query", "page"],
          rowLimit: PAGE_SIZE,
          startRow: page * PAGE_SIZE,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }
    );
    const body = (await res.json().catch(() => ({}))) as { rows?: ApiRow[]; error?: { message?: string } };
    if (!res.ok) throw new Error(explainGoogleError(res.status, body.error?.message ?? "no detail", site, email));
    const rows = Array.isArray(body.rows) ? body.rows : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export async function syncSearchConsole(trigger: "cron" | "manual", actor: string | null = null): Promise<GscSyncResult> {
  const db = supabaseAdmin();
  const startedAt = new Date().toISOString();
  let startDate: string | null = null;
  let endDate: string | null = null;

  const finish = async (result: GscSyncResult): Promise<GscSyncResult> => {
    const { error } = await db.from("seo_sync_runs").insert({
      source: "search_console",
      trigger,
      actor,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      ok: result.ok,
      rows: result.rows,
      start_date: result.startDate,
      end_date: result.endDate,
      error: result.error ? result.error.slice(0, 500) : null,
    });
    if (error) console.error("[seo:gsc] could not record the run:", error.message);
    return result;
  };

  try {
    const site = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ?? "").trim();
    const key = parseServiceKey(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    if (!site) throw new Error("GOOGLE_SEARCH_CONSOLE_SITE_URL is not set.");
    if (!key) throw new Error("The service account email or key is missing, or the key is not a private key.");

    const { count } = await db.from("seo_queries").select("id", { count: "exact", head: true }).eq("source", "search_console");
    const window = syncWindow(new Date(), (count ?? 0) > 0);
    startDate = window.startDate;
    endDate = window.endDate;

    const token = await accessToken(key.clientEmail, key.privateKey);
    const records = toRecords(await fetchRows(token, site, key.clientEmail, startDate, endDate), startedAt);

    for (let i = 0; i < records.length; i += 500) {
      const { error } = await db.from("seo_queries").upsert(records.slice(i, i + 500), { onConflict: "date,query,page" });
      if (error) throw new Error(`Could not save search data: ${error.message}`);
    }

    return finish({ ok: true, rows: records.length, startDate, endDate, error: null });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Search Console sync failed.";
    return finish({ ok: false, rows: 0, startDate, endDate, error: message });
  }
}

export type GscLastRun = { ok: boolean; rows: number; finishedAt: string | null; error: string | null };

/** The most recent run, or null when none has happened (or the log cannot be read). */
export async function lastSearchConsoleRun(): Promise<GscLastRun | null> {
  const { data, error } = await supabaseAdmin()
    .from("seo_sync_runs")
    .select("ok, rows, finished_at, error")
    .eq("source", "search_console")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { ok: Boolean(data.ok), rows: Number(data.rows ?? 0), finishedAt: (data.finished_at as string | null) ?? null, error: (data.error as string | null) ?? null };
}
