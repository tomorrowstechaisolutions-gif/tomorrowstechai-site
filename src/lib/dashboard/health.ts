import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastNDays } from "./period";
import { analyticsConfigured } from "@/lib/analytics/vercel-web";
import { loadCronHealth, type CronHealth } from "@/lib/cron/queries";

/**
 * Section 13 — System status.
 *
 * The rule: nothing is reported as connected unless something was actually
 * checked. Presence of an API key means "configured", not "working", and the
 * two are labelled differently. A green dot that means "I found an env var"
 * is how an outage goes unnoticed for a day.
 */

export type ServiceState = "operational" | "warning" | "disconnected" | "error";

export type ServiceHealth = {
  key: string;
  label: string;
  state: ServiceState;
  detail: string;
};

export type HealthReport = {
  services: ServiceHealth[];
  worst: ServiceState;
};

const RANK: Record<ServiceState, number> = {
  error: 0,
  disconnected: 1,
  warning: 2,
  operational: 3,
};

const has = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));

export async function loadHealth(
  sb: SupabaseClient,
  opts: { authenticated: boolean }
): Promise<HealthReport> {
  const week = lastNDays(7);

  // One real round trip. If this errors, the database is not merely
  // "configured" — it is down, and everything below it says so.
  const ping = await sb.from("admin_users").select("id", { count: "exact", head: true });
  const dbUp = !ping.error;

  const [socialAccounts, recentFollowups, cronHealth] = dbUp
    ? await Promise.all([
        sb
          .from("social_accounts")
          .select("platform, status, connected")
          .then((r) => r.data ?? []),
        sb
          .from("lead_followups")
          .select("status", { count: "exact", head: true })
          .eq("status", "sent")
          .gte("sent_at", week.fromIso)
          .then((r) => r.count ?? 0),
        // The cron run log. Reports available: false when the cron_runs
        // migration is not applied, and the entry below then reads as it
        // always did.
        loadCronHealth(sb),
      ])
    : [
        [] as { platform: string; status: string; connected: boolean }[],
        0,
        { available: false, crons: [] } as CronHealth,
      ];

  // Crons whose most recent logged run failed. A cron with no row yet is not
  // counted: no evidence is not the same as a failure.
  const failedCrons = cronHealth.available
    ? cronHealth.crons.filter((c) => c.lastRun && !c.lastRun.ok).map((c) => c.name)
    : [];

  const accounts = socialAccounts as { platform: string; status: string; connected: boolean }[];
  const connected = accounts.filter((a) => a.connected);
  const broken = accounts.filter((a) => a.status === "expired" || a.status === "error");

  const services: ServiceHealth[] = [
    {
      key: "website",
      label: "Website",
      state: "operational",
      detail: "Serving this page.",
    },
    {
      key: "supabase",
      label: "Supabase",
      state: has("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        ? dbUp
          ? "operational"
          : "error"
        : "disconnected",
      detail: has("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        ? dbUp
          ? "Project reachable."
          : "Keys are set but the project did not answer."
        : "Project URL or service key is missing.",
    },
    {
      key: "database",
      label: "Database",
      state: dbUp ? "operational" : "error",
      detail: dbUp ? "Query returned." : (ping.error?.message ?? "Query failed."),
    },
    {
      key: "auth",
      label: "Authentication",
      state: opts.authenticated ? "operational" : "error",
      detail: opts.authenticated
        ? "Admin session verified against admin_users."
        : "No admin session resolved.",
    },
    {
      key: "email",
      label: "Email",
      state: has("RESEND_API_KEY", "CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL")
        ? "operational"
        : has("RESEND_API_KEY")
          ? "warning"
          : "disconnected",
      detail: has("RESEND_API_KEY", "CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL")
        ? "Resend configured with a from and to address."
        : has("RESEND_API_KEY")
          ? "Resend key set, but the from/to addresses are not."
          : "No email provider configured.",
    },
    {
      key: "ai",
      label: "AI",
      state: has("ANTHROPIC_API_KEY") ? "operational" : "disconnected",
      detail: has("ANTHROPIC_API_KEY")
        ? "Claude API key present."
        : "ANTHROPIC_API_KEY is not set — the advisor and copy tools are off.",
    },
    {
      key: "social",
      label: "Social connections",
      state:
        broken.length > 0
          ? "warning"
          : connected.length > 0
            ? "operational"
            : "disconnected",
      detail:
        broken.length > 0
          ? `${broken.length} connection${broken.length === 1 ? "" : "s"} need reconnecting.`
          : connected.length > 0
            ? `${connected.length} account${connected.length === 1 ? "" : "s"} connected.`
            : "No social accounts connected yet.",
    },
    {
      key: "analytics",
      label: "Analytics",
      // GA4 and the Pixel are browser tags and cannot be read back. Vercel
      // Web Analytics can: it is what the Analytics page and the website
      // panel read. Whether it actually answers is checked on Integrations.
      state: analyticsConfigured() ? "operational" : "warning",
      detail: analyticsConfigured()
        ? "Vercel Web Analytics feeds the Analytics page. GA4 and the Meta Pixel also run in the browser."
        : "GA4 and the Meta Pixel run in the browser. No server-side feed.",
    },
    {
      key: "automations",
      label: "Automations",
      state: !has("CRON_SECRET")
        ? "disconnected"
        : failedCrons.length > 0
          ? "warning"
          : (recentFollowups as number) > 0
            ? "operational"
            : "warning",
      detail: !has("CRON_SECRET")
        ? "CRON_SECRET is not set — the follow-up cron never runs."
        : failedCrons.length > 0
          ? `Last run failed: ${failedCrons.join(", ")}.`
          : (recentFollowups as number) > 0
            ? `${recentFollowups} follow-up${recentFollowups === 1 ? "" : "s"} sent in the last 7 days.`
            : "Configured, but nothing has been sent in 7 days.",
    },
    {
      key: "payments",
      label: "Payments",
      state: has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET")
        ? "operational"
        : has("STRIPE_SECRET_KEY")
          ? "warning"
          : "disconnected",
      detail: has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET")
        ? "Stripe key and webhook secret set."
        : has("STRIPE_SECRET_KEY")
          ? "Stripe key set, but no webhook secret — payments won't book revenue."
          : "Stripe is not configured.",
    },
  ];

  const worst = services.reduce<ServiceState>(
    (w, s) => (RANK[s.state] < RANK[w] ? s.state : w),
    "operational"
  );

  return { services, worst };
}
