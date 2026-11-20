import "server-only";
import { chicagoInstant } from "@/lib/time/chicago";
import { logStep, stepFor } from "../log";
import { outside, str, type CrewTool, type ToolContext, type ToolResult } from "./core";

/**
 * Record-keeping Tess does for John while they talk: find the lead he names
 * and write on its record what he tells her happened ("I just messaged her
 * on Facebook", "she wants a call Thursday", "follow up after tax season").
 *
 * This is John's own news, written down for him. It is not the crew acting
 * on the outside world, so it does not go through the gate and needs no
 * goal, the same as her setup tools. Nothing here contacts anyone.
 */

type LeadRow = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; business_name: string | null;
  lead_status: string; last_contacted_at: string | null; next_followup_at: string | null; created_at: string;
};
const COLS = "id, first_name, last_name, email, business_name, lead_status, last_contacted_at, next_followup_at, created_at";

const nameOf = (lead: LeadRow) => `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.business_name || "this lead";
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9@.]+/).filter(Boolean);

/** How many single-letter changes turn one word into the other. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** A heard word matches a written one when it is part of it, or one or two letters off (Natasha, Natosha). */
function near(heard: string, written: string): boolean {
  if (written.includes(heard)) return true;
  return heard.length >= 4 && distance(heard, written) <= (heard.length >= 7 ? 2 : 1);
}

export const findLead: CrewTool = {
  name: "find_lead",
  description:
    "Find a lead by the name John says: a person's name, a business name or an email. Returns the matching leads with their id, how the name is actually spelled on the record, status, last contact and follow-up date. You often hear a name slightly wrong, so close spellings match too; trust the record's spelling over what you heard.",
  input_schema: { type: "object", properties: { name: { type: "string", description: "The name as you heard it." } }, required: ["name"], additionalProperties: false },
  kind: "read",
  station: "crm",
  async run(ctx, input) {
    const heard = words(str(input, "name", 200));
    if (!heard.length) return { ok: false, text: "Give a name to look for." };
    const { data, error } = await ctx.sb.from("leads").select(COLS).order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Could not read the leads: ${error.message}`);
    const leads = (data ?? []) as LeadRow[];
    const written = (l: LeadRow) => words(`${l.first_name ?? ""} ${l.last_name ?? ""} ${l.business_name ?? ""} ${l.email ?? ""}`);
    const exact = leads.filter((l) => heard.every((h) => written(l).some((w) => w.includes(h))));
    const found = (exact.length ? exact : leads.filter((l) => heard.every((h) => written(l).some((w) => near(h, w))))).slice(0, 8);
    const text = found.length
      ? found
          .map((l) => `${l.id} | ${nameOf(l)}${l.business_name && nameOf(l) !== l.business_name ? ` (${l.business_name})` : ""} | ${l.lead_status} | last contact ${l.last_contacted_at ?? "never"} | follow up ${l.next_followup_at ?? "not set"}`)
          .join("\n")
      : "No lead matches that name. Ask John how it is spelled, or whether they are in the system yet.";
    await logStep(ctx.sb, ctx.run, { kind: "read", tool: this.name, station: this.station, summary: `looked up a lead for John (${found.length} found)`, goal_id: null, expectation: null, tool_use_id: ctx.toolUseId });
    return { ok: true, text: found.length ? outside(text) : text };
  },
};

/** How John reached them, and how that is filed on the timeline. */
const CHANNELS: Record<string, { label: string; type: "note" | "call" | "sms" | "email_sent" }> = {
  facebook: { label: "Facebook message", type: "note" },
  instagram: { label: "Instagram message", type: "note" },
  linkedin: { label: "LinkedIn message", type: "note" },
  x: { label: "Message on X", type: "note" },
  text: { label: "Text message", type: "sms" },
  call: { label: "Phone call", type: "call" },
  email: { label: "Email", type: "email_sent" },
  in_person: { label: "In person", type: "note" },
  other: { label: "Contact", type: "note" },
};
/** The statuses she may set on his word. Won, Lost, Spam and Test do more than change a label, so they stay on the lead's own screen. */
const STATUSES = ["Contact Attempted", "Contacted", "Qualified", "Demo Scheduled", "Follow Up Later"];
/** Once a person has taken over the outcome, the automatic follow-up emails stop (same rule as the lead screen). */
const STOPS_FOLLOWUPS = ["Contacted", "Demo Scheduled", "Follow Up Later"];

