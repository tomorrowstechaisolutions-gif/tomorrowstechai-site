import { describe, expect, it } from "vitest";
import { explainGoogleError, pagePath, parseServiceKey, syncWindow, toRecords } from "../gsc-core";

const PEM = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";

describe("parseServiceKey", () => {
  it("accepts a bare PEM with escaped newlines", () => {
    const k = parseServiceKey("bot@p.iam.gserviceaccount.com", PEM.replace(/\n/g, "\\n"));
    expect(k).toEqual({ clientEmail: "bot@p.iam.gserviceaccount.com", privateKey: PEM });
  });

  it("accepts the whole downloaded JSON file, and takes the email from it if none is set", () => {
    const json = JSON.stringify({ client_email: "bot@p.iam.gserviceaccount.com", private_key: PEM });
    expect(parseServiceKey(undefined, json)).toEqual({ clientEmail: "bot@p.iam.gserviceaccount.com", privateKey: PEM });
    expect(parseServiceKey("other@p.iam.gserviceaccount.com", json)?.clientEmail).toBe("other@p.iam.gserviceaccount.com");
  });

  it("refuses anything that is not a key", () => {
    expect(parseServiceKey("a@b.c", "")).toBeNull();
    expect(parseServiceKey("a@b.c", "not a key")).toBeNull();
    expect(parseServiceKey("a@b.c", "{broken")).toBeNull();
    expect(parseServiceKey("a@b.c", JSON.stringify({ client_email: "x" }))).toBeNull();
    expect(parseServiceKey("", PEM)).toBeNull();
  });
});

describe("syncWindow", () => {
  const today = new Date("2026-11-19T12:00:00Z");
  it("reaches back 90 days on the first run and 10 after", () => {
    expect(syncWindow(today, false)).toEqual({ startDate: "2026-08-21", endDate: "2026-11-19", days: 90 });
    expect(syncWindow(today, true)).toEqual({ startDate: "2026-11-09", endDate: "2026-11-19", days: 10 });
  });
});

describe("pagePath", () => {
  it("stores a URL as its path", () => {
    expect(pagePath("https://www.example.com/blog/post?x=1")).toBe("/blog/post");
    expect(pagePath("https://example.com")).toBe("/");
    expect(pagePath("not a url")).toBe("not a url");
  });
});

describe("toRecords", () => {
  const at = "2026-11-19T12:00:00.000Z";

  it("maps a row", () => {
    const [r] = toRecords([{ keys: ["2026-11-10", "ai consulting temple tx", "https://www.example.com/services"], clicks: 3, impressions: 40, ctr: 0.075, position: 7.25 }], at);
    expect(r).toEqual({
      date: "2026-11-10", query: "ai consulting temple tx", page: "/services",
      clicks: 3, impressions: 40, ctr: 0.075, position: 7.25, source: "search_console", synced_at: at,
    });
  });

  it("merges the www and bare-domain versions of one page, weighting position by impressions", () => {
    const rows = toRecords([
      { keys: ["2026-11-10", "q", "https://www.example.com/a"], clicks: 1, impressions: 30, position: 4 },
      { keys: ["2026-11-10", "q", "https://example.com/a"], clicks: 1, impressions: 10, position: 8 },
    ], at);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ page: "/a", clicks: 2, impressions: 40, ctr: 0.05, position: 5 });
  });

  it("drops malformed rows and leaves position empty with no impressions", () => {
    const rows = toRecords([
      { keys: ["bad-date", "q", "https://example.com/"] },
      { keys: ["2026-11-10", "", "https://example.com/"] },
      { keys: ["2026-11-10"] },
      {},
      { keys: ["2026-11-10", "q", "https://example.com/"], clicks: 0, impressions: 0, position: 3 },
    ], at);
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBeNull();
    expect(rows[0].ctr).toBe(0);
  });
});

describe("explainGoogleError", () => {
  it("says what to do for the two setup mistakes", () => {
    expect(explainGoogleError(403, "x", "https://www.example.com/", "bot@p.iam")).toContain("add bot@p.iam as a user");
    expect(explainGoogleError(404, "x", "sc-domain:example.com", "bot@p.iam")).toContain("GOOGLE_SEARCH_CONSOLE_SITE_URL");
    expect(explainGoogleError(500, "boom", "s", "e")).toBe("Google answered 500: boom");
  });
});
