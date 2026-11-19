/**
 * The app-report contract: what a product (Held, Storyborn, the next one)
 * tells this admin center about itself.
 *
 * A product exposes GET /api/portfolio/report behind its own key and answers
 * with this shape. Each product owns the MEANING of its numbers; this file
 * only decides whether what arrived is a report at all.
 *
 * Two rules everything downstream relies on:
 *
 *   1. null means "this product does not measure this". It is never turned
 *      into 0 here or anywhere else, because a zero is a claim and a null is
 *      an admission, and the screens show them differently.
 *   2. A report is accepted whole or rejected whole. A half-valid payload is
 *      not stored with the bad parts quietly dropped: the first field that
 *      fails is named in the error and the previous good report stays up.
 *
 * Unknown keys are ignored rather than rejected, so a product can add a
 * field without breaking an admin center that has not learned it yet.
 *
 * No imports, on purpose: this is the one file the tests and both sides of
 * the pull depend on, and it should be readable in one sitting.
 */

export const REPORT_CONTRACT = "ttai.app-report/v1";

export const METRIC_KEYS = [
  "users_total", "users_new_24h", "users_new_7d", "users_new_30d",
  "active_7d", "active_30d",
  "paid_total", "trialing", "past_due", "canceling",
  "mrr_cents", "collected_30d_cents",
  "feedback_open", "ai_cost_30d_cents",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];
export type ReportMetrics = Record<MetricKey, number | null>;

export type ReportExtra = {
  key: string;
  label: string;
  value: number;
  unit: "count" | "cents" | "percent";
};

export type ReportHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type ReportHealth = {
  key: string;
  label: string;
  status: ReportHealthStatus;
  message: string | null;
  checked_at: string;
};

export const REPORT_EVENT_KINDS = [
  "signup", "upgrade", "downgrade", "cancel", "payment_failed", "feedback",
  // A sales enquiry (demo request, early-access request, a rep's new lead)
  // and a job or partner application. Products sold through reps and staffed
  // through a careers page report these as they happen.
  "lead", "application",
  // A store sells one order at a time rather than a subscription, so its
  // feed is orders coming in and refunds going out. Same rule as every
  // other event: a kind, a time, an amount and a generic summary. Never who.
  "order", "refund",
] as const;
export type ReportEventKind = (typeof REPORT_EVENT_KINDS)[number];

export type ReportEvent = {
  id: string;
  kind: ReportEventKind;
  at: string;
  summary: string;
  plan: string | null;
  amount_cents: number | null;
  url: string | null;
};

export type AppReport = {
  contract: typeof REPORT_CONTRACT;
  app: string;
  generated_at: string;
  livemode: boolean;
  currency: string;
  metrics: ReportMetrics;
  extra: ReportExtra[];
  health: ReportHealth[];
  events: ReportEvent[];
};

export type ParseResult =
  | { ok: true; report: AppReport }
  | { ok: false; error: string };

const MAX_EVENTS = 50;
const MAX_EXTRA = 30;
const MAX_HEALTH = 30;
const MAX_SUMMARY = 140;
const MAX_LABEL = 80;
const MAX_MESSAGE = 300;
const MAX_URL = 500;

const UNITS = ["count", "cents", "percent"] as const;
const HEALTH_WORDS = ["healthy", "warning", "critical", "unknown"] as const;

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) fail(`${field} must be a non-empty string.`);
  return (value as string).trim().slice(0, max);
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(`${field} must be a string or null.`);
  const trimmed = (value as string).trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function date(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(`${field} must be an ISO date.`);
  return new Date(value as string).toISOString();
}

/** A count or a number of cents: a whole number that is not negative. */
function wholeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${field} must be a whole number that is not negative, or null.`);
  }
  return value as number;
}

function list(value: unknown, field: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${field} must be a list.`);
  return value as unknown[];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(`${field} must be one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

function parseMetrics(value: unknown): ReportMetrics {
  if (!isObject(value)) fail("metrics must be an object.");
  const source = value as Record<string, unknown>;
  const metrics = {} as ReportMetrics;
  for (const key of METRIC_KEYS) {
    if (!(key in source)) fail(`metrics.${key} is missing. Send null when it is not measured.`);
    const raw = source[key];
    metrics[key] = raw === null ? null : wholeNumber(raw, `metrics.${key}`);
  }
  return metrics;
}

function parseExtra(value: unknown): ReportExtra[] {
  return list(value, "extra").slice(0, MAX_EXTRA).map((entry, i) => {
    if (!isObject(entry)) fail(`extra[${i}] must be an object.`);
    const e = entry as Record<string, unknown>;
    return {
      key: text(e.key, `extra[${i}].key`, MAX_LABEL),
      label: text(e.label, `extra[${i}].label`, MAX_LABEL),
      value: wholeNumber(e.value, `extra[${i}].value`),
      unit: oneOf(e.unit, UNITS, `extra[${i}].unit`),
    };
  });
}

function parseHealth(value: unknown): ReportHealth[] {
  return list(value, "health").slice(0, MAX_HEALTH).map((entry, i) => {
    if (!isObject(entry)) fail(`health[${i}] must be an object.`);
    const h = entry as Record<string, unknown>;
    return {
      key: text(h.key, `health[${i}].key`, MAX_LABEL),
      label: text(h.label, `health[${i}].label`, MAX_LABEL),
      status: oneOf(h.status, HEALTH_WORDS, `health[${i}].status`),
      message: optionalText(h.message, `health[${i}].message`, MAX_MESSAGE),
      checked_at: date(h.checked_at, `health[${i}].checked_at`),
    };
  });
}

function parseEvents(value: unknown): ReportEvent[] {
  return list(value, "events").slice(0, MAX_EVENTS).map((entry, i) => {
    if (!isObject(entry)) fail(`events[${i}] must be an object.`);
    const e = entry as Record<string, unknown>;
    return {
      id: text(e.id, `events[${i}].id`, 200),
      kind: oneOf(e.kind, REPORT_EVENT_KINDS, `events[${i}].kind`),
      at: date(e.at, `events[${i}].at`),
      summary: text(e.summary, `events[${i}].summary`, MAX_SUMMARY),
      plan: optionalText(e.plan, `events[${i}].plan`, MAX_LABEL),
      amount_cents:
        e.amount_cents === null || e.amount_cents === undefined
          ? null
          : wholeNumber(e.amount_cents, `events[${i}].amount_cents`),
      url: optionalText(e.url, `events[${i}].url`, MAX_URL),
    };
  });
}

/**
 * Turns whatever a product answered with into a report, or says why not.
 * Never throws.
 */
export function parseReport(input: unknown): ParseResult {
  try {
    if (!isObject(input)) fail("The report must be a JSON object.");
    const source = input as Record<string, unknown>;

    if (source.contract !== REPORT_CONTRACT) {
      fail(`contract must be ${REPORT_CONTRACT}; this said ${JSON.stringify(source.contract ?? null).slice(0, 60)}.`);
    }
    if (typeof source.livemode !== "boolean") fail("livemode must be true or false.");

    return {
      ok: true,
      report: {
        contract: REPORT_CONTRACT,
        app: text(source.app, "app", MAX_LABEL).toLowerCase(),
        generated_at: date(source.generated_at, "generated_at"),
        livemode: source.livemode as boolean,
        currency: text(source.currency, "currency", 8).toLowerCase(),
        metrics: parseMetrics(source.metrics),
        extra: parseExtra(source.extra),
        health: parseHealth(source.health),
        events: parseEvents(source.events),
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    return { ok: false, error: "The report could not be read." };
  }
}
