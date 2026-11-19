import { expect, test } from "vitest";
import type { ReportMetrics } from "../report-contract";
import { isFresh, rollup, safeEventUrl, type LatestReport } from "../report-rollup";

const now = new Date("2026-11-18T18:00:00Z");

const ZERO: ReportMetrics = {
  users_total: 0, users_new_24h: 0, users_new_7d: 0, users_new_30d: 0,
  active_7d: 0, active_30d: 0, paid_total: 0, trialing: 0, past_due: 0, canceling: 0,
  mrr_cents: 0, collected_30d_cents: 0, feedback_open: 0, ai_cost_30d_cents: 0,
};

const r = (o: Partial<Omit<LatestReport, "metrics">> & { m?: Partial<ReportMetrics> } = {}): LatestReport => {
  const { m, ...rest } = o;
  return {
    appId: "a", slug: "held", name: "Held",
    pulledAt: "2026-11-18T17:30:00Z", livemode: true, currency: "usd",
    metrics: { ...ZERO, ...m },
    ...rest,
  };
};

test("isFresh is a 3 hour window on when we pulled", () => {
  expect(isFresh("2026-11-18T15:00:01Z", now)).toBe(true);
  expect(isFresh("2026-11-18T14:59:59Z", now)).toBe(false);
  expect(isFresh("not a date", now)).toBe(false);
});

test("sums fresh live USD reports", () => {
  const out = rollup(
    [
      r({ m: { mrr_cents: 1500, paid_total: 2, users_total: 10, users_new_24h: 1 } }),
      r({ m: { mrr_cents: 3900, paid_total: 1, users_total: 40, users_new_24h: 0 } }),
    ],
    2,
    now
  );
  expect(out).toEqual({ mrrCents: 5400, paid: 3, users: 50, new24h: 1, reporting: 2, of: 2 });
});

test("leaves out stale, test-mode and non-USD reports", () => {
  const out = rollup(
    [
      r({ m: { mrr_cents: 1500 } }),
      r({ pulledAt: "2026-11-18T14:59:00Z", m: { mrr_cents: 9999 } }),
      r({ livemode: false, m: { mrr_cents: 9999 } }),
      r({ currency: "eur", m: { mrr_cents: 9999 } }),
    ],
    4,
    now
  );
  expect(out.mrrCents).toBe(1500);
  expect(out.reporting).toBe(1);
  expect(out.of).toBe(4);
});

test("a total is null when no counted report measures it", () => {
  expect(rollup([r({ m: { mrr_cents: null } })], 1, now).mrrCents).toBeNull();
});

test("null in one app does not zero the other", () => {
  expect(rollup([r({ m: { mrr_cents: null } }), r({ m: { mrr_cents: 700 } })], 2, now).mrrCents).toBe(700);
});

test("no reports at all", () => {
  expect(rollup([], 0, now)).toEqual({ mrrCents: null, paid: null, users: null, new24h: null, reporting: 0, of: 0 });
});

test.each<[string | null, string[], string | null]>([
  ["https://myheldapp.com/admin/accounts/abc", ["myheldapp.com"], "https://myheldapp.com/admin/accounts/abc"],
  ["https://MyHeldApp.com/admin", ["myheldapp.com"], "https://myheldapp.com/admin"],
  ["https://www.myheldapp.com/x", ["myheldapp.com"], null],
  ["http://myheldapp.com/x", ["myheldapp.com"], null],
  ["javascript:alert(1)", ["myheldapp.com"], null],
  ["https://evil.example/myheldapp.com", ["myheldapp.com"], null],
  ["https://myheldapp.com.evil.example/x", ["myheldapp.com"], null],
  ["https://user:pw@myheldapp.com/x", ["myheldapp.com"], null],
  ["not a url", ["myheldapp.com"], null],
  ["https://myheldapp.com/x", [], null],
  [null, ["myheldapp.com"], null],
])("safeEventUrl %s", (url, hosts, expected) => {
  expect(safeEventUrl(url, hosts)).toBe(expected);
});
