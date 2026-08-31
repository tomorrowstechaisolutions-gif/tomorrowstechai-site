import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { annualised, effectiveProbability } from "@/lib/pipeline/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records what the pipeline was worth today. Point a daily Vercel Cron at it.
 *
 * This exists because "value over time" cannot be reconstructed after the
 * fact. A deal's value changes, deals are created and closed, and nothing in
 * today's rows tells you what the total was three weeks ago. So the only
 * honest way to have that chart is to start writing the number down, once a
 * day, from now on — which is what this does.
 *
 * It reads and writes one row. It changes no deal, sends nothing, and is
 * safe to run twice: the unique index on captured_on turns a second run into
 * an update of the same day rather than a duplicate.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  // Constant-time compare, same as the follow-up cron.
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const OPEN = ["new", "qualified", "discovery", "proposal", "negotiation", "on_hold"];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const sb = supabaseAdmin();

  const { data: deals, error } = await sb
    .from("deals")
    .select("stage, value_cents, billing, probability, committed, won_at");

  if (error) {
    console.error("[cron:pipeline-snapshot]", error.message);
    return NextResponse.json({ error: "Could not read deals." }, { status: 502 });
  }

  type Row = {
    stage: string; value_cents: number | null; billing: string;
    probability: number | null; committed: boolean; won_at: string | null;
  };
  const rows = (deals ?? []) as Row[];

  const open = rows.filter((d) => OPEN.includes(d.stage));

  const pipelineCents = open.reduce((t, d) => t + annualised(d.value_cents, d.billing), 0);
  const weightedCents = open.reduce(
    (t, d) =>
      t +
      Math.round(
        (annualised(d.value_cents, d.billing) *
          effectiveProbability({ stage: d.stage, probability: d.probability })) /
          100
      ),
    0
  );
  const committedCents = open
    .filter((d) => d.committed)
    .reduce((t, d) => t + annualised(d.value_cents, d.billing), 0);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const wonThisMonth = rows.filter((d) => d.won_at && new Date(d.won_at) >= monthStart);

  const capturedOn = new Date().toISOString().slice(0, 10);

  const { error: writeError } = await sb.from("pipeline_snapshots").upsert(
    {
      captured_on: capturedOn,
      open_deals: open.length,
      pipeline_cents: pipelineCents,
      weighted_cents: weightedCents,
      committed_cents: committedCents,
      won_month_cents: wonThisMonth.reduce((t, d) => t + annualised(d.value_cents, d.billing), 0),
      won_month_count: wonThisMonth.length,
    },
    { onConflict: "captured_on" }
  );

  if (writeError) {
    console.error("[cron:pipeline-snapshot] write:", writeError.message);
    return NextResponse.json({ error: "Could not write the snapshot." }, { status: 502 });
  }

  return NextResponse.json({
    captured_on: capturedOn,
    open_deals: open.length,
    pipeline_cents: pipelineCents,
    weighted_cents: weightedCents,
  });
}
