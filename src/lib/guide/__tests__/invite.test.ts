import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteDue, INVITE_AFTER_MS, INVITE_REST_MS, mascotShows } from "../invite";
import { offerFromRow } from "../offers";

describe("when Tess offers to help on her own", () => {
  it("waits about thirty seconds", () => {
    expect(INVITE_AFTER_MS).toBe(30_000);
  });

  it("offers to a visitor she has never offered to", () => {
    expect(inviteDue(null)).toBe(true);
    expect(inviteDue("")).toBe(true);
    expect(inviteDue("garbage")).toBe(true);
  });

  it("does not offer again within a week, then does", () => {
    const now = 1_800_000_000_000;
    expect(inviteDue(String(now - 60_000), now)).toBe(false);
    expect(inviteDue(String(now - INVITE_REST_MS), now)).toBe(true);
  });

  it("stays off the ad pages, the admin, the member area and her own page", () => {
    for (const path of ["/starter-website", "/business-launch/thank-you", "/admin/leads", "/account", "/guide"]) expect(mascotShows(path)).toBe(false);
    for (const path of ["/", "/services", "/contact", "/blog/some-post", "/guidelines"]) expect(mascotShows(path)).toBe(true);
  });
});

describe("the price she shows for an offer", () => {
  const row = { slug: "seo", name: "Search Engine Optimization", short_description: "Found on Google.", subtitle: null, from_cents: 39900, setup_fee_cents: 0, billing_type: "recurring", pricing_mode: "fixed" };

  it("is the catalog price, by the month when it recurs", () => {
    expect(offerFromRow(row)).toMatchObject({ price: "$399/month", regular: null, setup: null, blurb: "Found on Google." });
  });

  it("says From for a starting price and adds a setup fee", () => {
    expect(offerFromRow({ ...row, pricing_mode: "starting_at", setup_fee_cents: 25000 })).toMatchObject({ price: "From $399/month", setup: "$250 one-time setup" });
  });

  it("is a custom quote with no price", () => {
    expect(offerFromRow({ ...row, from_cents: 0 }).price).toBe("Custom quote");
    expect(offerFromRow({ ...row, pricing_mode: "custom_quote" }).price).toBe("Custom quote");
  });

  it("is the launch price with the regular price beside it for an ad-funnel offer", () => {
    const offer = offerFromRow({ ...row, slug: "website-starter", from_cents: 75000, billing_type: "one_time" });
    expect(offer.price).toBe("$149");
    expect(offer.regular).toBe("$750");
  });
});
