import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROFILE, BUILT_IN_VIEW, changedProfileKeys, formatPhone, isEmail, parseProfileForm,
  phoneDigits, profileView, resolveProfile, type ProfileKey,
} from "../profile";
import { BRAND, applyBrandProfile } from "@/lib/email/brand";
import { checkDraft, leadEmailTemplates, signatureFor } from "@/lib/leads/direct-email";

const form = (over: Partial<Record<ProfileKey, string>> = {}) => {
  const base: Record<ProfileKey, string> = {
    phone: "254.555.0142",
    email: "Hello@Example.com",
    signerName: "  Dana ",
    signerRole: "Owner, Example Co",
    city: "Waco",
    region: "tx",
    legalName: "Example Co LLC",
  };
  const values = { ...base, ...over };
  return (name: ProfileKey) => values[name];
};

describe("phone helpers", () => {
  it("accepts the usual spellings of a US number", () => {
    for (const raw of ["(254) 563-2130", "254-563-2130", "254.563.2130", "2545632130", "+1 254 563 2130", "1-254-563-2130"]) {
      expect(phoneDigits(raw)).toBe("2545632130");
      expect(formatPhone(raw)).toBe("(254) 563-2130");
    }
  });

  it("refuses numbers that are not a 10-digit US number", () => {
    for (const raw of ["", "563-2130", "254-563-21300", "054-563-2130", "254-163-2130", "call me", "+44 20 7946 0958"]) {
      expect(formatPhone(raw)).toBeNull();
    }
  });
});

describe("isEmail", () => {
  it("wants a full address", () => {
    expect(isEmail("info@tomorrowstechai.com")).toBe(true);
    expect(isEmail("info@tomorrowstechai")).toBe(false);
    expect(isEmail("info tomorrowstechai.com")).toBe(false);
    expect(isEmail("a b@example.com")).toBe(false);
  });
});

describe("resolveProfile", () => {
  it("returns the built-in profile when nothing is stored", () => {
    expect(resolveProfile(null)).toEqual(BUILT_IN_PROFILE);
    expect(resolveProfile("nonsense")).toEqual(BUILT_IN_PROFILE);
    expect(resolveProfile([])).toEqual(BUILT_IN_PROFILE);
  });

  it("keeps valid fields, normalises them, and falls back field by field", () => {
    const got = resolveProfile({ phone: "2545550142", email: " Sales@Example.com ", city: "  Waco ", region: "ok", signerName: "", legalName: 42 });
    expect(got.phone).toBe("(254) 555-0142");
    expect(got.email).toBe("sales@example.com");
    expect(got.city).toBe("Waco");
    expect(got.region).toBe("OK");
    expect(got.signerName).toBe(BUILT_IN_PROFILE.signerName);
    expect(got.legalName).toBe(BUILT_IN_PROFILE.legalName);
  });

  it("ignores a bad phone, email or state", () => {
    const got = resolveProfile({ phone: "12345", email: "nope", region: "Texas" });
    expect(got).toEqual(BUILT_IN_PROFILE);
  });
});

describe("parseProfileForm", () => {
  it("accepts a good form and tidies it", () => {
    expect(parseProfileForm(form())).toEqual({
      ok: true,
      value: {
        phone: "(254) 555-0142", email: "hello@example.com", signerName: "Dana", signerRole: "Owner, Example Co",
        city: "Waco", region: "TX", legalName: "Example Co LLC",
      },
    });
  });

  it.each([
    [{ phone: "555-0142" }, "10-digit"],
    [{ email: "hello@" }, "email"],
    [{ signerName: "   " }, "signed"],
    [{ signerRole: "" }, "signature"],
    [{ city: "" }, "city"],
    [{ city: "452 Eagle Landing Dr" }, "no street address"],
    [{ city: "Belton 76513" }, "no street address"],
    [{ region: "Texas" }, "two letters"],
    [{ legalName: "" }, "legal business name"],
    [{ legalName: "x".repeat(101) }, "legal business name"],
  ] as Array<[Partial<Record<ProfileKey, string>>, string]>)("refuses %j", (over, fragment) => {
    const got = parseProfileForm(form(over));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.error).toContain(fragment);
  });
});

describe("profileView", () => {
  it("derives the link and search-data spellings", () => {
    expect(BUILT_IN_VIEW.phoneHref).toBe("tel:+12545632130");
    expect(BUILT_IN_VIEW.phoneIntl).toBe("+1-254-563-2130");
    expect(BUILT_IN_VIEW.emailHref).toBe("mailto:info@tomorrowstechai.com");
    expect(BUILT_IN_VIEW.location).toBe("Belton, TX");
  });

  it("follows a changed profile", () => {
    const v = profileView({ ...BUILT_IN_PROFILE, phone: "(512) 555-0100", city: "Austin" });
    expect(v.phoneHref).toBe("tel:+15125550100");
    expect(v.location).toBe("Austin, TX");
  });
});

describe("changedProfileKeys", () => {
  it("is empty for the built-ins and names what differs", () => {
    expect(changedProfileKeys(BUILT_IN_PROFILE)).toEqual([]);
    expect(changedProfileKeys({ ...BUILT_IN_PROFILE, phone: "(512) 555-0100", city: "Austin" })).toEqual(["phone", "city"]);
  });
});

describe("email brand block", () => {
  it("starts on the built-in profile and takes a saved one", () => {
    expect(BRAND.phone).toBe(BUILT_IN_VIEW.phone);
    expect(BRAND.email).toBe(BUILT_IN_VIEW.email);
    expect(BRAND.site).toBe("https://www.tomorrowstechai.com");

    applyBrandProfile(profileView({ ...BUILT_IN_PROFILE, phone: "(512) 555-0100", email: "hi@example.com", signerName: "Dana", signerRole: "Owner" }));
    expect([BRAND.phone, BRAND.phoneHref, BRAND.email, BRAND.signer, BRAND.signerRole])
      .toEqual(["(512) 555-0100", "tel:+15125550100", "hi@example.com", "Dana", "Owner"]);

    applyBrandProfile(BUILT_IN_VIEW);
    expect(BRAND.phone).toBe(BUILT_IN_VIEW.phone);
  });
});

describe("lead email signature", () => {
  const lead = { first_name: "alex", business_name: "Hill Country Roofing" };

  it("ends every template with the profile phone", () => {
    const templates = leadEmailTemplates(lead, "(512) 555-0100");
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t.body.endsWith(signatureFor("(512) 555-0100"))).toBe(true);
      expect(t.body).not.toContain("563-2130");
    }
  });

  it("still treats greeting plus signature as an empty message, whatever the phone", () => {
    const empty = `Hi Alex,\n\n\n\n${signatureFor("(512) 555-0100")}`;
    expect(checkDraft("Hello", empty).ok).toBe(false);
    const written = `Hi Alex,\n\nHere is the quote.\n\n${signatureFor("(512) 555-0100")}`;
    expect(checkDraft("Hello", written).ok).toBe(true);
  });
});
