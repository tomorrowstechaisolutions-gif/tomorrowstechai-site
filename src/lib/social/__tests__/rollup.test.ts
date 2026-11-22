import { describe, expect, it } from "vitest";
import { mayUseFallbackAccount, rollUpPost, shouldPauseDestination } from "../rollup";

const STAMP = "2026-11-19T14:00:00.000Z";
const dest = (platform: string, platform_status: string, extra: Record<string, string> = {}) => ({ platform, platform_status, ...extra });

describe("rollUpPost", () => {
  it("is published when every destination published", () => {
    const r = rollUpPost([dest("linkedin", "published", { external_url: "https://l/1" }), dest("facebook", "published")], STAMP);
    expect(r).toMatchObject({ status: "published", external_url: "https://l/1", error: null });
  });

  it("is published, with the failure named, when most destinations took it", () => {
    const r = rollUpPost(
      [dest("linkedin", "published"), dest("facebook", "published"), dest("instagram", "published"), dest("x", "failed", { error_message: "HTTP 402" })],
      STAMP
    );
    expect(r.status).toBe("published");
    expect("error" in r && r.error).toBe("Published to 3 of 4. Not sent: x: HTTP 402");
  });

  it("is failed only when nothing went out", () => {
    const r = rollUpPost([dest("x", "failed", { error_message: "HTTP 402" })], STAMP);
    expect(r).toMatchObject({ status: "failed", error: "x: HTTP 402" });
  });

  it("stays scheduled while a destination is still waiting", () => {
    expect(rollUpPost([dest("linkedin", "published"), dest("x", "scheduled")], STAMP).status).toBe("scheduled");
  });

  it("stays publishing while a destination is in flight", () => {
    expect(rollUpPost([dest("linkedin", "published"), dest("x", "publishing")], STAMP).status).toBe("publishing");
  });
});

describe("shouldPauseDestination", () => {
  const now = new Date("2026-11-19T14:00:00Z").getTime();
  const at = (daysAgo: number, status: string) => ({ status, created_at: new Date(now - daysAgo * 86_400_000).toISOString() });

  it("pauses after three failures in a row this week", () => {
    expect(shouldPauseDestination([at(0, "failed"), at(1, "failed"), at(2, "failed")], now)).toBe(true);
  });

  it("does not pause on two failures", () => {
    expect(shouldPauseDestination([at(0, "failed"), at(1, "failed")], now)).toBe(false);
  });

  it("does not pause when the most recent attempts include a success", () => {
    expect(shouldPauseDestination([at(0, "succeeded"), at(1, "failed"), at(2, "failed"), at(3, "failed")], now)).toBe(false);
  });

  it("lifts by itself once the failures are more than a week old", () => {
    expect(shouldPauseDestination([at(8, "failed"), at(9, "failed"), at(10, "failed")], now)).toBe(false);
  });

  it("ignores attempts that never finished", () => {
    expect(shouldPauseDestination([at(0, "publishing"), at(1, "failed"), at(2, "failed")], now)).toBe(false);
  });
});

describe("mayUseFallbackAccount", () => {
  it("allows a lookup for a destination saved with no account", () => {
    expect(mayUseFallbackAccount(null)).toBe(true);
  });

  it("never swaps in another account for a destination that named one", () => {
    // The named account went offline. Posting to whichever other page is
    // connected could put one brand's post on another brand's page.
    expect(mayUseFallbackAccount("acct-1")).toBe(false);
  });
});
