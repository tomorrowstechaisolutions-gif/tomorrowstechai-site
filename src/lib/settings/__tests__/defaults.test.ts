import { describe, expect, it } from "vitest";
import {
  BUILT_IN, accessChangeAllowed, changedKeys, describeHours, isHttpsUrl,
  parseDefaultsForm, resolveDefaults, type BusinessDefaults, type DefaultKey,
} from "../defaults";

const form = (over: Partial<Record<DefaultKey, string>> = {}) => {
  const base: Record<DefaultKey, string> = {
    invoiceTerm: "net_14",
    invoiceTermsText: "Pay within two weeks.",
    invoiceFooter: "Thanks.",
    proposalValidDays: "45",
    reviewUrl: "https://g.page/r/abc/review",
    reviewGapDays: "21",
    followupFirstHours: "48",
    followupSecondHours: "96",
  };
  const values = { ...base, ...over };
  return (name: DefaultKey) => values[name];
};

describe("resolveDefaults", () => {
  it("returns the built-in values when nothing is stored", () => {
    expect(resolveDefaults(null)).toEqual(BUILT_IN);
    expect(resolveDefaults(undefined)).toEqual(BUILT_IN);
    expect(resolveDefaults("nonsense")).toEqual(BUILT_IN);
    expect(resolveDefaults([])).toEqual(BUILT_IN);
  });

  it("keeps valid stored fields and falls back field by field", () => {
    const got = resolveDefaults({ invoiceTerm: "net_30", proposalValidDays: 60, reviewGapDays: "no", invoiceFooter: "   " });
    expect(got.invoiceTerm).toBe("net_30");
    expect(got.proposalValidDays).toBe(60);
    expect(got.reviewGapDays).toBe(BUILT_IN.reviewGapDays);
    expect(got.invoiceFooter).toBe(BUILT_IN.invoiceFooter);
  });

  it("ignores an unknown payment term, an out-of-range number and a non-https link", () => {
    const got = resolveDefaults({ invoiceTerm: "net_90", proposalValidDays: 0, reviewUrl: "http://example.com/review" });
    expect(got.invoiceTerm).toBe(BUILT_IN.invoiceTerm);
    expect(got.proposalValidDays).toBe(BUILT_IN.proposalValidDays);
    expect(got.reviewUrl).toBe(BUILT_IN.reviewUrl);
  });

  it("drops a follow-up pair where the second is not after the first", () => {
    const got = resolveDefaults({ followupFirstHours: 72, followupSecondHours: 24 });
    expect([got.followupFirstHours, got.followupSecondHours]).toEqual([24, 72]);
    const ok = resolveDefaults({ followupFirstHours: 12, followupSecondHours: 36 });
    expect([ok.followupFirstHours, ok.followupSecondHours]).toEqual([12, 36]);
  });

  it("falls back to the base it is given, not always the built-ins", () => {
    const base: BusinessDefaults = { ...BUILT_IN, reviewUrl: "https://example.com/from-env" };
    expect(resolveDefaults({}, base).reviewUrl).toBe("https://example.com/from-env");
    expect(resolveDefaults({ reviewUrl: "https://example.com/saved" }, base).reviewUrl).toBe("https://example.com/saved");
  });

  it("allows a gap of zero days", () => {
    expect(resolveDefaults({ reviewGapDays: 0 }).reviewGapDays).toBe(0);
  });
});

