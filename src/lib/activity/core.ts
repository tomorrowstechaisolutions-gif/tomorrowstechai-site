import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";

/**
 * Activity Center — the pure half.
 *
 * The page is a read-time merge over the event logs the admin already keeps.
 * There is no `activities` table on purpose (same reasoning as the dashboard
 * feed in src/lib/dashboard/activity.ts): a copied log is a cache with no
 * owner, and it is wrong the first time something writes to one table and not
 * the other.
 *
 * Everything here is plain data in, plain data out, so it is unit-tested
 * without a database: which logs feed which module, how a row becomes a line
 * on the page, what the date filter means in Chicago time, and how the merged
 * list is trimmed.
 */

// ── Modules ────────────────────────────────────────────────────────────────

export type ActivityModuleKey =
  | "leads"
  | "projects"
  | "finance"
  | "marketing"
  | "services"
  | "apps"
  | "websites"
  | "ai"
  | "tasks";

export const MODULES: { key: ActivityModuleKey; label: string; tone: string }[] = [
  { key: "leads", label: "Leads & sales", tone: "m-lead" },
  { key: "projects", label: "Projects", tone: "m-project" },
  { key: "finance", label: "Finance", tone: "m-finance" },
  { key: "marketing", label: "Marketing", tone: "m-social" },
  { key: "services", label: "Services", tone: "" },
  { key: "apps", label: "Apps", tone: "" },
  { key: "websites", label: "Websites", tone: "" },
  { key: "ai", label: "AI & automations", tone: "m-ai" },
  { key: "tasks", label: "Tasks", tone: "" },
];

const MODULE_KEYS = new Set<string>(MODULES.map((m) => m.key));

export function moduleLabel(key: ActivityModuleKey): string {
  return MODULES.find((m) => m.key === key)?.label ?? key;
}

// ── Filters ────────────────────────────────────────────────────────────────

export type RangeKey = "today" | "7d" | "30d" | "90d" | "all" | "custom";

export const RANGES: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

export const DEFAULT_RANGE: RangeKey = "30d";
export const PAGE_SIZE = 100;
export const MAX_LIMIT = 1000;

export type ActivityFilters = {
  module: ActivityModuleKey | "all";
  range: RangeKey;
  /** YYYY-MM-DD, Chicago calendar days. Only meaningful when range is custom. */
  from: string | null;
  to: string | null;
  limit: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** A real calendar day, not just something shaped like one (no Feb 31). */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Reads the query string. Anything unrecognised falls back to the default
 * rather than erroring: a hand-edited or stale link should still show a page.
 */
export function parseFilters(params: RawParams): ActivityFilters {
  const moduleRaw = first(params.module);
  const picked: ActivityFilters["module"] = MODULE_KEYS.has(moduleRaw)
    ? (moduleRaw as ActivityModuleKey)
    : "all";

  let from = isIsoDay(first(params.from)) ? first(params.from) : null;
  let to = isIsoDay(first(params.to)) ? first(params.to) : null;
  if (from && to && from > to) [from, to] = [to, from];

  const rangeRaw = first(params.range);
  let range: RangeKey = RANGES.some((r) => r.key === rangeRaw)
    ? (rangeRaw as RangeKey)
    : DEFAULT_RANGE;
  // Dates in the link mean a custom range, whether or not range=custom came
  // with them. range=custom with no usable date means nothing, so default.
  if (from || to) {
    if (rangeRaw === "custom" || rangeRaw === "") range = "custom";
  }
  if (range !== "custom") {
    from = null;
    to = null;
  }

  const limitRaw = Number.parseInt(first(params.limit), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Math.ceil(limitRaw / PAGE_SIZE) * PAGE_SIZE))
    : PAGE_SIZE;

  return { module: picked, range, from, to, limit };
}

