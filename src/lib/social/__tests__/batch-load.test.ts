import { describe, expect, it } from "vitest";
import { batchPostId, type BatchPost, type SocialBatch } from "../batch";
import { pickAccounts, planLoad, splitExisting } from "../batch-load";

const post = (over: Partial<BatchPost> = {}): BatchPost => ({
  id: "d01",
  date: "2026-12-01",
  text: "A crew showed up and the permit was not pulled.",
  cardLine: "The permit was not pulled.",
  ...over,
});
const batch = (posts: BatchPost[]): SocialBatch => ({ slug: "2026-12", name: "December 2026", posts });

const acct = (id: string, platform: string, name: string, over: Partial<{ connected: boolean; status: string; posting_enabled: boolean; external_id: string | null }> = {}) => ({
  id, platform, display_name: name, handle: name, connected: true, status: "connected", posting_enabled: true, external_id: `ext-${id}`, ...over,
});

describe("pickAccounts", () => {
  it("picks the three brand accounts and ignores the rest", () => {
    const r = pickAccounts([
      acct("a1", "linkedin", "John C. Hockinson"),
      acct("a2", "facebook", "Tomorrows Tech AI Solutions"),
      acct("a3", "instagram", "@tomorrowstechai"),
      acct("a4", "facebook", "Held App"),
      acct("a5", "x", "John Hockinson | Tomorrow's Tech AI"),
      acct("a6", "instagram", "@tomorrowstek"),
    ]);
    expect(r).toEqual({ ok: true, accounts: { linkedin: "a1", facebook: "a2", instagram: "a3" } });
  });

  it("names an account that cannot post and one that is missing", () => {
    const r = pickAccounts([
      acct("a1", "linkedin", "John C. Hockinson"),
      acct("a2", "facebook", "Tomorrows Tech AI Solutions", { posting_enabled: false }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toHaveLength(2);
      expect(r.problems.join(" ")).toMatch(/facebook/i);
      expect(r.problems.join(" ")).toMatch(/instagram/i);
    }
  });

  it("treats a disconnected account as unable to post", () => {
    const r = pickAccounts([
      acct("a1", "linkedin", "John C. Hockinson", { status: "expired" }),
      acct("a2", "facebook", "Tomorrows Tech AI Solutions"),
      acct("a3", "instagram", "@tomorrowstechai"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/linkedin/i);
  });
});

describe("pickAccounts with a half-connected account", () => {
  it("treats an account with no platform id as unable to post", () => {
    const r = pickAccounts([
      acct("a1", "linkedin", "John C. Hockinson"),
      acct("a2", "facebook", "Tomorrows Tech AI Solutions", { external_id: null }),
      acct("a3", "instagram", "@tomorrowstechai"),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/facebook/i);
  });

  it("prefers a working account when two match the same name", () => {
    const r = pickAccounts([
      acct("old", "linkedin", "John C. Hockinson", { status: "expired" }),
      acct("a1", "linkedin", "John C. Hockinson"),
      acct("a2", "facebook", "Tomorrows Tech AI Solutions"),
      acct("a3", "instagram", "@tomorrowstechai"),
    ]);
    expect(r).toEqual({ ok: true, accounts: { linkedin: "a1", facebook: "a2", instagram: "a3" } });
  });
});

describe("planLoad", () => {
  it("skips posts already loaded and posts whose time has passed", () => {
    const b = batch([post({ id: "d01", date: "2026-12-01" }), post({ id: "d02", date: "2026-12-02" }), post({ id: "d03", date: "2026-12-03" })]);
    const plan = planLoad(b, new Set([batchPostId("2026-12", "d02")]), new Date("2026-12-01T18:00:00Z"));
    expect(plan.past.map((p) => p.id)).toEqual(["d01"]);
    expect(plan.skipped.map((p) => p.id)).toEqual(["d02"]);
    expect(plan.toInsert.map((p) => p.id)).toEqual(["d03"]);
  });

  it("counts an already-loaded post as skipped even when its time has passed", () => {
    const b = batch([post({ id: "d01", date: "2026-12-01" })]);
    const plan = planLoad(b, new Set([batchPostId("2026-12", "d01")]), new Date("2026-12-05T00:00:00Z"));
    expect(plan.skipped.map((p) => p.id)).toEqual(["d01"]);
    expect(plan.past).toEqual([]);
  });

  it("loads a post due later today", () => {
    const b = batch([post({ id: "d01", date: "2026-12-01" })]);
    const plan = planLoad(b, new Set(), new Date("2026-12-01T15:00:00Z"));
    expect(plan.toInsert.map((p) => p.id)).toEqual(["d01"]);
  });
});

describe("splitExisting", () => {
  it("separates fully loaded posts from ones left with no destinations", () => {
    const r = splitExisting([{ id: "p1", platforms: 3 }, { id: "p2", platforms: 0 }, { id: "p3", platforms: 1 }]);
    expect([...r.loaded].sort()).toEqual(["p1", "p3"]);
    expect(r.incomplete).toEqual(["p2"]);
  });
});