describe("parseDefaultsForm", () => {
  it("accepts a good form and trims text", () => {
    const got = parseDefaultsForm(form({ invoiceFooter: "  Thanks.  " }));
    expect(got).toEqual({
      ok: true,
      value: {
        invoiceTerm: "net_14", invoiceTermsText: "Pay within two weeks.", invoiceFooter: "Thanks.",
        proposalValidDays: 45, reviewUrl: "https://g.page/r/abc/review", reviewGapDays: 21,
        followupFirstHours: 48, followupSecondHours: 96,
      },
    });
  });

  it.each([
    [{ invoiceTerm: "whenever" }, "payment terms"],
    [{ invoiceTerm: "paid_upfront" }, "payment terms"],
    [{ invoiceTermsText: "  " }, "terms wording"],
    [{ invoiceFooter: "" }, "footer"],
    [{ proposalValidDays: "0" }, "Proposal validity"],
    [{ proposalValidDays: "30.5" }, "Proposal validity"],
    [{ proposalValidDays: "abc" }, "Proposal validity"],
    [{ reviewUrl: "g.page/r/abc" }, "https://"],
    [{ reviewUrl: "javascript:alert(1)" }, "https://"],
    [{ reviewGapDays: "-1" }, "gap"],
    [{ followupFirstHours: "0" }, "whole hours"],
    [{ followupSecondHours: "721" }, "whole hours"],
    [{ followupFirstHours: "72", followupSecondHours: "72" }, "after the first"],
  ] as Array<[Partial<Record<DefaultKey, string>>, string]>)("refuses %j", (over, fragment) => {
    const got = parseDefaultsForm(form(over));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.error).toContain(fragment);
  });

  it("refuses wording past the length limit", () => {
    expect(parseDefaultsForm(form({ invoiceFooter: "x".repeat(2001) })).ok).toBe(false);
  });
});

describe("changedKeys", () => {
  it("is empty for the built-ins and names what differs", () => {
    expect(changedKeys(BUILT_IN)).toEqual([]);
    expect(changedKeys({ ...BUILT_IN, proposalValidDays: 45, invoiceTerm: "net_7" })).toEqual(["invoiceTerm", "proposalValidDays"]);
  });
});

describe("describeHours", () => {
  it("reads short delays in hours and long ones in days", () => {
    expect(describeHours(1)).toBe("1 hour");
    expect(describeHours(24)).toBe("24 hours");
    expect(describeHours(47)).toBe("47 hours");
    expect(describeHours(48)).toBe("2 days");
    expect(describeHours(72)).toBe("3 days");
    expect(describeHours(60)).toBe("2 days 12 hours");
  });
});

describe("isHttpsUrl", () => {
  it("accepts only full https addresses", () => {
    expect(isHttpsUrl("https://g.page/r/abc/review")).toBe(true);
    expect(isHttpsUrl("http://g.page/r/abc")).toBe(false);
    expect(isHttpsUrl("https://localhost")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });
});

describe("accessChangeAllowed", () => {
  const owner = { id: "1", role: "owner" };
  const admin = { id: "2", role: "admin" };
  const viewer = { id: "3", role: "viewer" };
  const all = [owner, admin, viewer];

  it("lets an owner change someone else's role or remove them", () => {
    expect(accessChangeAllowed(owner, admin, "viewer", all)).toEqual({ ok: true });
    expect(accessChangeAllowed(owner, viewer, null, all)).toEqual({ ok: true });
  });

  it("refuses anyone who is not an owner", () => {
    expect(accessChangeAllowed(admin, viewer, "admin", all).ok).toBe(false);
    expect(accessChangeAllowed(viewer, admin, null, all).ok).toBe(false);
  });

  it("refuses removing yourself", () => {
    const two = [owner, { id: "4", role: "owner" }];
    expect(accessChangeAllowed(owner, owner, null, two).ok).toBe(false);
  });

  it("protects the last owner from demotion, but not when there is another", () => {
    expect(accessChangeAllowed(owner, owner, "admin", all).ok).toBe(false);
    const other = { id: "4", role: "owner" };
    expect(accessChangeAllowed(owner, owner, "admin", [...all, other])).toEqual({ ok: true });
    expect(accessChangeAllowed(owner, other, null, [...all, other])).toEqual({ ok: true });
  });

  it("allows keeping the only owner as owner", () => {
    expect(accessChangeAllowed(owner, owner, "owner", all)).toEqual({ ok: true });
  });
});
