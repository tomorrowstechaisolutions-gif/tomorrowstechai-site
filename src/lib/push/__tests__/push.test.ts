import { describe, expect, it } from "vitest";
import { pushMessage, readSubscription, safeLink } from "../message";

describe("what a phone alert says", () => {
  it("uses the alert's name as the title and its summary as the body", () => {
    expect(pushMessage("lead.guide", "Ana Reyes · Showing up on Google", "/admin/leads/abc")).toEqual({
      title: "Site guide finished",
      body: "Ana Reyes · Showing up on Google",
      url: "/admin/leads/abc",
      tag: "lead.guide",
    });
  });

  it("opens the admin when no page was given, and has a plain body when there is no summary", () => {
    const message = pushMessage("invoice.paid", null);
    expect(message.url).toBe("/admin");
    expect(message.body).toBe("Open your admin to see it.");
  });

  it("keeps a long summary short enough for a lock screen", () => {
    expect(pushMessage("lead.new", "x".repeat(500)).body.length).toBeLessThanOrEqual(180);
  });
});

describe("where an alert may send John when tapped", () => {
  it("only ever a page inside this site's admin", () => {
    expect(safeLink("/admin/leads/abc")).toBe("/admin/leads/abc");
    expect(safeLink("https://www.tomorrowstechai.com/admin/leads/abc")).toBe("/admin/leads/abc");
    for (const bad of ["https://evil.example/admin", "//evil.example", "/account", "javascript:alert(1)", "", null, undefined]) {
      expect(safeLink(bad)).toBe("/admin");
    }
  });
});

describe("a phone or browser signing up for alerts", () => {
  const good = { endpoint: "https://web.push.apple.com/abc123", keys: { p256dh: "BPubKey_-123", auth: "authSecret_-1" } };

  it("is accepted with a push address and its two keys", () => {
    expect(readSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: "BPubKey_-123", auth: "authSecret_-1" });
  });

  it("is refused without them, or with an address that is not https", () => {
    for (const bad of [null, {}, { endpoint: good.endpoint }, { ...good, endpoint: "http://insecure.example/x" }, { ...good, endpoint: "not a url" }, { ...good, keys: { p256dh: "", auth: "a" } }, { ...good, keys: { p256dh: "has spaces!", auth: "a" } }]) {
      expect(readSubscription(bad)).toBeNull();
    }
  });
});
