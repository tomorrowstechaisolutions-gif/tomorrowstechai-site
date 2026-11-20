import "server-only";
import { OPEN_PAGE_TOOL, pageById, TESS_PAGES } from "@/components/admin/cc/tess/pages";
import type { CrewTool } from "./core";
import { once } from "./setup";

/**
 * Tess opening a page of the admin when John asks ("Tess, open clients").
 *
 * The page changes in his browser, so this tool only checks the page exists
 * and logs it; the chat route reads the page off the same tool call and the
 * screen goes there. She can only open the admin's own pages: the choice is
 * a fixed list, never an address.
 */
export const openPage: CrewTool = {
  name: OPEN_PAGE_TOOL,
  description: `Open a page of the admin on John's screen when he asks you to go to it, and only then. You go with him and stay on that page as a small ball he can keep talking to. Pages: ${TESS_PAGES.map((p) => `${p.id} (${p.label})`).join(", ")}. "ai" is your own full screen. You open list pages; you cannot open one particular record, so open its list and say so.`,
  input_schema: {
    type: "object",
    properties: { page: { type: "string", enum: TESS_PAGES.map((p) => p.id) } },
    required: ["page"],
    additionalProperties: false,
  },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    if (!ctx.run.started_by) return { ok: false, text: "This only works while talking with John." };
    const page = pageById(input.page);
    if (!page) return { ok: false, text: "There is no page with that name. Pick one from the list." };
    return once(ctx, this.name, `opened ${page.label} for John`, async () => ({
      ok: true,
      text: `${page.label} is opening on John's screen and you are going there with him. You will be told what the page shows with his next message; until then do not describe what is on it. Tell him in a few words that it is open.`,
    }));
  },
};
