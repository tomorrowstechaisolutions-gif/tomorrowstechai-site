import { describe, expect, it } from "vitest";
import { CONTACT_KEY, packContact, readContact } from "../remember";

describe("remembering a visitor who has already said who they are", () => {
  it("reads back what was saved", () => {
    const saved = packContact({ name: "Ana Reyes", email: "ana@example.com", phone: "254-555-0100" });
    expect(readContact(saved)).toEqual({ name: "Ana Reyes", email: "ana@example.com", phone: "254-555-0100" });
  });

  it("keeps a visitor who gave no phone", () => {
    expect(readContact(packContact({ name: "Ana", email: "ana@example.com", phone: "" }))).toEqual({ name: "Ana", email: "ana@example.com", phone: "" });
  });

  it("remembers nobody when nothing was saved, or what was saved is not usable", () => {
    for (const raw of [null, "", "not json", "[]", "{}", JSON.stringify({ name: "Ana" }), JSON.stringify({ name: "", email: "ana@example.com" }), JSON.stringify({ name: "Ana", email: "not-an-email" }), JSON.stringify({ name: 5, email: "ana@example.com" })]) {
      expect(readContact(raw)).toBeNull();
    }
  });

  it("trims what it reads and cuts anything absurdly long", () => {
    const got = readContact(JSON.stringify({ name: `  ${"a".repeat(500)}  `, email: " ana@example.com ", phone: "1".repeat(200) }));
    expect(got?.name.length).toBe(120);
    expect(got?.email).toBe("ana@example.com");
    expect(got?.phone.length).toBe(40);
  });

  it("is kept under its own name in the browser", () => {
    expect(CONTACT_KEY).toBe("tess-guide-contact");
  });
});
