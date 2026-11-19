import { METRIC_KEYS, type AppReport } from "./report-contract";

/**
 * The pure half of pulling a report: what an HTTP answer means, and which
 * rows a valid report turns into. No database and no network in here, so
 * every decision in it is tested directly.
 */

/**
 * The calendar day a pull belongs to, in Central time. The daily rollup is
 * keyed on this so "today" on the trend is the day John is actually in, not
 * the UTC day that rolls over at 6 or 7 in the evening.
 */
export function chicagoDay(at: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Reads the status line of a product's answer before anything tries to parse
 * the body. Returns null when it looks like a report, otherwise the reason
 * in words a person can act on.
 *
 * The redirect and HTML cases matter more than they look: a product whose
 * session middleware does not know about the report route answers a machine
 * with a redirect to its sign-in page. Following that would fetch a login
 * page with a 200, and "200 OK" is exactly how that failure stays invisible.
 * The pull uses redirect: "manual" so it lands here instead.
 */
export function classifyResponse(status: number, contentType: string | null): string | null {
  if (status >= 300 && status < 400) {
    return "The product answered with a redirect, usually to its sign-in page. Its report route is not open to machine callers yet.";
  }
  if (status === 401 || status === 403) {
    return "The product rejected the key. Check that the key set here matches TTAI_REPORT_KEY in the product.";
  }
  if (status === 404) {
    return "The report address was not found. The product has not deployed its report endpoint yet.";
  }
  if (status === 503) {
    return "The product's report is not set up yet: TTAI_REPORT_KEY is missing on its side.";
  }
  if (status < 200 || status >= 300) {
    return `The product's report answered ${status}.`;
  }
  if (!contentType || !contentType.toLowerCase().includes("json")) {
    return "The product answered with a page instead of a report.";
  }
  return null;
}

export type ReportWrites = {
  reportRow: Record<string, unknown>;
  dailyRow: Record<string, unknown>;
  eventRows: Record<string, unknown>[];
  healthRows: Record<string, unknown>[];
};

/** The rows one valid report becomes. Nulls stay null all the way through. */
export function planWrites(appId: string, report: AppReport, pulledAt: Date): ReportWrites {
  const pulledIso = pulledAt.toISOString();

  const dailyRow: Record<string, unknown> = {
    app_id: appId,
    day: chicagoDay(pulledAt),
    extra: report.extra,
    livemode: report.livemode,
    currency: report.currency,
    updated_at: pulledIso,
  };
  for (const key of METRIC_KEYS) dailyRow[key] = report.metrics[key];

  return {
    reportRow: {
      app_id: appId,
      pulled_at: pulledIso,
      generated_at: report.generated_at,
      contract: report.contract,
      livemode: report.livemode,
      currency: report.currency,
      payload: report,
    },
    dailyRow,
    eventRows: report.events.map((event) => ({
      app_id: appId,
      external_id: event.id,
      kind: event.kind,
      occurred_at: event.at,
      summary: event.summary,
      plan: event.plan,
      amount_cents: event.amount_cents,
      url: event.url,
    })),
    // The product's own pipelines, as the product reports them. The target
    // prefix is how these rows are told apart from the checks this system
    // runs itself, both on the Health tab and when pruning.
    healthRows: report.health.map((entry) => ({
      app_id: appId,
      check_type: "integration",
      target: `report:${entry.key}`,
      status: entry.status,
      message: entry.message ? `${entry.label}: ${entry.message}` : entry.label,
      checked_at: pulledIso,
    })),
  };
}
