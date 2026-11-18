import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/stripe/client";
import { mercuryConfigured } from "@/lib/finance/mercury";
import { metaConfigured } from "@/lib/social/providers/meta";
import { linkedinConfigured } from "@/lib/social/providers/linkedin";
import { xConfigured } from "@/lib/social/providers/x";
import { metaCapiConfigured } from "@/lib/meta/capi";
import { googleConnection } from "@/lib/google/oauth";
import { zoomConnection } from "@/lib/zoom/oauth";
import { connection as searchConsole, localConnection } from "@/lib/seo/search-console";
import { analyticsConfigured } from "@/lib/analytics/vercel-web";
import { providerConnections } from "@/lib/apps/providers";
import { encryptionConfigured } from "@/lib/security/secrets";

/**
 * Integrations: one honest status per outside service the site depends on.
 *
 * Status comes from what each module already records (last sync, last
 * error, connected accounts, the AI provider checks), not from a key merely
 * existing. Where a module has no live record, the card says "Keys set"
 * rather than "Connected". Key VALUES never leave the server; only whether
 * each named variable is set.
 *
 * One failing lookup degrades one card, never the page.
 */

export type IntegrationState = "connected" | "attention" | "keys_set" | "not_set_up";
export type Category = "Payments & money" | "Email" | "Social publishing" | "Ads & tracking" | "Google" | "AI models" | "Meetings" | "Hosting & code" | "Partners" | "Core";

export type Integration = {
  key: string;
  name: string;
  category: Category;
  purpose: string;
  state: IntegrationState;
  detail: string;
  lastActivity: string | null;
  lastActivityLabel: string | null;
  envs: Array<{ name: string; set: boolean; optional?: boolean }>;
  manage: { href: string; label: string } | null;
};

