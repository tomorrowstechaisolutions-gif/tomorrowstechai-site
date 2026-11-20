import "server-only";
import { loadLeadsNeedingAttention } from "@/lib/dashboard/sales";
import { getThread, gmailProfile, listThreads, sendMail } from "@/lib/google/gmail";
import { emailBlock } from "@/lib/leads/direct-email";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/supabase/types";
import { act, GOAL_FIELDS, outside, read, refuse, SIGNATURE, str, type CrewTool } from "./core";

/**
 * The sales desk's tools: find leads that have gone quiet, read what was said,
 * follow up, and keep the lead's status true.
 */

type LeadRow = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; business_name: string | null;
  do_not_contact: boolean; unsubscribed_at: string | null; last_contacted_at: string | null; lead_status: string;
};

const LEAD_COLS = "id, first_name, last_name, email, business_name, do_not_contact, unsubscribed_at, last_contacted_at, lead_status";

function nameOf(lead: LeadRow): string {
  return `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || lead.business_name || "this lead";
}

export const listLeadsNeedingAttention: CrewTool = {
  name: "list_leads_needing_attention",
  description: "List the open leads that most need contact right now, with why and when they were last contacted. Start a sales shift here.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  station: "crm",
  async run(ctx) {
    const leads = await loadLeadsNeedingAttention(ctx.sb, 12);
    const text = leads.length
      ? leads.map((l) => `${l.id} | ${l.name}${l.business ? ` (${l.business})` : ""} | ${l.status} | last contact ${l.lastContactedAt ?? "never"} | ${l.nextAction}`).join("\n")
      : "No lead needs attention right now.";
    return read(ctx, this.name, this.station, `checked which leads need attention (${leads.length})`, text);
  },
};

export const readLead: CrewTool = {
  name: "read_lead",
  description: "Read one lead: who they are, their status, and their last ten timeline events.",
  input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"], additionalProperties: false },
  kind: "read",
  station: "crm",
  async run(ctx, input) {
    const id = str(input, "lead_id", 80);
    const { data: lead, error } = await ctx.sb.from("leads").select(`${LEAD_COLS}, message, services_interested, created_at`).eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the lead: ${error.message}`);
    if (!lead) return { ok: false, text: "No lead has that id." };
    const { data: events } = await ctx.sb.from("lead_events").select("type, body, actor, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(10);
    // The lead wrote some of this (their form message, their replies).
    const text = outside(
      [
        JSON.stringify(lead),
        "Recent events (newest first):",
        ...(events ?? []).map((e) => `${e.created_at} ${e.type} by ${e.actor ?? "system"}: ${e.body ?? ""}`),
      ].join("\n")
    );
    return read(ctx, this.name, this.station, `read ${nameOf(lead as LeadRow)}'s record`, text);
  },
};

export const readLeadEmails: CrewTool = {
  name: "read_lead_emails",
  description: "Read the most recent email thread with a lead, to see whether they replied and what was said.",
  input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"], additionalProperties: false },
  kind: "read",
  station: "inbox",
  async run(ctx, input) {
    const id = str(input, "lead_id", 80);
    const { data: lead } = await ctx.sb.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle();
    if (!lead?.email) return { ok: false, text: "That lead has no email address, so there are no emails to read." };
    const me = (await gmailProfile()).emailAddress;
    const { threads } = await listThreads({ box: "all", q: `from:${lead.email} OR to:${lead.email}`, me, max: 3 });
    if (!threads.length) return read(ctx, this.name, this.station, `looked for emails with ${nameOf(lead as LeadRow)} (none)`, "No emails with this lead were found.");
    const thread = await getThread(threads[0].id);
    const text = thread.messages
      .slice(-4)
      .map((m) => `${m.date ?? ""} from ${m.from.map((a) => a.email).join(", ")}:\n${(m.text ?? "").slice(0, 1500)}`)
      .join("\n---\n");
    return read(ctx, this.name, this.station, `read the email thread with ${nameOf(lead as LeadRow)}`, outside(text));
  },
};

