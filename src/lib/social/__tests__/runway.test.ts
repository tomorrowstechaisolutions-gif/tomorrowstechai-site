import { describe, expect, it } from "vitest";
import { RUNWAY_THRESHOLDS, daysOfRunway, runwayAlert, runwayBand } from "../runway-core";

const now = new Date("2026-12-10T15:00:00Z"); // Dec 10, 9:00 AM Central

describe("daysOfRunway", () => {
  it("counts Central calendar days to the last scheduled post", () => {
    expect(daysOfRunway(["2026-12-11T17:30:00Z", "2026-12-24T17:30:00Z"], now)).toBe(14);
  });

  it("is 0 when the last post goes out today", () => {
    expect(daysOfRunway(["2026-12-10T17:30:00Z"], now)).toBe(0);
  });

  it("is 0 when nothing is scheduled", () => {
    expect(daysOfRunway([], now)).toBe(0);
  });

  it("is 0 when the only post is already past", () => {
    expect(daysOfRunway(["2026-12-09T17:30:00Z"], now)).toBe(0);
  });

  it("uses the Central date, not the UTC date", () => {
    // 03:00 UTC on Dec 11 is still the evening of Dec 10 in Central.
    expect(daysOfRunway(["2026-12-11T17:30:00Z"], new Date("2026-12-11T03:00:00Z"))).toBe(1);
  });

  it("counts across a daylight-saving change without drifting a day", () => {
    expect(daysOfRunway(["2027-03-21T16:30:00Z"], new Date("2027-03-07T15:00:00Z"))).toBe(14);
  });

  it("ignores the order the posts come in", () => {
    expect(daysOfRunway(["2026-12-24T17:30:00Z", "2026-12-11T17:30:00Z"], now)).toBe(14);
  });
});

describe("runwayBand", () => {
  it("puts the days left into the 14, 7 or 1 day band", () => {
    expect(RUNWAY_THRESHOLDS).toEqual([14, 7, 1]);
    expect(runwayBand(15)).toBeNull();
    expect(runwayBand(14)).toBe(14);
    expect(runwayBand(13)).toBe(14);
    expect(runwayBand(8)).toBe(14);
    expect(runwayBand(7)).toBe(7);
    expect(runwayBand(2)).toBe(7);
    expect(runwayBand(1)).toBe(1);
    expect(runwayBand(0)).toBe(1);
  });
});

describe("runwayAlert", () => {
  const at = new Date("2026-12-10T14:10:00Z");
  const sent = (summary: string, daysAgo: number) => ({ summary, created_at: new Date(at.getTime() - daysAgo * 86_400_000).toISOString() });

  it("says what is left in plain words", () => {
    expect(runwayAlert(14, true, [], at)?.summary).toBe("Daily social posts run out in 14 days. Time to build the next batch.");
    expect(runwayAlert(7, true, [], at)?.summary).toBe("Daily social posts run out in 7 days. Time to build the next batch.");
    expect(runwayAlert(1, true, [], at)?.summary).toBe("The last daily social post goes out tomorrow. Nothing is scheduled after it.");
    expect(runwayAlert(0, true, [], at)?.summary).toBe("The last daily social post goes out today. Nothing is scheduled after it.");
  });

  it("stays quiet with more than 14 days left", () => {
    expect(runwayAlert(15, true, [], at)).toBeNull();
    expect(runwayAlert(30, true, [], at)).toBeNull();
  });

  it("stays quiet when nothing is scheduled at all", () => {
    expect(runwayAlert(0, false, [], at)).toBeNull();
  });

  it("does not repeat an alert already sent for the same band", () => {
    const first = runwayAlert(14, true, [], at)!;
    expect(runwayAlert(13, true, [sent(first.summary, 1)], at)).toBeNull();
    expect(runwayAlert(8, true, [sent(first.summary, 6)], at)).toBeNull();
  });

  it("still alerts when the exact day was missed", () => {
    // The check failed or did not run on day 14; day 13 must not stay silent.
    expect(runwayAlert(13, true, [], at)?.summary).toBe("Daily social posts run out in 13 days. Time to build the next batch.");
  });

  it("alerts when posts were canceled and the count jumped past a threshold", () => {
    const fourteen = runwayAlert(14, true, [], at)!;
    expect(runwayAlert(5, true, [sent(fourteen.summary, 2)], at)?.threshold).toBe(7);
  });

  it("alerts for the next band after the earlier one was sent", () => {
    const fourteen = runwayAlert(14, true, [], at)!;
    const seven = runwayAlert(7, true, [sent(fourteen.summary, 7)], at)!;
    expect(seven.threshold).toBe(7);
    expect(runwayAlert(1, true, [sent(fourteen.summary, 13), sent(seven.summary, 6)], at)?.threshold).toBe(1);
  });

  it("does not repeat the last-post alert on the final day", () => {
    const tomorrow = runwayAlert(1, true, [], at)!;
    expect(runwayAlert(0, true, [sent(tomorrow.summary, 1)], at)).toBeNull();
  });

  it("alerts again when a refilled queue runs down weeks later", () => {
    const first = runwayAlert(14, true, [], at)!;
    expect(runwayAlert(14, true, [sent(first.summary, 30)], at)?.threshold).toBe(14);
  });
});