const env = (names: string[], optional: string[] = []) => [
  ...names.map((name) => ({ name, set: Boolean(process.env[name]) })),
  ...optional.map((name) => ({ name, set: Boolean(process.env[name]), optional: true })),
];
const allSet = (names: string[]) => names.every((n) => Boolean(process.env[n]));
const someSet = (names: string[]) => names.some((n) => Boolean(process.env[n]));
const HOUR = 3_600_000;
const ago = (iso: string | null) => (iso ? Date.now() - Date.parse(iso) : Infinity);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export async function loadIntegrations(): Promise<Integration[]> {
  const db = supabaseAdmin();
  const [stripeLast, bank, emailDomain, emailLast, social, ai, google, zoom, apps, partners, metaLeadLast, tokens] = await Promise.all([
    safe(async () => (await db.from("invoice_payments").select("created_at").eq("method", "stripe").order("created_at", { ascending: false }).limit(1)).data?.[0]?.created_at ?? null, null),
    safe(async () => (await db.from("bank_accounts").select("synced_at").order("synced_at", { ascending: false })).data ?? [], [] as Array<{ synced_at: string | null }>),
    safe(async () => (await db.from("email_sending_domains").select("domain, provider_status, spf_status, dkim_status, dmarc_status, last_error, last_checked_at, last_send_at").order("is_default", { ascending: false }).limit(1)).data?.[0] ?? null, null),
    safe(async () => (await db.from("email_events").select("created_at").order("created_at", { ascending: false }).limit(1)).data?.[0]?.created_at ?? null, null),
    safe(async () => (await db.from("social_accounts").select("platform, status, connected, connection_error, last_synced_at")).data ?? [], [] as Array<{ platform: string; status: string | null; connected: boolean | null; connection_error: string | null; last_synced_at: string | null }>),
    safe(async () => (await db.from("ai_providers").select("key, name, credential_env, enabled, status, status_detail, last_checked_at")).data ?? [], [] as Array<{ key: string; name: string; credential_env: string | null; enabled: boolean; status: string; status_detail: string | null; last_checked_at: string | null }>),
    safe(() => googleConnection(), null),
    safe(() => zoomConnection(), null),
    safe(() => providerConnections(), null),
    safe(async () => (await db.from("partner_connections").select("partner_key, name, status, api_key_env, last_sync_at, last_sync_ok, last_sync_error, last_sync_count")).data ?? [], [] as Array<Record<string, unknown>>),
    safe(async () => (await db.from("leads").select("created_at").not("meta_leadgen_id", "is", null).order("created_at", { ascending: false }).limit(1)).data?.[0]?.created_at ?? null, null),
    safe(async () => (await db.from("social_account_tokens").select("provider")).data ?? [], [] as Array<{ provider: string }>),
  ]);

  const out: Integration[] = [];

  /* ── Payments & money ─────────────────────────────────────────── */
  {
    const keys = stripeConfigured(), hook = stripeWebhookConfigured();
    out.push({
      key: "stripe", name: "Stripe", category: "Payments & money",
      purpose: "Card payments for invoices, checkouts and sticker orders. The webhook books each payment and starts subscriptions.",
      state: keys && hook ? "connected" : keys ? "attention" : "not_set_up",
      detail: keys && hook ? "Taking payments; the webhook confirms each one." : keys ? "Payments work, but the webhook secret is missing, so paid invoices won't mark themselves paid." : "Not set up. Clients can't pay online.",
      lastActivity: stripeLast, lastActivityLabel: "Last Stripe payment",
      envs: env(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
      manage: { href: "https://dashboard.stripe.com", label: "Stripe dashboard" },
    });
  }
  {
    const synced = bank.map((b) => b.synced_at).filter(Boolean).sort().pop() ?? null;
    const on = mercuryConfigured();
    const stale = on && ago(synced) > 8 * HOUR;
    out.push({
      key: "mercury", name: "Mercury", category: "Payments & money",
      purpose: "Read-only bank feed. Finance uses it as the record of money in and out.",
      state: !on ? "not_set_up" : !synced ? "attention" : stale ? "attention" : "connected",
      detail: !on ? "Not connected. Finance falls back to admin records." : !synced ? "Token set but nothing synced yet. Press Sync now on Finance." : stale ? "Last sync is older than 8 hours; the 3-hourly sync may be failing." : `${plural(bank.length, "account")} syncing every 3 hours.`,
      lastActivity: synced, lastActivityLabel: "Last sync",
      envs: env(["MERCURY_API_TOKEN"]),
      manage: { href: "/admin/finance", label: "Finance" },
    });
  }

  /* ── Email ────────────────────────────────────────────────────── */
  {
    const key = Boolean(process.env.RESEND_API_KEY);
    const d = emailDomain as null | { domain: string; provider_status: string | null; spf_status: string | null; dkim_status: string | null; dmarc_status: string | null; last_error: string | null; last_checked_at: string | null; last_send_at: string | null };
    const authBad = d && [d.spf_status, d.dkim_status].some((s) => s && !/verified|pass|valid|ok/i.test(s));
    out.push({
      key: "resend", name: "Resend", category: "Email",
      purpose: "Every email the site sends: invoices, proposals, portal invites, lead follow-ups, campaigns.",
      state: !key ? "not_set_up" : d?.last_error || authBad ? "attention" : "connected",
      detail: !key ? "Not set up. No email goes out." : d?.last_error ? `Last domain check reported: ${d.last_error}` : authBad ? `Sending domain ${d!.domain}: SPF ${d!.spf_status ?? "?"}, DKIM ${d!.dkim_status ?? "?"}. Fix this or mail lands in spam.` : d ? `Sending from ${d.domain}${d.dmarc_status ? ` · DMARC ${d.dmarc_status}` : ""}.` : "Sending. Domain authentication hasn't been checked here yet.",
      lastActivity: d?.last_send_at ?? emailLast, lastActivityLabel: "Last email event",
      envs: env(["RESEND_API_KEY", "CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL"], ["RESEND_AUDIENCE_ID", "RESEND_WEBHOOK_SECRET"]),
      manage: { href: "/admin/marketing/email", label: "Email Marketing" },
    });
  }

  /* ── Social publishing ────────────────────────────────────────── */
  const socialCard = (key: "meta" | "linkedin" | "x", name: string, platforms: string[], configured: boolean, envNames: string[], optional: string[], purpose: string) => {
    const rows = social.filter((s) => platforms.includes(s.platform));
    const live = rows.filter((r) => r.connected && r.status === "connected");
    const broken = rows.filter((r) => r.status === "expired" || r.status === "error" || r.connection_error);
    const hasTokens = tokens.some((t) => t.provider === key);
    const synced = rows.map((r) => r.last_synced_at).filter(Boolean).sort().pop() ?? null;
    out.push({
      key: `social-${key}`, name, category: "Social publishing", purpose,
      state: !configured ? "not_set_up" : broken.length ? "attention" : live.length && hasTokens ? "connected" : "attention",
      detail: !configured ? "App keys not set." : broken.length ? `${plural(broken.length, "account")} need reconnecting (${broken.map((b) => b.platform).join(", ")}).` : live.length && hasTokens ? `${plural(live.length, "account")} connected and posting.` : "App keys set, but no account connected yet. Connect one in Social Center.",
      lastActivity: synced, lastActivityLabel: "Last profile sync",
      envs: env(envNames, optional),
      manage: { href: "/admin/marketing/social", label: "Social Center" },
    });
  };
  socialCard("meta", "Facebook & Instagram", ["facebook", "instagram"], metaConfigured(), ["META_APP_ID", "META_APP_SECRET", "INTEGRATION_ENCRYPTION_KEY"], ["META_LOGIN_CONFIG_ID"], "Posts to your Facebook Pages and Instagram business accounts.");
  socialCard("linkedin", "LinkedIn", ["linkedin"], linkedinConfigured(), ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "INTEGRATION_ENCRYPTION_KEY"], [], "Posts to your personal LinkedIn profile.");
  socialCard("x", "X", ["x"], xConfigured(), ["X_CLIENT_ID", "X_CLIENT_SECRET", "INTEGRATION_ENCRYPTION_KEY"], [], "Posts to your X account. Posting may need X API credits.");

  /* ── Ads & tracking ───────────────────────────────────────────── */
  {
    const pixel = someSet(["NEXT_PUBLIC_META_PIXEL_ID", "META_PIXEL_ID"]);
    const capi = metaCapiConfigured();
    out.push({
      key: "meta-pixel", name: "Meta Pixel & Conversions API", category: "Ads & tracking",
      purpose: "Tells Meta which ad clicks became leads and purchases, so ads optimise for real results.",
      state: pixel && capi ? "keys_set" : pixel ? "attention" : "not_set_up",
      detail: pixel && capi ? "Pixel in the browser plus server-side events. Check delivery in Meta Events Manager." : pixel ? "Pixel only. Without the CAPI token, ad-blocked and iOS conversions are lost." : "Not set up. Meta can't see which ads produce leads.",
      lastActivity: null, lastActivityLabel: null,
      envs: env(["NEXT_PUBLIC_META_PIXEL_ID", "META_CAPI_ACCESS_TOKEN"], ["META_TEST_EVENT_CODE"]),
      manage: { href: "https://business.facebook.com/events_manager2", label: "Events Manager" },
    });
    const leadKeys = ["META_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET", "META_PAGE_ACCESS_TOKEN"];
    out.push({
      key: "meta-leads", name: "Meta Lead Ads", category: "Ads & tracking",
      purpose: "Instant-form leads from Facebook and Instagram ads arrive in Leads automatically.",
      state: allSet(leadKeys) ? (metaLeadLast ? "connected" : "keys_set") : someSet(leadKeys) ? "attention" : "not_set_up",
      detail: allSet(leadKeys) ? (metaLeadLast ? "Receiving form leads." : "Keys set; no instant-form lead has arrived yet.") : someSet(leadKeys) ? "Partly set up; form leads won't arrive until all three keys are set." : "Not set up. Instant-form leads stay inside Meta.",
      lastActivity: metaLeadLast, lastActivityLabel: "Last form lead",
      envs: env(leadKeys),
      manage: { href: "/admin/leads", label: "Leads" },
    });
    out.push({
      key: "meta-spend", name: "Meta ad spend", category: "Ads & tracking",
      purpose: "Daily ad spend per campaign for cost-per-lead. Entered by hand today; no automatic sync exists yet.",
      state: "not_set_up", detail: "Manual entry only. Spend you record on Ad spend feeds cost-per-lead.",
      lastActivity: null, lastActivityLabel: null, envs: [],
      manage: { href: "/admin/marketing/spend", label: "Ad spend" },
    });
  }

  /* ── Google ───────────────────────────────────────────────────── */
  out.push({
    key: "google", name: "Gmail, Calendar & Meet", category: "Google",
    purpose: "Your Gmail inbox on the Email page, Google Calendar events on the Calendar, and Meet links for meetings.",
    state: !google?.configured ? "not_set_up" : google.lastError ? "attention" : google.connected ? "connected" : "attention",
    detail: !google?.configured ? "App keys not set." : google.lastError ? `Last error: ${google.lastError}` : google.connected ? `Connected as ${google.account ?? "your Google account"} · calendar ${google.calendarId}${google.gmail ? " · Gmail on" : " · Gmail not granted, reconnect in Settings"}.` : "Keys set, but no Google account connected. Connect it in Settings.",
    lastActivity: google?.connectedAt ?? null, lastActivityLabel: "Connected",
    envs: env(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["GOOGLE_REDIRECT_URI"]),
    manage: { href: "/admin/settings", label: "Settings" },
  });
  {
    const gsc = searchConsole();
    out.push({
      key: "search-console", name: "Google Search Console", category: "Google",
      purpose: "Search impressions, clicks and keyword positions for the SEO page.",
      state: gsc.connected ? "keys_set" : gsc.missing.length < 3 ? "attention" : "not_set_up",
      detail: gsc.connected ? `Keys set for ${gsc.property}. Data import isn't built yet.` : gsc.reason,
      lastActivity: null, lastActivityLabel: null,
      envs: env(["GOOGLE_SEARCH_CONSOLE_SITE_URL", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY"]),
      manage: { href: "/admin/marketing/seo", label: "SEO" },
    });
    const gbp = localConnection();
    out.push({
      key: "business-profile", name: "Google Business Profile", category: "Google",
      purpose: "Views, calls and direction requests from your Google listing.",
      state: gbp.connected ? "keys_set" : "not_set_up", detail: gbp.connected ? "Account set. Data import isn't built yet." : "Not connected.",
      lastActivity: null, lastActivityLabel: null, envs: env(["GOOGLE_BUSINESS_PROFILE_ACCOUNT"]),
      manage: { href: "/admin/marketing/seo", label: "SEO" },
    });
    out.push({
      key: "ga4", name: "Google Analytics 4", category: "Google",
      purpose: "Visitor analytics in the browser (property G-1N0MZPDTF5), after cookie consent.",
      state: "connected", detail: "Tag installed on every page. Reports live in Google Analytics, not here.",
      lastActivity: null, lastActivityLabel: null, envs: [],
      manage: { href: "https://analytics.google.com", label: "Google Analytics" },
    });
  }

  /* ── AI models ────────────────────────────────────────────────── */
  const AI_USE: Record<string, string> = {
    anthropic: "Advisor, website chat, blog review, content and ad copy, task and calendar planning.",
    openai: "Receipt reading, weekly AI insights, Ad Studio images and copy, sticker art.",
    google: "Available to AI Solutions; nothing on the site depends on it yet.",
    perplexity: "Available to AI Solutions; nothing on the site depends on it yet.",
  };
  for (const p of ai) {
    const name = p.key === "google" ? "Google Gemini" : p.name;
    const envName = p.credential_env;
    out.push({
      key: `ai-${p.key}`, name, category: "AI models", purpose: AI_USE[p.key] ?? "AI model provider.",
      state: p.status === "operational" ? "connected" : p.status === "not_configured" ? "not_set_up" : p.status === "unknown" ? "keys_set" : "attention",
      detail: p.status === "operational" ? `Working. ${p.status_detail ?? ""}`.trim() : p.status_detail ?? "Status unknown.",
      lastActivity: p.last_checked_at, lastActivityLabel: "Last checked",
      envs: envName ? env([envName]) : [],
      manage: { href: "/admin/ai-solutions", label: "AI Solutions" },
    });
  }

  /* ── Meetings ─────────────────────────────────────────────────── */
  out.push({
    key: "zoom", name: "Zoom", category: "Meetings",
    purpose: "Creates Zoom links for meetings and records attendance from Zoom's webhook.",
    state: !zoom?.configured ? "not_set_up" : zoom.lastError ? "attention" : zoom.connected ? "connected" : "attention",
    detail: !zoom?.configured ? `Not set up${zoom?.missing?.length ? ` (missing ${zoom.missing.join(", ")})` : ""}.` : zoom.lastError ? `Last error: ${zoom.lastError}` : zoom.connected ? `Connected as ${zoom.account ?? "your Zoom account"}${zoom.planType === 1 ? " · Basic plan (40-minute limit)" : ""}.` : "Keys set, but no Zoom account connected.",
    lastActivity: zoom?.lastErrorAt ?? zoom?.connectedAt ?? null, lastActivityLabel: zoom?.lastErrorAt ? "Last error" : "Connected",
    envs: env(["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "INTEGRATION_ENCRYPTION_KEY"], ["ZOOM_WEBHOOK_SECRET_TOKEN"]),
    manage: { href: "/admin/conference-center/settings", label: "Conference Center" },
  });
  out.push({
    key: "cal", name: "Cal.com", category: "Meetings",
    purpose: "The public discovery-call booking embed (tomorrowstechai/discovery).",
    state: "connected", detail: "Embedded on the site. Bookings are managed in Cal.com.",
    lastActivity: null, lastActivityLabel: null, envs: [],
    manage: { href: "https://app.cal.com/bookings", label: "Cal.com" },
  });

  /* ── Hosting & code ───────────────────────────────────────────── */
  const appCard = (k: "vercel" | "github" | "supabase", name: string, purpose: string) => {
    const c = apps?.[k];
    out.push({
      key: `api-${k}`, name, category: "Hosting & code", purpose,
      state: !c ? "attention" : c.lastError ? "attention" : c.connected ? "connected" : "not_set_up",
      detail: !c ? "Couldn't read the connection." : c.lastError ? `Last error: ${c.lastError}` : c.connected ? `Connected${c.accountLabel ? ` as ${c.accountLabel}` : ""}.` : "Not connected. Paste a token on Websites or Apps.",
      lastActivity: c?.connectedAt ?? null, lastActivityLabel: "Connected",
      envs: [],
      manage: { href: k === "vercel" ? "/admin/websites" : "/admin/apps", label: k === "vercel" ? "Websites" : "Apps" },
    });
  };
  appCard("vercel", "Vercel API", "Syncs client websites and app deployments, and powers the daily health checks.");
  appCard("github", "GitHub", "Reads repos and commits for the Apps board.");
  appCard("supabase", "Supabase Management API", "Reads client Supabase projects for the Apps board.");
  out.push({
    key: "vercel-analytics", name: "Vercel Web Analytics", category: "Hosting & code",
    purpose: "Page views and visitors on Analytics and the Blog pages.",
    state: analyticsConfigured() ? "keys_set" : "not_set_up",
    detail: analyticsConfigured() ? "Token set. Traffic shows on Analytics." : "Not set up. Traffic panels show 'not connected'.",
    lastActivity: null, lastActivityLabel: null,
    envs: env(["VERCEL_ANALYTICS_TOKEN", "VERCEL_ANALYTICS_PROJECT_ID"], ["VERCEL_ANALYTICS_TEAM_ID"]),
    manage: { href: "/admin/intelligence", label: "Analytics" },
  });

  /* ── Partners ─────────────────────────────────────────────────── */
  for (const p of partners as Array<{ partner_key: string; name: string | null; status: string; api_key_env: string | null; last_sync_at: string | null; last_sync_ok: boolean | null; last_sync_error: string | null; last_sync_count: number | null }>) {
    const keySet = p.api_key_env ? Boolean(process.env[p.api_key_env]) : false;
    out.push({
      key: `partner-${p.partner_key}`, name: p.name ?? p.partner_key, category: "Partners",
      purpose: "Partner API: pulls work orders and settlements, pushes campaign status back.",
      state: !keySet || p.status === "pending_configuration" ? "not_set_up" : p.last_sync_ok === false || p.status !== "active" ? "attention" : "connected",
      detail: !keySet ? "API key not set." : p.last_sync_ok === false ? `Last sync failed: ${p.last_sync_error ?? "no detail"}` : p.status !== "active" ? `Status: ${p.status.replace(/_/g, " ")}.` : `Syncing every 15 minutes${p.last_sync_count != null ? ` · ${plural(p.last_sync_count, "record")} last run` : ""}.`,
      lastActivity: p.last_sync_at, lastActivityLabel: "Last sync",
      envs: p.api_key_env ? env([p.api_key_env]) : [],
      manage: { href: `/admin/partners/${p.partner_key}`, label: "Partner" },
    });
  }

  /* ── Core ─────────────────────────────────────────────────────── */
  out.push({
    key: "supabase", name: "Supabase (this site)", category: "Core",
    purpose: "The database and logins behind the whole site.",
    state: supabaseConfigured() ? "connected" : "attention",
    detail: supabaseConfigured() ? "Database reachable from the server." : "Service role key missing; admin features will fail.",
    lastActivity: null, lastActivityLabel: null,
    envs: env(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    manage: null,
  });
  {
    const core = ["CRON_SECRET", "INTEGRATION_ENCRYPTION_KEY", "NEXT_PUBLIC_SITE_URL"];
    const missing = core.filter((n) => !process.env[n]);
    out.push({
      key: "core", name: "Scheduled jobs & security", category: "Core",
      purpose: "Lets the scheduled jobs run (syncs, posting, follow-ups, insights) and encrypts stored login tokens.",
      state: missing.length ? "attention" : "connected",
      detail: missing.length ? `Missing ${missing.join(", ")}. ${missing.includes("CRON_SECRET") ? "Scheduled jobs are refusing to run." : ""}`.trim() : encryptionConfigured() ? "Scheduled jobs authorised; stored tokens encrypted." : "Set.",
      lastActivity: null, lastActivityLabel: null,
      envs: env(core),
      manage: null,
    });
  }

  return out;
}
