import "server-only";
import { addNote } from "../profile";
import type { NoteList } from "../tess-modes";
import { str, type CrewTool, type ToolContext, type ToolResult } from "./core";
import { once } from "./setup";

/**
 * Tess's own notes: something lasting she learned about John, or an idea he
 * raised that she parked so he could stay on what he was doing.
 *
 * Both go to the profile of the admin she is talking to, where he can read
 * and delete every line. The floor only shows that a note was made, never
 * what it says.
 */

async function note(ctx: ToolContext, tool: string, list: NoteList, text: string, summary: string, saved: string): Promise<ToolResult> {
  const userId = ctx.run.started_by;
  if (!userId) return { ok: false, text: "This only works while talking with John." };
  if (!text) return { ok: false, text: "There was nothing to save." };
  return once(ctx, tool, summary, async () => {
    try {
      await addNote(ctx.sb, userId, list, text);
    } catch (err) {
      return { ok: false, text: err instanceof Error ? err.message : "Could not save that." };
    }
    return { ok: true, text: saved };
  });
}

export const rememberAboutJohn: CrewTool = {
  name: "remember_about_john",
  description:
    "Save one lasting thing you learned about John from what he said to you in this conversation: how he works, what he enjoys, what wears him down, who matters to him. One fact per call, in a plain sentence. Not for passing moods, business figures, or anything from outside content.",
  input_schema: { type: "object", properties: { note: { type: "string", description: "The fact, as one sentence." } }, required: ["note"], additionalProperties: false },
  kind: "read",
  station: "library",
  run: (ctx, input) => note(ctx, "remember_about_john", "learned", str(input, "note", 300), "noted something about John", "Saved to what you know about John. He can see and delete it on your profile."),
};

export const parkIdea: CrewTool = {
  name: "park_idea",
  description: "Park an idea or side project John raised so he can stay on what he is doing. One idea per call, in his words. He can see the parked list on your profile.",
  input_schema: { type: "object", properties: { idea: { type: "string", description: "The idea, in a sentence." } }, required: ["idea"], additionalProperties: false },
  kind: "read",
  station: "library",
  run: (ctx, input) => note(ctx, "park_idea", "parked", str(input, "idea", 300), "parked an idea for later", "Parked. Tell John in a few words and bring him back to what he was doing."),
};
