import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  PRIORITIZE_SYSTEM, buildPrioritySnapshot, snapshotToPrompt,
} from "@/lib/tasks/prioritize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI Prioritize My Day.
 *
 * Same three rules as the dashboard advisor:
 *
 *  1. The model reads the board from a snapshot this route builds on the
 *     server. The request body carries nothing at all — a caller can ask,
 *     never supply the facts.
 *  2. The model cannot do anything. It returns an ordered list of task ids
 *     with reasons; nothing here writes to a task.
 *  3. It ranks what it was given or it returns fewer items. Any id it invents
 *     is dropped below, so a hallucinated task cannot reach the screen.
 */

const MODEL = "claude-sonnet-4-5-20250929";

type ModelReply = { headline?: string; items?: { id?: string; reason?: string }[] };

export async function POST() {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const limit = rateLimit(`task-prioritize:${session.admin.email}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That has been asked a lot in the last hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const supabase = await createSupabaseServerClient();
  const snapshot = await buildPrioritySnapshot(supabase, session.admin.email);

  if (snapshot.candidates.length === 0) {
    return NextResponse.json({
      headline: "Nothing open. Your board is clear.",
      items: [],
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // No model, no ranking. Saying so is the honest answer; inventing an
    // order and calling it AI would not be.
    return NextResponse.json(
      {
        error:
          "Prioritising needs the AI key that the dashboard advisor uses. Set ANTHROPIC_API_KEY and this will work — until then, sorting by Priority or Due Date is the honest ordering.",
      },
      { status: 503 }
    );
  }

  let reply: ModelReply;
  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: PRIORITIZE_SYSTEM,
      messages: [{ role: "user", content: snapshotToPrompt(snapshot) }],
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    reply = JSON.parse(text) as ModelReply;
  } catch (err) {
    console.error("Task prioritisation failed:", err);
    return NextResponse.json(
      { error: "The prioritiser could not be reached just now." },
      { status: 502 }
    );
  }

  // Only ids that were actually in the snapshot survive. This is what stops a
  // hallucinated task reaching the screen.
  const known = new Map(snapshot.candidates.map((task) => [task.id, task]));
  const items = (reply.items ?? [])
    .map((item) => {
      const task = item.id ? known.get(item.id) : undefined;
      if (!task || !item.reason) return null;
      return {
        id: task.id,
        title: task.title,
        reason: String(item.reason).slice(0, 300),
        href: `/admin/tasks?task=${task.id}`,
      };
    })
    .filter((item): item is { id: string; title: string; reason: string; href: string } =>
      Boolean(item))
    .slice(0, 5);

  return NextResponse.json({
    headline: typeof reply.headline === "string" ? reply.headline.slice(0, 300) : null,
    items,
  });
}
