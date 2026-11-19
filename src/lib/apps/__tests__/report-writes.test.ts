import { expect, test } from "vitest";
import fixture from "../__fixtures__/report.held.json";
import { METRIC_KEYS, parseReport, type AppReport, type ReportMetrics } from "../report-contract";
import { chicagoDay, classifyResponse, planWrites } from "../report-writes";

function report(metrics: Partial<ReportMetrics> = {}): AppReport {
  const parsed = parseReport(fixture);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...parsed.report, metrics: { ...parsed.report.metrics, ...metrics } };
}

test("chicagoDay uses Central time, not UTC", () => {
  expect(chicagoDay(new Date("2026-11-19T03:30:00Z"))).toBe("2026-11-18");
  expect(chicagoDay(new Date("2026-11-19T07:30:00Z"))).toBe("2026-11-19");
});

test.each<[number, string | null, string | null]>([
  [200, "application/json; charset=utf-8", null],
  [200, "text/html", "page"],
  [200, null, "page"],
  [307, null, "redirect"],
  [302, "text/html", "redirect"],
  [401, "application/json", "key"],
  [403, "application/json", "key"],
  [404, "text/html", "not found"],
  [503, "application/json", "not set up"],
  [500, "text/plain", "500"],
])("classifyResponse %i %s", (status, type, needle) => {
  const out = classifyResponse(status, type);
  if (needle === null) expect(out).toBeNull();
  else expect(out).toContain(needle);
});

test("planWrites keeps null metrics null and maps every metric key", () => {
  const w = planWrites("app-1", report({ active_7d: null }), new Date("2026-11-18T15:00:00Z"));
  expect(w.dailyRow.active_7d).toBeNull();
  for (const k of METRIC_KEYS) expect(k in w.dailyRow).toBe(true);
  expect(w.dailyRow.day).toBe("2026-11-18");
  expect(w.dailyRow.app_id).toBe("app-1");
  expect(w.dailyRow.mrr_cents).toBe(12389);
});

test("planWrites carries event ids", () => {
  const w = planWrites("app-1", report(), new Date("2026-11-18T15:00:00Z"));
  expect(w.eventRows.map((e) => e.external_id)).toEqual(report().events.map((e) => e.id));
});

// A product reports on its own pipelines, and that stays inside the stored
// report. It is NOT copied into app_health_checks: the app health score keeps
// only the newest row per check type, so an hourly "integration" row from a
// report would overwrite the result of this system's own integration check,
// hiding a real warning or marking an app failing on the product's say-so.
test("planWrites writes nothing into the app health checks", () => {
  const w = planWrites("app-1", report(), new Date("2026-11-18T15:00:00Z"));
  expect("healthRows" in w).toBe(false);
  expect((w.reportRow.payload as { health: unknown[] }).health.length).toBe(2);
});

test("planWrites stamps the report row with when we pulled it", () => {
  const pulled = new Date("2026-11-18T15:00:00Z");
  const w = planWrites("app-1", report(), pulled);
  expect(w.reportRow.pulled_at).toBe(pulled.toISOString());
  expect(w.reportRow.generated_at).toBe("2026-11-18T15:00:02.000Z");
  expect(w.reportRow.contract).toBe("ttai.app-report/v1");
});
