import { describe, expect, it } from "vitest";
import {
  MAX_LIMIT,
  MODULES,
  PAGE_SIZE,
  SOURCES,
  dollars,
  filtersHref,
  groupByDay,
  isIsoDay,
  mergeEntries,
  parseFilters,
  rel,
  resolveWindow,
  shiftDay,
  sourcesFor,
  toEntry,
  type ActivityEntry,
  type SourceSpec,
} from "../core";

const source = (key: string): SourceSpec => {
  const spec = SOURCES.find((s) => s.key === key);
  if (!spec) throw new Error(`no source ${key}`);
  return spec;
};

const entry = (id: string, at: string, module: ActivityEntry["module"] = "leads"): ActivityEntry => ({
  id,
  at,
  module,
  source: "test",
  title: id,
  subtitle: null,
  href: "/admin",
});

// 2026-11-19 15:00 in Chicago (CST, UTC-6).
const NOW = new Date("2026-11-19T21:00:00Z");

describe("parseFilters", () => {
  it("defaults to every module, 30 days, one page", () => {
    expect(parseFilters({})).toEqual({ module: "all", range: "30d", from: null, to: null, limit: PAGE_SIZE });
  });

  it("reads a module and a preset range", () => {
    const f = parseFilters({ module: "finance", range: "7d" });
    expect(f.module).toBe("finance");
    expect(f.range).toBe("7d");
  });

  it("falls back instead of failing on junk", () => {
    const f = parseFilters({ module: "nonsense", range: "forever", limit: "abc" });
    expect(f).toEqual({ module: "all", range: "30d", from: null, to: null, limit: PAGE_SIZE });
  });

  it("treats dates in the link as a custom range", () => {
    const f = parseFilters({ from: "2026-11-01", to: "2026-11-10" });
    expect(f.range).toBe("custom");
    expect(f.from).toBe("2026-11-01");
    expect(f.to).toBe("2026-11-10");
  });

  it("swaps a backwards range rather than returning nothing", () => {
    const f = parseFilters({ range: "custom", from: "2026-11-10", to: "2026-11-01" });
    expect([f.from, f.to]).toEqual(["2026-11-01", "2026-11-10"]);
  });

  it("drops dates when a preset range is chosen", () => {
    const f = parseFilters({ range: "today", from: "2026-11-01" });
    expect(f).toMatchObject({ range: "today", from: null, to: null });
  });

  it("ignores custom with no usable date", () => {
    expect(parseFilters({ range: "custom", from: "2026-02-31" }).range).toBe("30d");
  });

  it("rounds the limit up to whole pages and caps it", () => {
    expect(parseFilters({ limit: "150" }).limit).toBe(200);
    expect(parseFilters({ limit: "5" }).limit).toBe(PAGE_SIZE);
    expect(parseFilters({ limit: "999999" }).limit).toBe(MAX_LIMIT);
  });

  it("takes the first value when a key is repeated", () => {
    expect(parseFilters({ module: ["tasks", "finance"] }).module).toBe("tasks");
  });
});

