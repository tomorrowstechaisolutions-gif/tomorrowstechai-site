import { describe, expect, it } from "vitest";
import { batchPostId, buildPostRow, cardUrl, scheduledAtUtc, validateBatch, type BatchPost, type SocialBatch } from "../batch";

const post = (over: Partial<BatchPost> = {}): BatchPost => ({
  id: "d01",
  date: "2026-12-01",
  text: "A crew showed up and the permit was not pulled.",
  cardLine: "The permit was not pulled.",
  ...over,
});
const batch = (posts: BatchPost[]): SocialBatch => ({ slug: "2026-12", name: "December 2026", posts });

describe("validateBatch", () => {
  it("accepts a valid batch", () => {
    expect(validateBatch(batch([post()]))).toEqual([]);
  });

  it("rejects duplicate ids and duplicate dates", () => {
    const errs = validateBatch(batch([post(), post()]));
    expect(errs.some((e) => e.includes("d01"))).toBe(true);
    expect(errs.some((e) => e.includes("2026-12-01"))).toBe(true);
  });

  it("rejects a bad slug", () => {
    expect(validateBatch({ ...batch([post()]), slug: "Dec 2026" }).length).toBeGreaterThan(0);
  });

  it("rejects a bad post id", () => {
    expect(validateBatch(batch([post({ id: "Day 1" })])).length).toBeGreaterThan(0);
  });

  it("rejects a date that does not exist", () => {
    expect(validateBatch(batch([post({ date: "2026-02-30" })])).length).toBeGreaterThan(0);
  });

  it("rejects a bad time", () => {
    expect(validateBatch(batch([post({ time: "25:00" })])).length).toBeGreaterThan(0);
  });

  it("rejects an exclamation mark in the text", () => {
    expect(validateBatch(batch([post({ text: "Great news!" })])).length).toBe(1);
  });

  it("rejects emoji in the card line", () => {
    expect(validateBatch(batch([post({ cardLine: "Ship it \u{1F680}" })])).length).toBe(1);
  });

  it("rejects text longer than Instagram's caption limit", () => {
    expect(validateBatch(batch([post({ text: "a".repeat(2201) })])).length).toBe(1);
  });

  it("counts the link toward the caption limit", () => {
    expect(validateBatch(batch([post({ text: "a".repeat(2190), link: "https://www.tomorrowstechai.com/blog/x" })])).length).toBe(1);
  });

  it("rejects a card line over 110 characters", () => {
    expect(validateBatch(batch([post({ cardLine: "a".repeat(111) })])).length).toBe(1);
  });

  it("rejects blank text", () => {
    expect(validateBatch(batch([post({ text: "   " })])).length).toBe(1);
  });

  it("requires alt text with a real image", () => {
    expect(validateBatch(batch([post({ image: "/social/site.jpg" })])).length).toBe(1);
  });

  it("rejects an image that is neither https nor site-relative", () => {
    expect(validateBatch(batch([post({ image: "ftp://x/y.jpg", imageAlt: "x" })])).length).toBe(1);
  });

  it("rejects a link that is not https", () => {
    expect(validateBatch(batch([post({ link: "http://example.com" })])).length).toBe(1);
  });

  it("rejects a batch with no posts", () => {
    expect(validateBatch(batch([])).length).toBe(1);
  });
});

describe("batchPostId", () => {
  it("is the same every time for the same batch and post", () => {
    expect(batchPostId("2026-12", "d01")).toBe(batchPostId("2026-12", "d01"));
  });

  it("differs between posts", () => {
    expect(batchPostId("2026-12", "d01")).not.toBe(batchPostId("2026-12", "d02"));
  });

  it("is a version 5 UUID", () => {
    expect(batchPostId("2026-12", "d01")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("scheduledAtUtc", () => {
  it("converts Central standard time", () => {
    expect(scheduledAtUtc("2026-12-01", "11:30")).toBe("2026-12-01T17:30:00.000Z");
  });

  it("handles the day before clocks spring forward", () => {
    expect(scheduledAtUtc("2027-03-13", "11:30")).toBe("2027-03-13T17:30:00.000Z");
  });

  it("handles the day clocks spring forward", () => {
    expect(scheduledAtUtc("2027-03-14", "11:30")).toBe("2027-03-14T16:30:00.000Z");
  });

  it("handles the day clocks fall back", () => {
    expect(scheduledAtUtc("2027-11-07", "11:30")).toBe("2027-11-07T17:30:00.000Z");
  });
});

describe("buildPostRow", () => {
  it("builds a scheduled row with the card as media", () => {
    const row = buildPostRow(batch([post()]), post());
    expect(row).toMatchObject({
      id: batchPostId("2026-12", "d01"),
      status: "scheduled",
      scheduled_at: "2026-12-01T17:30:00.000Z",
      campaign: "Daily: December 2026",
      body: post().text,
      platform: "linkedin",
      media_type: "image",
      media_url: "https://www.tomorrowstechai.com/social-card/2026-12/d01.jpg",
      approval_type: "none",
      approval_status: "not_required",
      generated_by: "human",
      assigned_to: "batch-loader",
      timezone: "America/Chicago",
      customer_id: null,
      alt_text: "The permit was not pulled.",
      link_url: null,
    });
    expect(row.media_url).toBe(cardUrl("2026-12", "d01"));
  });

  it("uses the real image, the link and the batch time when given", () => {
    const p = post({ image: "/social/site.jpg", imageAlt: "Crew at a pole line", link: "https://www.tomorrowstechai.com/work" });
    const row = buildPostRow({ ...batch([p]), time: "09:00" }, p);
    expect(row.media_url).toBe("https://www.tomorrowstechai.com/social/site.jpg");
    expect(row.alt_text).toBe("Crew at a pole line");
    // With an image attached, LinkedIn and Facebook drop a separate link, so it rides in the text.
    expect(row.link_url).toBeNull();
    expect(row.body).toBe(`${p.text}

https://www.tomorrowstechai.com/work`);
    expect(row.scheduled_at).toBe("2026-12-01T15:00:00.000Z");
  });

  it("lets a post's own time override the batch time", () => {
    const p = post({ time: "07:15" });
    expect(buildPostRow({ ...batch([p]), time: "09:00" }, p).scheduled_at).toBe("2026-12-01T13:15:00.000Z");
  });
});