/** The link for these filters. Defaults are left out so the plain URL stays plain. */
export function filtersHref(filters: ActivityFilters, patch: Partial<ActivityFilters> = {}): string {
  const next = { ...filters, ...patch };
  const qs = new URLSearchParams();
  if (next.module !== "all") qs.set("module", next.module);
  if (next.range === "custom") {
    if (next.from || next.to) {
      qs.set("range", "custom");
      if (next.from) qs.set("from", next.from);
      if (next.to) qs.set("to", next.to);
    }
  } else if (next.range !== DEFAULT_RANGE) {
    qs.set("range", next.range);
  }
  if (next.limit > PAGE_SIZE) qs.set("limit", String(next.limit));
  const query = qs.toString();
  return query ? `/admin/activity?${query}` : "/admin/activity";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD shifted by whole calendar days. */
export function shiftDay(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dayLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type ActivityWindow = {
  /** Half-open UTC instants: from <= t < to. null means unbounded. */
  fromIso: string | null;
  toIso: string | null;
  label: string;
};

/**
 * What the date filter means, in Chicago calendar days.
 *
 * "7 days" is today plus the six days before it, starting at Chicago
 * midnight, so the list does not lose its oldest hour every hour.
 */
export function resolveWindow(filters: ActivityFilters, now: Date = new Date()): ActivityWindow {
  const today = chicagoDate(now);
  const startOf = (day: string) => zonedMidnightUtc(day).toISOString();

  switch (filters.range) {
    case "today":
      return { fromIso: startOf(today), toIso: null, label: "today" };
    case "7d":
      return { fromIso: startOf(shiftDay(today, -6)), toIso: null, label: "the last 7 days" };
    case "30d":
      return { fromIso: startOf(shiftDay(today, -29)), toIso: null, label: "the last 30 days" };
    case "90d":
      return { fromIso: startOf(shiftDay(today, -89)), toIso: null, label: "the last 90 days" };
    case "all":
      return { fromIso: null, toIso: null, label: "all time" };
    case "custom": {
      const { from, to } = filters;
      const label =
        from && to
          ? from === to
            ? dayLabel(from)
            : `${dayLabel(from)} to ${dayLabel(to)}`
          : from
            ? `since ${dayLabel(from)}`
            : to
              ? `up to ${dayLabel(to)}`
              : "all time";
      return {
        fromIso: from ? startOf(from) : null,
        // Inclusive end day: stop at the midnight that begins the day after.
        toIso: to ? startOf(shiftDay(to, 1)) : null,
        label,
      };
    }
  }
}

// ── Sources ────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

type Line = { title: string; subtitle: string | null; href: string };

export type SourceSpec = {
  key: string;
  module: ActivityModuleKey;
  /** What the operator calls this log. Shown in "what feeds this page". */
  label: string;
  table: string;
  /** The column that says when it happened. Rows without one are skipped. */
  timeCol: string;
  select: string;
  where?: [column: string, value: string | number | boolean][];
  /**
   * Too chatty for the all-modules view. It is only read when its own module
   * is picked, and the page says so.
   */
  quiet?: boolean;
  map: (row: Row) => Line | null;
};

export type ActivityEntry = Line & {
  id: string;
  module: ActivityModuleKey;
  source: string;
  at: string;
};

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A joined record's field. Supabase returns the join as an object or a one-item array. */
export function rel(row: Row, relation: string, field: string): string | null {
  const joined = row[relation];
  const record = Array.isArray(joined) ? joined[0] : joined;
  if (!record || typeof record !== "object") return null;
  return str((record as Row)[field]);
}

const clip = (text: string | null, max = 140): string | null => {
  if (!text) return null;
  const line = text.split("\n")[0].trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/** "audience_changed" → "audience changed". */
const words = (v: unknown): string => (str(v) ?? "activity").replace(/_/g, " ");

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const joinParts = (...parts: (string | null)[]): string | null => {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(" · ") : null;
};

export function dollars(cents: number): string {
  const hasCents = cents % 100 !== 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
}

const id = (row: Row, column: string): string | null => str(row[column]);

const LEAD_TITLES: Record<string, string> = {
  form_submit: "New lead received",
  status_change: "Lead status changed",
  email_sent: "Email sent to lead",
  email_failed: "Email to lead failed",
  call: "Call logged",
  sms: "Text logged",
  note: "Note added to lead",
  followup_sent: "Automated follow-up sent",
  appointment: "Appointment booked",
  revenue: "Revenue recorded",
  duplicate_merge: "Returning lead merged",
  system: "System event",
};

const INVOICE_TITLES: Record<string, string> = {
  created: "created",
  edited: "edited",
  sent: "sent",
  resent: "sent again",
  viewed: "viewed by the client",
  paid: "paid",
  voided: "voided",
};

const SOCIAL_TITLES: Record<string, string> = {
  account_connected: "Social account connected",
  account_disconnected: "Social account disconnected",
  post_created: "Post drafted",
  post_scheduled: "Post scheduled",
  post_published: "Post published",
  publish_failed: "Post failed to publish",
};

export const SOURCES: SourceSpec[] = [
  // ── Leads & sales ──
  {
    key: "lead_events",
    module: "leads",
    label: "Lead timelines",
    table: "lead_events",
    timeCol: "created_at",
    select: "id, lead_id, created_at, type, body, leads(business_name)",
    map: (r) => ({
      title: LEAD_TITLES[str(r.type) ?? ""] ?? "Lead activity",
      subtitle: joinParts(rel(r, "leads", "business_name"), clip(str(r.body))),
      href: id(r, "lead_id") ? `/admin/leads/${id(r, "lead_id")}` : "/admin/leads",
    }),
  },
  {
    key: "deal_stage_history",
    module: "leads",
    label: "Pipeline stage changes",
    table: "deal_stage_history",
    timeCol: "changed_at",
    select: "id, deal_id, from_stage, to_stage, note, changed_at, deals(title)",
    map: (r) => ({
      title: str(r.to_stage) ? `Deal moved to ${words(r.to_stage)}` : "Deal stage changed",
      subtitle: joinParts(rel(r, "deals", "title"), clip(str(r.note))),
      href: "/admin/pipeline",
    }),
  },
  {
    key: "proposal_events",
    module: "leads",
    label: "Proposal timelines",
    table: "proposal_events",
    timeCol: "created_at",
    select: "id, proposal_id, event_type, body, created_at, proposals(proposal_number, title)",
    map: (r) => ({
      title: `Proposal ${rel(r, "proposals", "proposal_number") ?? ""} ${words(r.event_type)}`.replace(/\s+/g, " "),
      subtitle: joinParts(rel(r, "proposals", "title"), clip(str(r.body))),
      href: id(r, "proposal_id") ? `/admin/proposals/${id(r, "proposal_id")}` : "/admin/proposals",
    }),
  },

  // ── Projects ──
  {
    key: "job_events",
    module: "projects",
    label: "Project timelines",
    table: "job_events",
    timeCol: "created_at",
    select: "id, job_id, created_at, kind, body, to_stage, jobs(title, business_name)",
    map: (r) => ({
      title:
        str(r.kind) === "stage_change" && str(r.to_stage)
          ? `Project moved to ${words(r.to_stage)}`
          : str(r.kind) === "task"
            ? "Project checklist updated"
            : str(r.kind) === "note"
              ? "Project note"
              : "Project activity",
      subtitle: joinParts(rel(r, "jobs", "title") ?? rel(r, "jobs", "business_name"), clip(str(r.body))),
      href: id(r, "job_id") ? `/admin/jobs/${id(r, "job_id")}` : "/admin/jobs",
    }),
  },
  {
    key: "client_request_events",
    module: "projects",
    label: "Client request timelines",
    table: "client_request_events",
    timeCol: "at",
    select: "id, request_id, kind, detail, at, client_requests(title, customer_id)",
    map: (r) => {
      const customer = rel(r, "client_requests", "customer_id");
      return {
        title: `Client request ${words(r.kind)}`,
        subtitle: joinParts(rel(r, "client_requests", "title"), clip(str(r.detail))),
        href: customer ? `/admin/clients/${customer}` : "/admin/clients",
      };
    },
  },
  {
    key: "portal_requests",
    module: "projects",
    label: "Client portal requests",
    table: "portal_requests",
    timeCol: "created_at",
    select: "id, customer_id, category, subject, created_at, customers(name, business_name)",
    map: (r) => ({
      title: `Portal request: ${str(r.subject) ?? words(r.category)}`,
      subtitle: rel(r, "customers", "business_name") ?? rel(r, "customers", "name"),
      href: id(r, "customer_id") ? `/admin/clients/${id(r, "customer_id")}` : "/admin/clients",
    }),
  },

  // ── Finance ──
  {
    key: "invoice_events",
    module: "finance",
    label: "Invoice timelines",
    table: "invoice_events",
    timeCol: "created_at",
    select: "id, invoice_id, event_type, body, created_at, invoices(invoice_number, title)",
    map: (r) => {
      const type = str(r.event_type) ?? "";
      return {
        title: `Invoice ${rel(r, "invoices", "invoice_number") ?? ""} ${INVOICE_TITLES[type] ?? words(type)}`.replace(/\s+/g, " "),
        subtitle: clip(str(r.body)) ?? rel(r, "invoices", "title"),
        href: id(r, "invoice_id") ? `/admin/invoices/${id(r, "invoice_id")}` : "/admin/invoices",
      };
    },
  },
  {
    key: "revenue_events",
    module: "finance",
    label: "Revenue booked",
    table: "revenue_events",
    timeCol: "occurred_at",
    select: "id, lead_id, occurred_at, kind, category, description, amount_cents",
    map: (r) => {
      const cents = num(r.amount_cents);
      return {
        title: `${cents === null ? "Revenue" : dollars(cents)} booked: ${words(r.category)}`,
        subtitle: clip(str(r.description)) ?? str(r.kind),
        href: id(r, "lead_id") ? `/admin/leads/${id(r, "lead_id")}` : "/admin/finance",
      };
    },
  },

  // ── Marketing ──
  {
    key: "social_activity_events",
    module: "marketing",
    label: "Social activity",
    table: "social_activity_events",
    timeCol: "created_at",
    select: "id, event_type, platform, detail, created_at",
    map: (r) => {
      const type = str(r.event_type) ?? "";
      const platform = str(r.platform)?.split(",").join(", ") ?? null;
      const title = SOCIAL_TITLES[type] ?? sentence(words(type));
      return {
        title: platform ? `${title} (${platform})` : title,
        subtitle: clip(str(r.detail)),
        href: "/admin/marketing/social",
      };
    },
  },
  {
    key: "email_campaign_events",
    module: "marketing",
    label: "Email campaign timelines",
    table: "email_campaign_events",
    timeCol: "created_at",
    select: "id, campaign_id, kind, body, actor, created_at",
    map: (r) => ({
      title: clip(str(r.body)) ?? `Email campaign ${words(r.kind)}`,
      subtitle: joinParts("Email marketing", str(r.actor)),
      href: id(r, "campaign_id")
        ? `/admin/marketing/email/campaigns/${id(r, "campaign_id")}`
        : "/admin/marketing/email",
    }),
  },
  {
    key: "seo_sync_runs",
    module: "marketing",
    label: "Search data syncs",
    table: "seo_sync_runs",
    timeCol: "started_at",
    select: "id, source, trigger, actor, started_at, ok, rows, error",
    map: (r) => {
      const source = str(r.source) === "search_console" ? "Search Console" : sentence(words(r.source));
      const rows = num(r.rows);
      return {
        title:
          r.ok === true
            ? `${source} sync finished${rows === null ? "" : `: ${rows.toLocaleString("en-US")} rows`}`
            : r.ok === false
              ? `${source} sync failed`
              : `${source} sync started`,
        subtitle: clip(str(r.error)) ?? joinParts(str(r.trigger), str(r.actor)),
        href: "/admin/marketing/seo",
      };
    },
  },
  {
    key: "seo_audit_runs",
    module: "marketing",
    label: "SEO audits",
    table: "seo_audit_runs",
    timeCol: "started_at",
    select: "id, started_at, status, pages_checked, issues_found, error, actor",
    map: (r) => {
      const status = str(r.status) ?? "";
      const pages = num(r.pages_checked);
      const issues = num(r.issues_found);
      return {
        title:
          status === "complete" && pages !== null && issues !== null
            ? `SEO audit finished: ${pages} pages, ${issues} issue${issues === 1 ? "" : "s"}`
            : `SEO audit ${words(status)}`,
        subtitle: clip(str(r.error)) ?? str(r.actor),
        href: "/admin/marketing/seo",
      };
    },
  },
  {
    key: "brand_activity",
    module: "marketing",
    label: "Brand asset changes",
    table: "brand_activity",
    timeCol: "created_at",
    select: "id, action, detail, actor_email, created_at",
    map: (r) => ({
      title: clip(str(r.detail)) ?? sentence(words(r.action)),
      subtitle: joinParts("Brand", str(r.actor_email)),
      href: "/admin/marketing/brand",
    }),
  },

  // ── Services ──
  {
    key: "service_events",
    module: "services",
    label: "Service catalog changes",
    table: "service_events",
    timeCol: "created_at",
    select: "id, service_id, event_type, body, actor, created_at",
    map: (r) => ({
      title: clip(str(r.body)) ?? `Service ${words(r.event_type)}`,
      subtitle: str(r.actor),
      href: id(r, "service_id") ? `/admin/services/${id(r, "service_id")}` : "/admin/services",
    }),
  },

  // ── Apps ──
  {
    key: "app_report_events",
    module: "apps",
    label: "App reports (signups, orders, feedback)",
    table: "app_report_events",
    timeCol: "occurred_at",
    select: "id, app_id, kind, occurred_at, summary, amount_cents, apps(name)",
    map: (r) => {
      const cents = num(r.amount_cents);
      const summary = clip(str(r.summary)) ?? `New ${words(r.kind)}`;
      return {
        title: cents ? `${summary} (${dollars(cents)})` : summary,
        subtitle: rel(r, "apps", "name"),
        href: id(r, "app_id") ? `/admin/apps/${id(r, "app_id")}` : "/admin/apps",
      };
    },
  },
  {
    key: "app_events",
    module: "apps",
    label: "App timelines",
    table: "app_events",
    timeCol: "created_at",
    select: "id, app_id, kind, body, actor, created_at, apps(name)",
    map: (r) => ({
      title: clip(str(r.body)) ?? `App ${words(r.kind)}`,
      subtitle: joinParts(rel(r, "apps", "name"), str(r.actor)),
      href: id(r, "app_id") ? `/admin/apps/${id(r, "app_id")}` : "/admin/apps",
    }),
  },
  {
    key: "software_events",
    module: "apps",
    label: "Software product timelines",
    table: "software_events",
    timeCol: "created_at",
    select: "id, software_id, kind, body, actor, created_at, software_products(name)",
    map: (r) => ({
      title: clip(str(r.body)) ?? `Software ${words(r.kind)}`,
      subtitle: joinParts(rel(r, "software_products", "name"), str(r.actor)),
      href: id(r, "software_id") ? `/admin/software/${id(r, "software_id")}` : "/admin/software",
    }),
  },

  // ── Websites ──
  {
    key: "website_deployments",
    module: "websites",
    label: "Website deployments",
    table: "website_deployments",
    timeCol: "deployed_at",
    select: "id, website_id, environment, status, commit_message, deployed_at, websites(name)",
    quiet: true,
    map: (r) => {
      const site = rel(r, "websites", "name") ?? "Website";
      const env = str(r.environment) ?? "production";
      const status = str(r.status) ?? "";
      return {
        title:
          status === "success"
            ? `${site} deployed to ${env}`
            : `${site} deploy to ${env}: ${words(status || "unknown")}`,
        subtitle: clip(str(r.commit_message)),
        href: "/admin/websites",
      };
    },
  },

  // ── AI & automations ──
  {
    key: "automation_runs",
    module: "ai",
    label: "Automation runs",
    table: "automation_runs",
    timeCol: "created_at",
    select: "id, automation_id, trigger_summary, status, mode, error_summary, created_at, automations(name)",
    map: (r) => {
      const name = rel(r, "automations", "name") ?? "Automation";
      const status = str(r.status) ?? "";
      const test = str(r.mode) && str(r.mode) !== "live" ? ` (${words(r.mode)})` : "";
      return {
        title:
          status === "success"
            ? `${name} ran${test}`
            : `${name}: ${words(status || "unknown")}${test}`,
        subtitle: clip(str(r.error_summary)) ?? clip(str(r.trigger_summary)),
        href: id(r, "automation_id") ? `/admin/automations/${id(r, "automation_id")}` : "/admin/automations",
      };
    },
  },
  {
    key: "automation_activity_events",
    module: "ai",
    label: "Automation changes",
    table: "automation_activity_events",
    timeCol: "created_at",
    select: "id, automation_id, event_type, body, actor, created_at",
    map: (r) => ({
      title: clip(str(r.body)) ?? `Automation ${words(r.event_type)}`,
      subtitle: str(r.actor),
      href: id(r, "automation_id") ? `/admin/automations/${id(r, "automation_id")}` : "/admin/automations",
    }),
  },
  {
    key: "workflow_activity_events",
    module: "ai",
    label: "Workflow activity",
    table: "workflow_activity_events",
    timeCol: "created_at",
    select: "id, workflow_id, event_type, body, actor, created_at",
    map: (r) => ({
      title: clip(str(r.body)) ?? `Workflow ${words(r.event_type)}`,
      subtitle: str(r.actor),
      href: id(r, "workflow_id")
        ? `/admin/automations/workflows/${id(r, "workflow_id")}`
        : "/admin/automations/workflows",
    }),
  },
  {
    key: "ai_events",
    module: "ai",
    label: "AI solution timelines",
    table: "ai_events",
    timeCol: "created_at",
    select: "id, solution_id, kind, body, actor, created_at",
    map: (r) => ({
      title: clip(str(r.body)) ?? `AI solution ${words(r.kind)}`,
      subtitle: str(r.actor),
      href: id(r, "solution_id") ? `/admin/ai-solutions/${id(r, "solution_id")}` : "/admin/ai-solutions",
    }),
  },

  // ── Tasks ──
  {
    key: "tasks_done",
    module: "tasks",
    label: "Completed tasks",
    table: "tasks",
    timeCol: "done_at",
    select: "id, title, done_at, lead_id, job_id",
    where: [["done", true]],
    map: (r) => ({
      title: `Task done: ${str(r.title) ?? "untitled"}`,
      subtitle: null,
      href: id(r, "lead_id")
        ? `/admin/leads/${id(r, "lead_id")}`
        : id(r, "job_id")
          ? `/admin/jobs/${id(r, "job_id")}`
          : "/admin/tasks",
    }),
  },
  {
    key: "task_events",
    module: "tasks",
    label: "Task history",
    table: "task_events",
    timeCol: "created_at",
    select: "id, task_id, event_type, body, actor, created_at, tasks(title)",
    map: (r) => ({
      title: `Task ${words(r.event_type)}`,
      subtitle: joinParts(rel(r, "tasks", "title"), clip(str(r.body))),
      href: "/admin/tasks",
    }),
  },
];

/**
 * The logs a filter reads. "All" leaves out the quiet ones, because 400
 * deploys would bury the nine leads; picking their module brings them in.
 */
export function sourcesFor(module: ActivityFilters["module"]): SourceSpec[] {
  return module === "all"
    ? SOURCES.filter((s) => !s.quiet)
    : SOURCES.filter((s) => s.module === module);
}

/** One database row → one line on the page, or null if it has no usable time. */
export function toEntry(spec: SourceSpec, row: Row): ActivityEntry | null {
  const at = str(row[spec.timeCol]);
  const rowId = str(row.id);
  if (!at || !rowId || Number.isNaN(Date.parse(at))) return null;
  const line = spec.map(row);
  if (!line) return null;
  return { ...line, id: `${spec.key}:${rowId}`, module: spec.module, source: spec.key, at };
}

/**
 * Newest first, trimmed to the limit.
 *
 * Each log was asked for its own newest `limit` rows, so the newest `limit`
 * of the merge is exact. There is more to load when the merge overflowed, or
 * when any one log came back full (it may be holding older rows back).
 */
export function mergeEntries(
  lists: ActivityEntry[][],
  limit: number
): { items: ActivityEntry[]; hasMore: boolean } {
  const all = lists.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  const hasMore = all.length > limit || lists.some((list) => list.length >= limit);
  return { items: all.slice(0, limit), hasMore };
}

export type DayGroup = { day: string; label: string; items: ActivityEntry[] };

/** Splits the feed into Chicago calendar days: Today, Yesterday, then dates. */
export function groupByDay(items: ActivityEntry[], now: Date = new Date()): DayGroup[] {
  const today = chicagoDate(now);
  const yesterday = shiftDay(today, -1);
  const groups: DayGroup[] = [];

  for (const item of items) {
    const day = chicagoDate(new Date(item.at));
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(item);
      continue;
    }
    const [y, m, d] = day.split("-").map(Number);
    const label =
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
              timeZone: "UTC",
              weekday: "short",
              month: "short",
              day: "numeric",
              ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
            });
    groups.push({ day, label, items: [item] });
  }
  return groups;
}