describe("isIsoDay / shiftDay", () => {
  it("accepts real days only", () => {
    expect(isIsoDay("2026-11-19")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("11/19/2026")).toBe(false);
    expect(isIsoDay("")).toBe(false);
  });

  it("shifts across month and year ends", () => {
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("filtersHref", () => {
  const base = parseFilters({});

  it("keeps the default view a plain link", () => {
    expect(filtersHref(base)).toBe("/admin/activity");
  });

  it("round-trips through parseFilters", () => {
    const views = [
      { module: "marketing", range: "90d" },
      { module: "websites", range: "custom", from: "2026-11-01", to: "2026-11-10", limit: "300" },
      { range: "custom", from: "2026-11-01" },
      { range: "all" },
    ];
    for (const view of views) {
      const filters = parseFilters(view);
      const href = filtersHref(filters);
      const params = Object.fromEntries(new URL(href, "https://x.test").searchParams);
      expect(parseFilters(params)).toEqual(filters);
    }
  });

  it("applies a patch without losing the other filter", () => {
    const href = filtersHref(parseFilters({ module: "finance", range: "7d" }), { range: "all" });
    expect(href).toBe("/admin/activity?module=finance&range=all");
  });
});

describe("resolveWindow", () => {
  it("starts 'today' at Chicago midnight, not UTC midnight", () => {
    const w = resolveWindow(parseFilters({ range: "today" }), NOW);
    expect(w.fromIso).toBe("2026-11-19T06:00:00.000Z");
    expect(w.toIso).toBeNull();
  });

  it("uses the Chicago day even when UTC has already rolled over", () => {
    // 03:00 UTC on the 20th is still 21:00 on the 19th in Chicago.
    const w = resolveWindow(parseFilters({ range: "today" }), new Date("2026-11-20T03:00:00Z"));
    expect(w.fromIso).toBe("2026-11-19T06:00:00.000Z");
  });

  it("counts 7 days as today plus the six before it", () => {
    const w = resolveWindow(parseFilters({ range: "7d" }), NOW);
    expect(w.fromIso).toBe("2026-11-13T06:00:00.000Z");
  });

  it("crosses the daylight-saving change correctly", () => {
    // 30 days back from Nov 19 is Oct 21, which is still CDT (UTC-5).
    const w = resolveWindow(parseFilters({ range: "30d" }), NOW);
    expect(w.fromIso).toBe("2026-10-21T05:00:00.000Z");
  });

  it("leaves 'all time' unbounded", () => {
    const w = resolveWindow(parseFilters({ range: "all" }), NOW);
    expect([w.fromIso, w.toIso]).toEqual([null, null]);
  });

  it("makes a custom end day inclusive", () => {
    const w = resolveWindow(parseFilters({ from: "2026-11-10", to: "2026-11-10" }), NOW);
    expect(w.fromIso).toBe("2026-11-10T06:00:00.000Z");
    expect(w.toIso).toBe("2026-11-11T06:00:00.000Z");
    expect(w.label).toBe("Nov 10, 2026");
  });

  it("allows an open-ended custom range", () => {
    const w = resolveWindow(parseFilters({ range: "custom", to: "2026-09-30" }), NOW);
    expect(w.fromIso).toBeNull();
    expect(w.toIso).toBe("2026-10-01T05:00:00.000Z");
    expect(w.label).toBe("up to Sep 30, 2026");
  });
});

describe("sources", () => {
  it("gives every module at least one log, and every log a real module", () => {
    const keys = new Set(MODULES.map((m) => m.key));
    for (const m of MODULES) expect(sourcesFor(m.key).length).toBeGreaterThan(0);
    for (const s of SOURCES) expect(keys.has(s.module)).toBe(true);
  });

  it("has no duplicate keys", () => {
    expect(new Set(SOURCES.map((s) => s.key)).size).toBe(SOURCES.length);
  });

  it("selects the time column it sorts by", () => {
    for (const s of SOURCES) expect(s.select.split(/,\s*/)).toContain(s.timeCol);
  });

  it("keeps deployments out of 'all' but in Websites", () => {
    expect(sourcesFor("all").some((s) => s.key === "website_deployments")).toBe(false);
    expect(sourcesFor("websites").map((s) => s.key)).toEqual(["website_deployments"]);
  });
});

describe("toEntry", () => {
  it("skips a row with no time or no id", () => {
    const spec = source("lead_events");
    expect(toEntry(spec, { id: "1", created_at: null, type: "note" })).toBeNull();
    expect(toEntry(spec, { created_at: "2026-11-19T10:00:00Z", type: "note" })).toBeNull();
    expect(toEntry(spec, { id: "1", created_at: "not a date", type: "note" })).toBeNull();
  });

  it("names a lead event and links to the lead", () => {
    const e = toEntry(source("lead_events"), {
      id: "e1",
      lead_id: "L1",
      created_at: "2026-11-19T10:00:00Z",
      type: "form_submit",
      body: "Asked about a website",
      leads: { business_name: "Acme Roofing" },
    });
    expect(e).toMatchObject({
      id: "lead_events:e1",
      module: "leads",
      title: "New lead received",
      subtitle: "Acme Roofing · Asked about a website",
      href: "/admin/leads/L1",
    });
  });

  it("falls back to a generic title for an event type it has not seen", () => {
    const e = toEntry(source("lead_events"), { id: "e2", created_at: "2026-11-19T10:00:00Z", type: "brand_new" });
    expect(e?.title).toBe("Lead activity");
    expect(e?.href).toBe("/admin/leads");
  });

  it("writes an invoice line with its number", () => {
    const e = toEntry(source("invoice_events"), {
      id: "i1",
      invoice_id: "INV",
      event_type: "resent",
      body: "Emailed to client@example.com.",
      created_at: "2026-11-19T10:00:00Z",
      invoices: [{ invoice_number: "INV-2026-0003", title: "Website build" }],
    });
    expect(e?.title).toBe("Invoice INV-2026-0003 sent again");
    expect(e?.subtitle).toBe("Emailed to client@example.com.");
    expect(e?.href).toBe("/admin/invoices/INV");
  });

  it("says a failed sync failed, and shows why", () => {
    const e = toEntry(source("seo_sync_runs"), {
      id: "s1",
      source: "search_console",
      started_at: "2026-11-19T10:00:00Z",
      ok: false,
      rows: null,
      error: "Token expired",
    });
    expect(e?.title).toBe("Search Console sync failed");
    expect(e?.subtitle).toBe("Token expired");
  });

  it("does not call an unfinished sync a success or a failure", () => {
    const e = toEntry(source("seo_sync_runs"), {
      id: "s2",
      source: "search_console",
      started_at: "2026-11-19T10:00:00Z",
      ok: null,
    });
    expect(e?.title).toBe("Search Console sync started");
  });

  it("flags a failed social publish", () => {
    const e = toEntry(source("social_activity_events"), {
      id: "p1",
      event_type: "publish_failed",
      platform: "x",
      detail: "X /tweets failed (HTTP 402)",
      created_at: "2026-11-19T10:00:00Z",
    });
    expect(e?.title).toBe("Post failed to publish (x)");
  });

  it("uses only the first line of a commit message", () => {
    const e = toEntry(source("website_deployments"), {
      id: "d1",
      environment: "production",
      status: "success",
      commit_message: "Fix the header\n\nCo-Authored-By: someone",
      deployed_at: "2026-11-19T10:00:00Z",
      websites: { name: "ROMAR Press" },
    });
    expect(e?.title).toBe("ROMAR Press deployed to production");
    expect(e?.subtitle).toBe("Fix the header");
  });

  it("does not report a failed deploy as deployed", () => {
    const e = toEntry(source("website_deployments"), {
      id: "d2",
      environment: "production",
      status: "error",
      deployed_at: "2026-11-19T10:00:00Z",
    });
    expect(e?.title).toBe("Website deploy to production: error");
  });

  it("marks a non-live automation run", () => {
    const e = toEntry(source("automation_runs"), {
      id: "r1",
      automation_id: "A1",
      status: "failed",
      mode: "test",
      error_summary: "No recipient",
      created_at: "2026-11-19T10:00:00Z",
      automations: { name: "Lead follow-up" },
    });
    expect(e?.title).toBe("Lead follow-up: failed (test)");
    expect(e?.subtitle).toBe("No recipient");
  });

  it("adds the amount to an app order", () => {
    const e = toEntry(source("app_report_events"), {
      id: "o1",
      app_id: "APP",
      kind: "order",
      summary: "New order: digital book",
      amount_cents: 2600,
      occurred_at: "2026-11-19T10:00:00Z",
      apps: { name: "ROMAR Press" },
    });
    expect(e?.title).toBe("New order: digital book ($26)");
    expect(e?.subtitle).toBe("ROMAR Press");
  });
});

describe("rel / dollars", () => {
  it("reads a join returned as an object or as an array", () => {
    expect(rel({ apps: { name: "A" } }, "apps", "name")).toBe("A");
    expect(rel({ apps: [{ name: "B" }] }, "apps", "name")).toBe("B");
    expect(rel({ apps: null }, "apps", "name")).toBeNull();
    expect(rel({}, "apps", "name")).toBeNull();
  });

  it("shows cents only when there are some", () => {
    expect(dollars(2600)).toBe("$26");
    expect(dollars(2650)).toBe("$26.50");
    expect(dollars(123456700)).toBe("$1,234,567");
  });
});

describe("mergeEntries", () => {
  it("sorts newest first across logs", () => {
    const { items } = mergeEntries(
      [
        [entry("a", "2026-11-19T10:00:00Z"), entry("c", "2026-11-17T10:00:00Z")],
        [entry("b", "2026-11-18T10:00:00Z")],
      ],
      10
    );
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("compares instants, not strings, when offsets differ", () => {
    const { items } = mergeEntries(
      [[entry("utc", "2026-11-19T10:00:00+00:00")], [entry("later", "2026-11-19T06:30:00-05:00")]],
      10
    );
    expect(items.map((i) => i.id)).toEqual(["later", "utc"]);
  });

  it("trims to the limit and says there is more", () => {
    const list = [1, 2, 3].map((n) => entry(`e${n}`, `2026-11-1${n}T10:00:00Z`));
    const merged = mergeEntries([list], 2);
    expect(merged.items).toHaveLength(2);
    expect(merged.hasMore).toBe(true);
  });

  it("says there is more when one log came back full", () => {
    const full = [entry("a", "2026-11-19T10:00:00Z"), entry("b", "2026-11-18T10:00:00Z")];
    expect(mergeEntries([full], 2).hasMore).toBe(true);
  });

  it("says there is no more when everything fit", () => {
    expect(mergeEntries([[entry("a", "2026-11-19T10:00:00Z")], []], 2).hasMore).toBe(false);
    expect(mergeEntries([], 2)).toEqual({ items: [], hasMore: false });
  });
});

describe("groupByDay", () => {
  it("groups by Chicago day and labels today and yesterday", () => {
    const groups = groupByDay(
      [
        entry("today", "2026-11-19T20:00:00Z"),
        // 04:00 UTC on the 19th is 22:00 on the 18th in Chicago.
        entry("late-yesterday", "2026-11-19T04:00:00Z"),
        entry("yesterday", "2026-11-18T15:00:00Z"),
        entry("older", "2026-11-10T15:00:00Z"),
      ],
      NOW
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 2],
      ["Tue, Nov 10", 1],
    ]);
  });

  it("adds the year for an earlier year", () => {
    const [group] = groupByDay([entry("old", "2025-12-25T15:00:00Z")], NOW);
    expect(group.label).toBe("Thu, Dec 25, 2025");
  });

  it("returns nothing for nothing", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
