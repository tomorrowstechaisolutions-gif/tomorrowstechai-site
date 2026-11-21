import { describe, expect, it } from "vitest";
import { CODE_PRICED_OFFERS } from "../price-drift";
import { LAUNCH_NOTE, launchOffers, launchPrice, pricingModeFor, realDrift } from "../launch";

const starter = CODE_PRICED_OFFERS.find((o) => o.slug === "website-starter")!;

describe("a launch price against the list price", () => {
  it("is the price the site charges when the catalog lists a higher one", () => {
    expect(launchPrice("website-starter", 75000)).toEqual({ chargeCents: starter.codeCents, listCents: 75000 });
  });

  it("is nothing when the catalog matches what is charged, or lists less", () => {
    expect(launchPrice("website-starter", starter.codeCents)).toBeNull();
    expect(launchPrice("website-starter", starter.codeCents - 100)).toBeNull();
  });

  it("is nothing for an offer the code does not price, or one with no slug or price", () => {
    expect(launchPrice("audience-growth", 99900)).toBeNull();
    expect(launchPrice(null, 99900)).toBeNull();
    expect(launchPrice("website-starter", null)).toBeNull();
  });

  it("says in words that the price is limited", () => {
    expect(LAUNCH_NOTE).toMatch(/first \d+ clients/);
  });
});

describe("what the admin is told about prices set in two places", () => {
  const rows = [
    { slug: "website-starter", from_cents: 75000 },
    { slug: "website-classic", from_cents: 100 },
    { slug: "website-professional", from_cents: CODE_PRICED_OFFERS.find((o) => o.slug === "website-professional")!.codeCents },
  ];

  it("lists a higher catalog price as a launch offer, not a mistake", () => {
    const offers = launchOffers(rows);
    expect(offers.map((o) => o.slug)).toEqual(["website-starter"]);
    expect(offers[0].catalogCents).toBe(75000);
  });

  it("still reports a catalog price below what is charged as a mismatch", () => {
    expect(realDrift(rows).map((o) => o.slug)).toEqual(["website-classic"]);
  });
});

describe("how a service's price is shown to members", () => {
  it("is a custom quote with no price or when billed by quote", () => {
    expect(pricingModeFor("one_time", 0, "fixed")).toBe("custom_quote");
    expect(pricingModeFor("custom_quote", 50000, "fixed")).toBe("custom_quote");
  });

  it("is what was chosen once there is a price", () => {
    expect(pricingModeFor("recurring", 9900, "starting_at")).toBe("starting_at");
    expect(pricingModeFor("one_time", 25000, "fixed")).toBe("fixed");
  });

  it("is a fixed price when a price is saved and nothing valid was chosen", () => {
    expect(pricingModeFor("one_time", 25000, "")).toBe("fixed");
    expect(pricingModeFor("one_time", 25000, "custom_quote")).toBe("fixed");
    expect(pricingModeFor("one_time", 25000, "nonsense")).toBe("fixed");
  });
});