/** Run a write John dictated once per tool call, and log it for the floor at the CRM. */
async function dictated(ctx: ToolContext, tool: string, summary: string, work: () => Promise<ToolResult>): Promise<ToolResult> {
  if (await stepFor(ctx.sb, ctx.run.id, ctx.toolUseId)) return { ok: true, text: "Already written on the record earlier in this conversation." };
  const result = await work();
  if (result.ok) await logStep(ctx.sb, ctx.run, { kind: "read", tool, station: "crm", summary, goal_id: null, expectation: null, tool_use_id: ctx.toolUseId });
  return result;
}

export const logOnLead: CrewTool = {
  name: "log_on_lead",
  description:
    "Write on a lead's record what John tells you happened, so he does not have to. Use it when he says he contacted someone, heard back, learned something, or wants to follow up on a day. `what`: what happened, in a sentence or two, from John's own words; never invent detail. `channel`: set it when contact was made (this marks the lead as contacted now); leave it out for a plain note. `status`: only when John's news changes it: Contact Attempted when he reached out and has no answer yet, Contacted when they answered. `follow_up_on`: the day to follow up, as YYYY-MM-DD. Get the lead_id from find_lead or read_lead first. This only writes on the record; it contacts nobody.",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      what: { type: "string" },
      channel: { type: "string", enum: Object.keys(CHANNELS) },
      status: { type: "string", enum: STATUSES },
      follow_up_on: { type: "string", description: "YYYY-MM-DD" },
    },
    required: ["lead_id", "what"],
    additionalProperties: false,
  },
  kind: "read",
  station: "crm",
  async run(ctx, input) {
    if (!ctx.run.started_by) return { ok: false, text: "This only works while talking with John." };
    const id = str(input, "lead_id", 80);
    const what = str(input, "what", 2000);
    const channel = CHANNELS[str(input, "channel", 20)] ?? null;
    const status = str(input, "status", 40);
    const followUp = str(input, "follow_up_on", 20);
    if (!what) return { ok: false, text: "Say what happened, so there is something to write." };
    if (status && !STATUSES.includes(status)) return { ok: false, text: `That status is John's to set on the lead's own screen. You can set: ${STATUSES.join(", ")}.` };
    let followUpAt: string | null = null;
    if (followUp) {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(followUp) ? new Date(`${followUp}T00:00:00Z`) : null;
      if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== followUp) return { ok: false, text: "The follow-up day has to be a real date written as YYYY-MM-DD." };
      followUpAt = chicagoInstant(followUp, 9).toISOString();
    }

    const { data, error } = await ctx.sb.from("leads").select(COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the lead: ${error.message}`);
    const lead = data as LeadRow | null;
    if (!lead) return { ok: false, text: "No lead has that id. Use find_lead to get it." };
    const who = nameOf(lead);
    const was = lead.lead_status;

    return dictated(ctx, this.name, `wrote on ${who}'s record for John`, async () => {
      const now = new Date().toISOString();
      const { error: eventError } = await ctx.sb.from("lead_events").insert({
        lead_id: id,
        type: channel?.type ?? "note",
        body: channel ? `${channel.label}: ${what}` : what,
        meta: { logged_by: "tess", for: "john", run_id: ctx.run.id },
        actor: "tess",
      });
      if (eventError) return { ok: false, text: `Nothing was written: ${eventError.message}` };

      const patch: Record<string, unknown> = {};
      if (channel || status === "Contacted" || status === "Contact Attempted") patch.last_contacted_at = now;
      if (status && status !== was) patch.lead_status = status;
      if (followUpAt) patch.next_followup_at = followUpAt;
      const saved = [`Written on ${who}'s record${channel ? `, and ${who} is marked as contacted just now` : ""}.`];
      if (Object.keys(patch).length) {
        const { error: leadError } = await ctx.sb.from("leads").update(patch).eq("id", id);
        if (leadError) return { ok: false, text: `The note is on the timeline, but the lead itself was not updated: ${leadError.message}` };
      }
      if (patch.lead_status) {
        await ctx.sb.from("lead_events").insert({ lead_id: id, type: "status_change", body: `${was} → ${status}. Set by John through Tess.`, actor: "tess" });
        saved.push(`Status is now ${status}.`);
        if (STOPS_FOLLOWUPS.includes(status)) {
          await ctx.sb.from("lead_followups").update({ status: "cancelled", error: `status:${status}` }).eq("lead_id", id).eq("status", "pending");
          saved.push("Any automatic follow-up emails still waiting for this lead are cancelled.");
        }
      }
      if (followUpAt) saved.push(`Follow-up is set for ${followUp}.`);
      saved.push(`The record spells the name "${who}". Tell John in a sentence what you wrote.`);
      return { ok: true, text: saved.join(" ") };
    });
  },
};
