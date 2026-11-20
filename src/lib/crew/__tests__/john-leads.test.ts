import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { ROLE } from "../roles";
import { toolsFor } from "../tools";
import { findLead, logOnLead } from "../tools/john-leads";

const lead = (over: Record<string, unknown>) => ({
  first_name: null, last_name: null, email: null, business_name: null, lead_status: "New", do_not_contact: false,
  unsubscribed_at: null, last_contacted_at: null, next_followup_at: null, created_at: "2026-10-01T12:00:00.000Z", ...over,
});

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1" }],
    ai_steps: [],
    leads: [
      lead({ id: "lead-1", first_name: "Natosha", last_name: "Reed", business_name: "Reed Mentoring", email: "n@example.com" }),
      lead({ id: "lead-2", first_name: "Ana", last_name: "Lopez", business_name: "Lopez Roofing", lead_status: "Contacted" }),
    ],
    lead_events: [],
    lead_followups: [{ id: "f-1", lead_id: "lead-1", status: "pending" }, { id: "f-2", lead_id: "lead-2", status: "pending" }],
    ...over,
  });
}
const ctx = (db: unknown, toolUseId = "tu-1", startedBy: string | null = "user-1") =>
  ({ sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: startedBy }, toolUseId, business: { id: "biz-1" } }) as never;

describe("Tess finding a lead John names", () => {
  it("is one of her tools, along with writing on the record", () => {
    const names = toolsFor("tess").map((t) => t.name);
    expect(names).toContain("find_lead");
    expect(names).toContain("log_on_lead");
  });

  it("finds a lead by name or business and gives the id and how the name is spelled", async () => {
    const { db } = setup();
    const byName = await findLead.run(ctx(db), { name: "ana lopez" });
    expect(byName.text).toContain("lead-2");
    expect(byName.text).not.toContain("lead-1");
    expect((await findLead.run(ctx(db, "tu-2"), { name: "Reed Mentoring" })).text).toContain("Natosha Reed");
  });

  it("still finds her when the name was heard slightly wrong", async () => {
    const { db } = setup();
    const heard = await findLead.run(ctx(db), { name: "Natasha" });
    expect(heard.ok).toBe(true);
    expect(heard.text).toContain("lead-1");
    expect(heard.text).toContain("Natosha");
  });

  it("says so when nobody matches", async () => {
    const { db } = setup();
    const none = await findLead.run(ctx(db), { name: "Zebulon" });
    expect(none.text).toMatch(/no lead/i);
  });
});

