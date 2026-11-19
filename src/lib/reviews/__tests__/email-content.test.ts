import { describe, expect, it } from "vitest";
import { buildReviewRequestEmail, canAskForReview, DEFAULT_REVIEW_URL, REVIEW_ASK_GAP_DAYS } from "../email-content";

const none = { requestedAt: null, requestCount: 0, receivedAt: null };
const now = new Date("2026-11-19T18:00:00Z");

describe("canAskForReview", () => {
  it("allows a client with an email who has never been asked", () => {
    expect(canAskForReview("dana@example.com", none, now)).toEqual({ ok: true });
  });

  it("refuses without an email", () => {
    expect(canAskForReview(null, none, now).ok).toBe(false);
    expect(canAskForReview("not-an-email", none, now).ok).toBe(false);
  });

  it("refuses once the client is marked as having reviewed", () => {
    const r = canAskForReview("dana@example.com", { ...none, receivedAt: "2026-11-01T00:00:00Z" }, now);
    expect(r).toEqual({ ok: false, reason: "This client is marked as having left a review." });
  });

  it("refuses inside the gap and says how long to wait, then allows after it", () => {
    const recent = canAskForReview("dana@example.com", { ...none, requestedAt: "2026-11-16T18:00:00Z", requestCount: 1 }, now);
    expect(recent).toEqual({ ok: false, reason: `Already asked recently. You can ask again in ${REVIEW_ASK_GAP_DAYS - 3} days.` });
    const old = canAskForReview("dana@example.com", { ...none, requestedAt: "2026-11-01T00:00:00Z", requestCount: 1 }, now);
    expect(old).toEqual({ ok: true });
  });
});

describe("buildReviewRequestEmail", () => {
  it("greets by first name, names the business and links the review page", () => {
    const e = buildReviewRequestEmail({ name: "Dana Ortiz", businessName: "Hill Country Roofing", url: DEFAULT_REVIEW_URL });
    expect(e.subject).toBe("A quick favor from Tomorrow's Tech AI");
    expect(e.text).toContain("Hi Dana,");
    expect(e.text).toContain("Hill Country Roofing");
    expect(e.text).toContain(DEFAULT_REVIEW_URL);
    expect(e.html).toContain(DEFAULT_REVIEW_URL);
  });

  it("falls back to a plain greeting with no name, and escapes the business name", () => {
    const e = buildReviewRequestEmail({ name: null, businessName: "A <b>& Sons", url: DEFAULT_REVIEW_URL });
    expect(e.text).toContain("Hi,");
    expect(e.html).not.toContain("<b>& Sons");
  });

  it("uses edited wording when given", () => {
    const e = buildReviewRequestEmail({ name: "Dana", businessName: "X", url: DEFAULT_REVIEW_URL }, { subject: "Got a minute, {first_name}?" });
    expect(e.subject).toBe("Got a minute, Dana?");
  });
});
