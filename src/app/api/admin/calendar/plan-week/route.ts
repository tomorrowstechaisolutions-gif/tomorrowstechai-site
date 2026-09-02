import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { PLAN_SYSTEM, buildPlanSnapshot, planToPrompt } from "@/lib/calendar/plan";
import { chicagoDay } from "@/lib/calendar/window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI Plan My Week.
 *
 * Builds the week from the database, asks the model to place the open work
 * around what is already committed, and returns PROPOSALS. Nothing here
 * writes a date — every suggestion goes back to the browser as something a
 * person presses Apply on, and that Apply runs the ordinary reschedule
 * action with its ordinary rules.
 *
 * Any id the model invents is dropped before it reaches the screen.
 */

const MODEL = "claude-sonnet-4-5-20250929";

type ModelReply = {
  headline?: string;
  proposals?: { id?: string; date?: string; start_time?: string; end_time?: string; reason?: string }[];
};

export async function POST(req: Request) {
  const session = await getAdminUser();
  if (!session) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const limit = rateLimit(`calendar-plan:${session.admin.email}`, {
    max: 15,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That has been asked a lot in the last hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const weekStart = typeof body?.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)
    ? body.week_start
    : chicagoDay();

  const supabase = await createSupabaseServerClient();
  const snapshot = await buildPlanSnapshot(supabase, session.admin.email, weekStart);

  if (snapshot.needsTime.length === 0) {
    return NextResponse.json({
      headline: "Nothing open needs a slot. Your week is already planned.",
      proposals: [],
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Planning needs the AI key the dashboard advisor uses. Set ANTHROPIC_API_KEY and this will work — until then, the Tasks board sorted by priority is the honest ordering.",
      },
      { status: 503 }
    );
  }

  let reply: ModelReply;
  try {
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: PLAN_SYSTEM,
      messages: [{ role: "user", content: planToPrompt(snapshot) }],
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
    console.error("Week planning failed:", err);
    return NextResponse.json(
      { error: "The planner could not be reached just now." },
      { status: 502 }
    );
  }

  const known = new Map(snapshot.needsTime.map((task) => [task.id, task]));

  const proposals = (reply.proposals ?? [])
    .map((proposal) => {
      const task = proposal.id ? known.get(proposal.id) : undefined;
      if (!task || !proposal.date || !proposal.reason) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(proposal.date)) return null;

      const time = (value: string | undefined) =>
        value && /^\d{2}:\d{2}$/.test(value) ? value : null;

      return {
        id: task.id,
        title: task.title,
        date: proposal.date,
        startTime: time(proposal.start_time) ?? "09:00",
        endTime: time(proposal.end_time),
        reason: String(proposal.reason).slice(0, 300),
      };
    })
    .filter((proposal): proposal is {
      id: string; title: string; date: string;
      startTime: string; endTime: string | null; reason: string;
    } => Boolean(proposal))
    .slice(0, 6);

  return NextResponse.json({
    headline: typeof reply.headline === "string" ? reply.headline.slice(0, 300) : null,
    proposals,
  });
}