describe("Tess writing on a lead's record what John tells her", () => {
  it("logs a contact he made, in his words, and marks the lead as contacted now", async () => {
    const { db, tables } = setup();
    const result = await logOnLead.run(ctx(db), { lead_id: "lead-1", channel: "facebook", what: "John messaged her again about Site Build It." });
    expect(result.ok).toBe(true);
    expect(result.text).toContain("Natosha Reed");
    expect(tables.lead_events).toHaveLength(1);
    expect(tables.lead_events[0]).toMatchObject({ lead_id: "lead-1", type: "note", actor: "tess" });
    expect(String(tables.lead_events[0].body)).toContain("Facebook");
    expect(String(tables.lead_events[0].body)).toContain("Site Build It");
    expect(tables.leads[0].last_contacted_at).toBeTruthy();
    expect(tables.leads[0].lead_status).toBe("New");
  });

  it("files a call and a text under their own kinds", async () => {
    const { db, tables } = setup();
    await logOnLead.run(ctx(db, "tu-1"), { lead_id: "lead-1", channel: "call", what: "Left a voicemail." });
    await logOnLead.run(ctx(db, "tu-2"), { lead_id: "lead-1", channel: "text", what: "Texted the link." });
    expect(tables.lead_events.map((e) => e.type)).toEqual(["call", "sms"]);
  });

  it("a plain note does not count as contact", async () => {
    const { db, tables } = setup();
    await logOnLead.run(ctx(db), { lead_id: "lead-1", what: "Her name is spelled with an o." });
    expect(tables.lead_events[0]).toMatchObject({ type: "note" });
    expect(tables.leads[0].last_contacted_at).toBeNull();
  });

  it("changes the status when he says to, records the change, and stops the automatic follow-ups", async () => {
    const { db, tables } = setup();
    const result = await logOnLead.run(ctx(db), { lead_id: "lead-1", channel: "facebook", what: "She answered and wants a call.", status: "Contacted" });
    expect(result.ok).toBe(true);
    expect(tables.leads[0].lead_status).toBe("Contacted");
    expect(tables.lead_events.map((e) => e.type)).toEqual(["note", "status_change"]);
    expect(String(tables.lead_events[1].body)).toContain("New → Contacted");
    expect(tables.lead_followups.find((f) => f.id === "f-1")?.status).toBe("cancelled");
    expect(tables.lead_followups.find((f) => f.id === "f-2")?.status).toBe("pending");
  });

  it("leaves the automatic follow-ups running after an attempt with no answer", async () => {
    const { db, tables } = setup();
    await logOnLead.run(ctx(db), { lead_id: "lead-1", channel: "facebook", what: "Messaged again.", status: "Contact Attempted" });
    expect(tables.leads[0].lead_status).toBe("Contact Attempted");
    expect(tables.lead_followups.find((f) => f.id === "f-1")?.status).toBe("pending");
  });

  it("will not set a status that is John's to set on the lead's own screen", async () => {
    const { db, tables } = setup();
    const result = await logOnLead.run(ctx(db), { lead_id: "lead-1", what: "Closed it.", status: "Won" });
    expect(result.ok).toBe(false);
    expect(tables.lead_events).toHaveLength(0);
    expect(tables.leads[0].lead_status).toBe("New");
  });

  it("sets the day to follow up", async () => {
    const { db, tables } = setup();
    const result = await logOnLead.run(ctx(db), { lead_id: "lead-1", what: "Check back after the tax rush.", follow_up_on: "2027-04-20" });
    expect(result.ok).toBe(true);
    expect(String(tables.leads[0].next_followup_at)).toMatch(/^2027-04-20T/);
    expect(result.text).toContain("2027-04-20");
  });

  it("refuses a date that is not a real day", async () => {
    const { db, tables } = setup();
    const result = await logOnLead.run(ctx(db), { lead_id: "lead-1", what: "Later.", follow_up_on: "next Tuesday" });
    expect(result.ok).toBe(false);
    expect(tables.lead_events).toHaveLength(0);
  });

  it("writes once even if the same step is run again", async () => {
    const { db, tables } = setup();
    await logOnLead.run(ctx(db), { lead_id: "lead-1", channel: "facebook", what: "Messaged." });
    await logOnLead.run(ctx(db), { lead_id: "lead-1", channel: "facebook", what: "Messaged." });
    expect(tables.lead_events).toHaveLength(1);
    expect(tables.ai_steps).toHaveLength(1);
  });

  it("needs a lead that exists, something to write, and John in the conversation", async () => {
    const { db, tables } = setup();
    expect((await logOnLead.run(ctx(db), { lead_id: "nope", what: "x" })).ok).toBe(false);
    expect((await logOnLead.run(ctx(db), { lead_id: "lead-1", what: "  " })).ok).toBe(false);
    expect((await logOnLead.run(ctx(db, "tu-1", null), { lead_id: "lead-1", what: "x" })).ok).toBe(false);
    expect(tables.lead_events).toHaveLength(0);
  });
});

describe("Tess's standing instructions", () => {
  it("tell her to do the record-keeping herself and only on John's word", () => {
    expect(ROLE.tess.prompt).toContain("log_on_lead");
    expect(ROLE.tess.prompt).toMatch(/never tell him to log/i);
  });
});
