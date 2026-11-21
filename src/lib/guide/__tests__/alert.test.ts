import { describe, expect, it } from "vitest";
import { guideAlert } from "../alert";

const base = { name: "Ana Reyes", email: "ana@example.com", phone: "254-555-0100", need: "Showing up on Google", summary: "Thanks. What brought you here today? I need more customers.\nTess recommended: Showing up on Google (seo).", typed: [] as string[], wantsCall: false, leadUrl: "https://example.test/admin/leads/abc", returning: false };

describe("the email John gets when a visitor finishes the guide", () => {
  it("says who, what they need and how to reach them, with a link to the lead", () => {
    const mail = guideAlert(base);
    expect(mail.subject).toBe("Site guide: Ana Reyes needs showing up on Google");
    expect(mail.text).toContain("ana@example.com");
    expect(mail.text).toContain("254-555-0100");
    expect(mail.text).toContain("I need more customers");
    expect(mail.text).toContain("https://example.test/admin/leads/abc");
  });

  it("puts a call request in the subject, because that one is waiting on him", () => {
    expect(guideAlert({ ...base, wantsCall: true }).subject).toBe("Call requested: Ana Reyes (showing up on Google)");
  });

  it("says when this is someone already in the CRM, since they will not be at the top of the list", () => {
    expect(guideAlert({ ...base, returning: true }).text).toMatch(/already a lead/i);
    expect(guideAlert(base).text).not.toMatch(/already a lead/i);
  });

  it("includes what they typed in their own words, and says so when no phone was given", () => {
    const mail = guideAlert({ ...base, phone: "", typed: ["nobody finds me online"] });
    expect(mail.text).toContain('"nobody finds me online"');
    expect(mail.text).toMatch(/no phone given/i);
  });

  it("leaves the link out when there is no lead to link to", () => {
    expect(guideAlert({ ...base, leadUrl: null }).text).not.toContain("Open the lead");
  });
});
