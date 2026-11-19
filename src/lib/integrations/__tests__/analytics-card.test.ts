import { describe, expect, it } from "vitest";
import { analyticsCard } from "../analytics-card";

describe("analyticsCard", () => {
  it("is not set up without a token, whatever the probe says", () => {
    expect(analyticsCard(false, { state: "ok", pageviews: 5, visitors: 2 }).state).toBe("not_set_up");
    expect(analyticsCard(false, null).state).toBe("not_set_up");
  });

  it("is connected only after a real answer, and says what it saw", () => {
    const card = analyticsCard(true, { state: "ok", pageviews: 1234, visitors: 1 });
    expect(card.state).toBe("connected");
    expect(card.detail).toBe("Working. 1,234 page views from 1 visitor in the last 7 days.");
  });

  it("counts zero traffic as connected: the request worked", () => {
    const card = analyticsCard(true, { state: "ok", pageviews: 0, visitors: 0 });
    expect(card.state).toBe("connected");
    expect(card.detail).toContain("0 page views from 0 visitors");
  });

  it("needs attention when Vercel refuses or analytics is off", () => {
    expect(analyticsCard(true, { state: "not-enabled" }).state).toBe("attention");
    const rejected = analyticsCard(true, { state: "error", message: "The Vercel token was rejected." });
    expect(rejected).toEqual({ state: "attention", detail: "The Vercel token was rejected." });
  });

  it("stays at keys set when the check timed out or was not made", () => {
    expect(analyticsCard(true, "timeout").state).toBe("keys_set");
    expect(analyticsCard(true, null).state).toBe("keys_set");
  });
});
