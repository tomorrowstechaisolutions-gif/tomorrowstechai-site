import { NextResponse } from "next/server";
import { toolStations } from "@/lib/crew/tools";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the floor draws from. GET ?since=<iso> returns the crew's steps after
 * that moment (the last day when it is left out), the crew, the stations some
 * tool can work at, and which bots have a shift in progress.
 *
 * Read-only, on the signed-in admin's own database session, so the database's
 * admin-only read rules apply as well as the check here.
 */

const DAY_MS = 24 * 3_600_000;
const MAX_STEPS = 400;

export async function GET(req: Request) {
  const session = await getAdminUser();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const now = Date.now();
  const asked = Date.parse(new URL(req.url).searchParams.get("since") ?? "");
  // Never further back than a week, whatever is asked for.
  const since = new Date(Number.isFinite(asked) ? Math.max(asked, now - 7 * DAY_MS) : now - DAY_MS).toISOString();

  const sb = await createSupabaseServerClient();
  const [steps, agents, open] = await Promise.all([
    sb.from("ai_steps").select("id, run_id, agent_id, seq, kind, tool, station, summary, created_at, payload").gt("created_at", since).order("created_at", { ascending: false }).limit(MAX_STEPS),
    sb.from("ai_agents").select("id, slug, name, rank, desk, paused, schedule_minutes, last_shift_at").order("created_at", { ascending: true }),
    sb.from("ai_runs").select("agent_id").in("status", ["running", "waiting"]).eq("trigger", "shift"),
  ]);
  const error = steps.error ?? agents.error ?? open.error;
  if (error) {
    console.error("[crew] could not load the floor:", error.message);
    return NextResponse.json({ error: "The crew's tables could not be read. They may not be created yet." }, { status: 503 });
  }

  return NextResponse.json(
    {
      steps: (steps.data ?? []).reverse(),
      agents: agents.data ?? [],
      stations: toolStations(),
      working: [...new Set((open.data ?? []).map((r) => r.agent_id as string))],
      now: new Date(now).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
