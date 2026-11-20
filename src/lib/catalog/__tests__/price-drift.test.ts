import { describe, expect, it } from "vitest";
import { CODE_PRICED_OFFERS, dollars, findPriceDrift } from "../price-drift";

const matching = CODE_PRICED_OFFERS.map((o) => ({ slug: o.slug, from_cents: o.codeCents }));

describe("findPriceDrift", () => {
  it("reports nothing when the catalog matches the code", () => {
    expect(findPriceDrift(matching)).toEqual([]);
  });

  it("reports a package whose catalog price was edited", () => {
    const rows = matching.map((r) => (r.slug === "website-classic" ? { ...r, from_cents: 44900 } : r));
    const drift = findPriceDrift(rows);
    expect(drift).toHaveLength(1);
    expect(drift[0].slug).toBe("website-classic");
    expect(drift[0].catalogCents).toBe(44900);
    expect(drift[0].codeCents).toBe(39900);
  });

  it("does not treat a missing or unpriced row as drift", () => {
    expect(findPriceDrift([])).toEqual([]);
    expect(findPriceDrift([{ slug: "website-starter", from_cents: null }, { slug: null, from_cents: 1 }])).toEqual([]);
  });

  it("ignores catalog rows the code does not price", () => {
    expect(findPriceDrift([{ slug: "audience-growth", from_cents: 1 }])).toEqual([]);
  });
});

describe("dollars", () => {
  it("drops the cents when they are zero", () => {
    expect(dollars(39900)).toBe("$399");
    expect(dollars(2950)).toBe("$29.50");
  });
});