export const sendLeadEmail: CrewTool = {
  name: "send_lead_email",
  description:
    "Send one plain-text email to a lead from John's mailbox. Write only the message itself: do not add a signature or a sign-off name, the signature is added for you. Never write as if you were John or any other person.",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      subject: { type: "string", description: "Under 160 characters." },
      body: { type: "string", description: "The message, plain text, no signature." },
      ...GOAL_FIELDS,
    },
    required: ["lead_id", "subject", "body", "goal_id", "expectation"],
    additionalProperties: false,
  },
  kind: "act",
  station: "inbox",
  async run(ctx, input) {
    const id = str(input, "lead_id", 80);
    const subject = str(input, "subject", 160);
    const body = str(input, "body", 6000);
    const { data, error } = await ctx.sb.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the lead: ${error.message}`);
    const lead = data as LeadRow | null;
    if (!lead) return { ok: false, text: "No lead has that id." };

    const who = nameOf(lead);
    const base = { station: this.station, refusedSummary: `did not email ${who}` } as const;
    if (!subject || !body) return { ok: false, text: "An email needs both a subject and a body." };

    // The lead's own flags first: no address, or marked do-not-contact.
    const block = emailBlock({ email: lead.email ?? "", do_not_contact: lead.do_not_contact, unsubscribed_at: lead.unsubscribed_at });
    if (block.blocked) {
      await refuse(ctx, this.name, base, "blocked", block.reason);
      return { ok: false, text: block.reason };
    }
    // Someone who unsubscribed is never emailed by a bot. Checked on the
    // lead's own record, so it does not depend on the suppression list
    // matching the address letter for letter.
    if (lead.unsubscribed_at) {
      const reason = "This person unsubscribed. They are never emailed.";
      await refuse(ctx, this.name, base, "blocked", reason);
      return { ok: false, text: reason };
    }
    const to = (lead.email as string).trim();

    return act(
      ctx,
      this.name,
      input,
      {
        ...base,
        action: { recipientEmail: to, firstContact: !lead.last_contacted_at },
        summary: `emailed ${who}: ${subject}`,
        payload: { to: to.toLowerCase(), firstContact: !lead.last_contacted_at, leadId: lead.id, subject },
        lastContactAt: lead.last_contacted_at ? new Date(lead.last_contacted_at).getTime() : null,
      },
      async () => {
        const from = (await gmailProfile()).emailAddress;
        const sent = await sendMail({
          from: { name: "Tess at Tomorrow's Tech AI", email: from },
          to: [{ name: who === "this lead" ? null : who, email: to }],
          subject,
          text: `${body}\n\n${SIGNATURE}`,
        });
        const now = new Date().toISOString();
        const { error: eventError } = await ctx.sb.from("lead_events").insert({
          lead_id: lead.id,
          type: "email_sent",
          body: `Subject: ${subject}`,
          meta: { subject, to, gmail_id: sent.id, thread_id: sent.threadId, crew: ctx.agent.slug },
          actor: "tess",
        });
        if (eventError) console.error("[crew] lead event not written:", eventError.message);
        const { error: touchError } = await ctx.sb.from("leads").update({ last_contacted_at: now }).eq("id", lead.id);
        if (touchError) console.error("[crew] last_contacted_at not updated:", touchError.message);
        return { ok: true, text: `Sent to ${to}.` };
      }
    );
  },
};

export const updateLeadStatus: CrewTool = {
  name: "update_lead_status",
  description: "Change a lead's status when something real happened, such as a reply that qualifies them. Not for Won, Spam or Test: those are John's calls.",
  input_schema: {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      status: { type: "string", enum: ["Contact Attempted", "Contacted", "Qualified", "Demo Scheduled", "Follow Up Later"] },
      why: { type: "string" },
      ...GOAL_FIELDS,
    },
    required: ["lead_id", "status", "why", "goal_id", "expectation"],
    additionalProperties: false,
  },
  kind: "act",
  station: "crm",
  async run(ctx, input) {
    const id = str(input, "lead_id", 80);
    const status = str(input, "status", 40) as LeadStatus;
    const why = str(input, "why", 300);
    const allowed: LeadStatus[] = ["Contact Attempted", "Contacted", "Qualified", "Demo Scheduled", "Follow Up Later"];
    if (!LEAD_STATUSES.includes(status) || !allowed.includes(status)) return { ok: false, text: "That is not a status the crew may set." };
    const { data } = await ctx.sb.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle();
    const lead = data as LeadRow | null;
    if (!lead) return { ok: false, text: "No lead has that id." };
    const who = nameOf(lead);

    return act(
      ctx,
      this.name,
      input,
      { action: {}, station: this.station, summary: `moved ${who} to ${status}`, refusedSummary: `did not change ${who}'s status`, payload: { leadId: id, status } },
      async () => {
        const { error } = await ctx.sb.from("leads").update({ lead_status: status }).eq("id", id);
        if (error) return { ok: false, text: `The status was not changed: ${error.message}` };
        await ctx.sb.from("lead_events").insert({ lead_id: id, type: "status_change", body: `${lead.lead_status} → ${status}. ${why}`, actor: "tess" });
        return { ok: true, text: `Status is now ${status}.` };
      }
    );
  },
};
