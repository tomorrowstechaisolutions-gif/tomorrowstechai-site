import "server-only";
import { logStep, stepFor } from "../log";
import { act, GOAL_FIELDS, str, type CrewTool } from "./core";

/**
 * Tools every bot has: raise something for John, and report at the end of a
 * shift. Tess's own tools (playbook, target, rules) are in setup.ts.
 */

export const flagForJohn: CrewTool = {
  name: "flag_for_john",
  description:
    "Put something on John's list instead of doing it. Use this for anything only John may do: money leaving (refunds, paying bills, transfers), a price that is not in the catalog, signing anything, deleting records, or changing who can sign in. Also use it when you are unsure whether you are allowed to act.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What needs doing, in a few words." },
      why: { type: "string", description: "Why it matters and what you recommend." },
      ...GOAL_FIELDS,
    },
    required: ["title", "why", "goal_id", "expectation"],
    additionalProperties: false,
  },
  kind: "act",
  station: "crm",
  async run(ctx, input) {
    const title = str(input, "title", 200);
    const why = str(input, "why", 1000);
    if (!title) return { ok: false, text: "A flag needs a title." };
    // Always refused by the gate, by design: refusing is what files it for John.
    const result = await act(
      ctx,
      this.name,
      input,
      { action: { alwaysJohn: true }, station: this.station, summary: "", refusedSummary: title, forJohn: { title, why } },
      async () => ({ ok: false, text: "unreachable" })
    );
    return result.ok ? result : { ok: false, text: result.text.startsWith("Only John") ? "It is on John's list. Do not attempt it yourself." : result.text };
  },
};

export const report: CrewTool = {
  name: "report",
  description: "End your shift. Say in two or three plain sentences what you did, what happened, and anything John should know. Call this once, last.",
  input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    const summary = str(input, "summary", 600) || "Shift finished with nothing to report.";
    if (!(await stepFor(ctx.sb, ctx.run.id, ctx.toolUseId))) {
      await logStep(ctx.sb, ctx.run, { kind: "report", tool: this.name, station: null, summary, goal_id: null, expectation: null, tool_use_id: ctx.toolUseId });
    }
    return { ok: true, text: "Report recorded. Your shift is over; reply with a single short closing line." };
  },
};
