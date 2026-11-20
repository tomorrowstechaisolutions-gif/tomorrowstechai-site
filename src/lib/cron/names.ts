/**
 * Every cron in vercel.json, by the last segment of its path
 * (/api/cron/<name>). Keep the two in step: a cron missing from this list is
 * still logged by withCronRun, but the health check will not look for it.
 */
export const CRON_NAMES = [
  "followups",
  "pipeline-snapshot",
  "vercel-websites",
  "app-health",
  "app-reports",
  "search-console",
  "ai-watch",
  "email-send",
  "automations",
  "partner-sync",
  "social-publish",
  "bank-sync",
  "blog-publish",
  "ai-insights",
  "crew",
] as const;

export type CronName = (typeof CRON_NAMES)[number];
