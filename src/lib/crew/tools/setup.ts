import "server-only";
import { chicagoDate } from "@/lib/time/chicago";
import { logStep, stepFor } from "../log";
import type { Playbook } from "../types";
import { str, type CrewTool, type ToolContext, type ToolResult } from "./core";

/**
 * Tess's setup tools: write the playbook, set the month's target, save one of
 * John's corrections as a standing rule.
 *
 * These are configuration John dictates in conversation, not actions taken on
 * the outside world, so they do not go through the gate and need no goal.
 * None of them can put a business into launch mode. Only John pressing
 * Confirm playbook does that (see ../setup.ts).
 */

const METRICS = ["qualified_leads", "booked_calls", "sales", "site_visitors", "unpaid_days"] as const;

function list(input: Record<string, unknown>, key: string): string[] {
  const v = input[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 20);
}

/** Run a configuration write once per tool call, and log it for the floor. */
export async function once(ctx: ToolContext, tool: string, summary: string, work: () => Promise<ToolResult>): Promise<ToolResult> {
  if (await stepFor(ctx.sb, ctx.run.id, ctx.toolUseId)) return { ok: true, text: "Already saved earlier in this conversation." };
  const result = await work();
  if (result.ok) {
    await logStep(ctx.sb, ctx.run, { kind: "read", tool, station: "library", summary, goal_id: null, expectation: null, tool_use_id: ctx.toolUseId });
  }
  return result;
}

/** First and last day of the current month in the business's time zone. */
function thisMonth(): { start: string; end: string } {
  const today = chicagoDate();
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export const savePlaybook: CrewTool = {
  name: "save_playbook",
  description:
    "Save the playbook for this business from what John has told you: who he sells to, which offers to lead with, the voice, what is off limits, and the channels to use. Saving replaces the previous playbook and takes the business out of launch mode until John presses Confirm playbook again, so save only when he has given you a real change.",
  input_schema: {
    type: "object",
    properties: {
      sells_to: { type: "string", description: "Who the business sells to, in a sentence or two." },
      offers: { type: "array", items: { type: "string" }, description: "The offers to lead with." },
      voice: { type: "string", description: "How the crew should sound." },
      off_limits: { type: "array", items: { type: "string" }, description: "Things the crew must never do or say." },
      channels: { type: "array", items: { type: "string" }, description: "Channels to use, e.g. email, linkedin, facebook, instagram, x." },
    },
    required: ["sells_to", "offers", "voice"],
    additionalProperties: false,
  },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    const playbook: Playbook = {
      sellsTo: str(input, "sells_to", 1000),
      offers: list(input, "offers"),
      voice: str(input, "voice", 1000),
      offLimits: list(input, "off_limits"),
      channels: list(input, "channels").map((c) => c.toLowerCase()),
    };
    if (!playbook.sellsTo || !playbook.voice) return { ok: false, text: "A playbook needs who the business sells to and the voice." };
    return once(ctx, this.name, "saved the playbook", async () => {
      const { error } = await ctx.sb.from("ai_businesses").update({ playbook, mode: "setup", playbook_confirmed_at: null }).eq("id", ctx.business.id);
      if (error) return { ok: false, text: `Could not save the playbook: ${error.message}` };
      return { ok: true, text: "Playbook saved. Nothing is sent until John presses Confirm playbook on the Tess tab. Read it back to him and tell him that." };
    });
  },
};

export const setTarget: CrewTool = {
  name: "set_target",
  description: "Set this month's target for one measure. Calling it again for the same measure replaces the number.",
  input_schema: {
    type: "object",
    properties: {
      metric: { type: "string", enum: [...METRICS], description: "What is being counted." },
      target: { type: "number", description: "The number to reach this month. A whole number, zero or more." },
    },
    required: ["metric", "target"],
    additionalProperties: false,
  },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    const metric = str(input, "metric", 40);
    const target = typeof input.target === "number" ? Math.round(input.target) : Number.NaN;
    if (!(METRICS as readonly string[]).includes(metric)) return { ok: false, text: `The measure must be one of: ${METRICS.join(", ")}.` };
    if (!Number.isFinite(target) || target < 0 || target > 1_000_000) return { ok: false, text: "The target must be a whole number, zero or more." };
    const { start, end } = thisMonth();
    return once(ctx, this.name, `set this month's ${metric.replace(/_/g, " ")} target to ${target}`, async () => {
      const { error } = await ctx.sb
        .from("ai_goals")
        .upsert({ business_id: ctx.business.id, metric, target, period_start: start, period_end: end }, { onConflict: "business_id,metric,period_start" });
      if (error) return { ok: false, text: `Could not save the target: ${error.message}` };
      return { ok: true, text: `Target saved: ${metric.replace(/_/g, " ")} ${target}, ${start} to ${end}.` };
    });
  },
};

export const addRule: CrewTool = {
  name: "add_rule",
  description: "Save one of John's corrections as a standing rule that every bot reads before it acts. Use his own words, as one clear instruction.",
  input_schema: { type: "object", properties: { rule: { type: "string", description: "The rule, as one instruction." } }, required: ["rule"], additionalProperties: false },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    const text = str(input, "rule", 500);
    if (!text) return { ok: false, text: "A rule needs some text." };
    return once(ctx, this.name, `saved a rule: ${text}`, async () => {
      const { error } = await ctx.sb.from("ai_rules").insert({ text, scope: "all", active: true });
      if (error) return { ok: false, text: `Could not save the rule: ${error.message}` };
      return { ok: true, text: "Rule saved. Every bot follows it from its next shift." };
    });
  },
};
