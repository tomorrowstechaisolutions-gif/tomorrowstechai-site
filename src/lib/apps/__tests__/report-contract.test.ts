import { expect, test } from "vitest";
import fixture from "../__fixtures__/report.held.json";
import { METRIC_KEYS, parseReport } from "../report-contract";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const clone = () => structuredClone(fixture) as Loose;

test("accepts the fixture", () => {
  const r = parseReport(fixture);
  expect(r.ok).toBe(true);
});

test("keeps null metrics as null", () => {
  const p = clone();
  p.metrics.active_7d = null;
  const r = parseReport(p);
  expect(r.ok && r.report.metrics.active_7d).toBeNull();
});

test.each<[string, (p: Loose) => void | null, string]>([
  ["wrong contract", (p) => { p.contract = "ttai.app-report/v2"; }, "contract"],
  ["missing metric key", (p) => { delete p.metrics.mrr_cents; }, "mrr_cents"],
  ["string metric", (p) => { p.metrics.users_total = "12"; }, "users_total"],
  ["negative metric", (p) => { p.metrics.paid_total = -1; }, "paid_total"],
  ["fractional metric", (p) => { p.metrics.mrr_cents = 9.5; }, "mrr_cents"],
  ["NaN metric", (p) => { p.metrics.mrr_cents = Number.NaN; }, "mrr_cents"],
  ["bad health word", (p) => { p.health[0].status = "ok"; }, "health"],
  ["bad event kind", (p) => { p.events[0].kind = "refund"; }, "events"],
  ["bad date", (p) => { p.generated_at = "yesterday"; }, "generated_at"],
  ["missing app", (p) => { p.app = ""; }, "app"],
  ["livemode not boolean", (p) => { p.livemode = "yes"; }, "livemode"],
  ["not an object", () => null, "report"],
])("rejects %s", (_name, mutate, field) => {
  const p = clone();
  const out = mutate(p);
  const r = parseReport(out === null ? "<html>" : p);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(field);
});

test("truncates summary to 140 and caps events at 50", () => {
  const p = clone();
  p.events = Array.from({ length: 80 }, (_, i) => ({ ...p.events[0], id: `e${i}`, summary: "x".repeat(5000) }));
  const r = parseReport(p);
  expect(r.ok && r.report.events.length).toBe(50);
  expect(r.ok && r.report.events[0].summary.length).toBe(140);
});

test("drops unknown top-level and metric keys instead of failing", () => {
  const p = clone();
  p.future_field = 1;
  p.metrics.future_metric = 5;
  const r = parseReport(p);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(Object.keys(r.report.metrics).sort()).toEqual([...METRIC_KEYS].sort());
    expect("future_field" in r.report).toBe(false);
  }
});

test("extra, health and events default to empty lists", () => {
  const p = clone();
  delete p.extra;
  delete p.health;
  delete p.events;
  const r = parseReport(p);
  expect(r.ok && [r.report.extra, r.report.health, r.report.events]).toEqual([[], [], []]);
});

test("lowercases the currency", () => {
  const p = clone();
  p.currency = "USD";
  const r = parseReport(p);
  expect(r.ok && r.report.currency).toBe("usd");
});

// Produced by Storyborn's own buildReport() (storyforgeai repo,
// src/lib/portfolio/report.ts). If that product's output ever stops being a
// valid report, this is where it shows up first.
test("accepts a report built by Storyborn", async () => {
  const storyborn = (await import("../__fixtures__/report.storyborn.json")).default;
  const r = parseReport(storyborn);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.report.app).toBe("storyborn");
    expect(r.report.metrics.feedback_open).toBeNull();
    expect(r.report.metrics.mrr_cents).toBe(19100);
    expect(r.report.events.length).toBe(3);
  }
});

// Products that sell through reps and hire through a careers page report
// two more things worth seeing the moment they happen.
test("accepts lead and application events", () => {
  const p = clone();
  p.events = [
    { ...p.events[0], id: "lead:1", kind: "lead", summary: "New demo request", plan: null, amount_cents: null, url: null },
    { ...p.events[0], id: "application:1", kind: "application", summary: "New job application: splicer", plan: null, amount_cents: null, url: null },
  ];
  const r = parseReport(p);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.report.events.map((e) => e.kind)).toEqual(["lead", "application"]);
});

// Produced by SplicePoint's own buildReport() (splicepoint repo,
// lib/portfolio/report-shape.ts). Its money comes from its own deals and
// payments ledger, and the states it does not track arrive as null.
test("accepts a report built by SplicePoint", async () => {
  const splicepoint = (await import("../__fixtures__/report.splicepoint.json")).default;
  const r = parseReport(splicepoint);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.report.app).toBe("splicepoint");
    expect(r.report.metrics.users_total).toBe(42);
    expect(r.report.metrics.paid_total).toBe(2);
    expect(r.report.metrics.mrr_cents).toBe(89600);
    expect(r.report.metrics.collected_30d_cents).toBe(180000);
    expect(r.report.metrics.trialing).toBeNull();
    expect(r.report.extra.find((e) => e.key === "commissions_owed")?.unit).toBe("cents");
    expect([...new Set(r.report.events.map((e) => e.kind))].sort()).toEqual(
      ["application", "cancel", "feedback", "lead", "signup", "upgrade"]);
  }
});
