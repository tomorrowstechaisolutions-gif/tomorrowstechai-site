import { NextResponse } from "next/server";
import { anthropic, effort } from "@/lib/ai/claude";
import { briefText, buildBrief, visitSince } from "@/lib/crew/brief";
import { openChatTurn } from "@/lib/crew/chat";
import { TESS_EFFORT } from "@/lib/crew/models";
import { contextBlocks, loadTessProfile } from "@/lib/crew/profile";
import { advanceRun, type ModelCall } from "@/lib/crew/run";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Talking to Tess.
 *
 * POST { message }. An empty message means John has just opened the tab. The
 * reply is a stream of server-sent events:
 *   { type: "state", state: "thinking" | "speaking" | "idle" }
 *   { type: "text", delta }      a piece of what Tess is saying
 *   { type: "error", message }   something went wrong; say it plainly
 *   { type: "done" }
 *
 * The crew's tables are written with the service role, so the admin check at
 * the top is what guards them.
 */

type Event =
  | { type: "state"; state: "thinking" | "speaking" | "idle" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const limit = rateLimit(`tess:${session.user.id}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ error: "That is a lot in one hour. Give it a few minutes." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  const userId = session.user.id;
  const sb = supabaseAdmin();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // John closed the tab. The run still finishes and is saved.
        }
      };

      let spoke = false;
      let speaking = false;
      // Tess's words go out as she writes them, not when the reply is whole.
      const call: ModelCall = async (request) => {
        if (spoke) send({ type: "text", delta: "\n\n" });
        speaking = false;
        const reply = anthropic().messages.stream({
          model: request.model,
          max_tokens: 16000,
          system: request.system,
          tools: request.tools,
          messages: request.messages,
          ...effort(TESS_EFFORT),
        });
        reply.on("text", (delta) => {
          if (!speaking) {
            speaking = true;
            send({ type: "state", state: "speaking" });
          }
          spoke = true;
          send({ type: "text", delta });
        });
        return reply.finalMessage();
      };

      send({ type: "state", state: "thinking" });
      try {
        const runId = await openChatTurn(sb, {
          userId,
          message,
          context: contextBlocks(await loadTessProfile(sb, userId)),
          brief: async () => briefText(await buildBrief(sb, await visitSince(sb, userId))),
        });
        const result = await advanceRun(sb, runId, {
          deadlineAt: Date.now() + 50_000,
          call,
          onEvent: (event) => {
            if (event.type === "tool") send({ type: "state", state: "thinking" });
          },
        });
        if (result.busy) send({ type: "error", message: "I am still working on your last message. Give me a moment and ask again." });
        else if (result.status === "paused_budget") send({ type: "error", message: "Today's AI spending limit has been reached, so I have to stop here until tomorrow." });
        else if (result.status === "waiting") send({ type: "error", message: "That took longer than I get in one go. Ask me again and I will pick up where I stopped." });
        else if (result.status === "failed" || result.status === "stopped") send({ type: "error", message: "I could not finish that answer. Try asking again." });
      } catch (err) {
        console.error("[tess] chat failed:", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong on my side." });
      }
      send({ type: "state", state: "idle" });
      send({ type: "done" });
      if (open) controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
