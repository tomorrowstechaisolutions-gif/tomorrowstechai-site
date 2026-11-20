import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSuppression } from "@/lib/email-marketing/suppression";
import { chicagoDate, zonedMidnightUtc } from "@/lib/time/chicago";
import { MIN_EMAIL_GAP_MS, type GateState } from "./gate";
import type { Agent, Business } from "./types";

/**
 * The facts the gate decides on, read from the database. Kept apart from
 * gate.ts so the rules themselves stay free of server imports.
 */

/** The start of today in Chicago, as an ISO instant. */
export function todayStartIso(now: number = Date.now()): string {
  return zonedMidnightUtc(chicagoDate(new Date(now))).toISOString();
}

/** What the crew has spent on AI calls today, in cents. */
export async function spendCentsToday(sb: SupabaseClient, now: number = Date.now()): Promise<number> {
  const { data, error } = await sb.from("ai_runs").select("cost_micro_usd, started_at").gte("started_at", todayStartIso(now));
  if (error) throw new Error(`Could not read today's AI spend: ${error.message}`);
  const micro = (data ?? []).reduce((t, r) => t + Number(r.cost_micro_usd ?? 0), 0);
  return Math.round(micro / 10_000);
}

type StepRow = { tool: string; kind: string; payload: Record<string, unknown> | null; created_at: string };

/**
 * Gather what `checkAction` needs for one business and bot.
 *
 * `emails` are the addresses the action would contact; only those are looked
 * up in the suppression list. Counts are for today in Chicago. The last-email
 * times come from the crew's own step log over the past 48 hours; a tool that
 * knows of other contact (a lead's last_contacted_at) adds it before checking.
 */
export async function loadGateState(
  sb: SupabaseClient,
  business: Business,
  agent: Agent,
  emails: string[],
  now: number = Date.now()
): Promise<GateState> {
  const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const since = new Date(now - MIN_EMAIL_GAP_MS).toISOString();
  const dayStart = todayStartIso(now);

  const [crew, steps, suppression, spend] = await Promise.all([
    sb.from("ai_crew_state").select("paused").limit(1).maybeSingle(),
    sb.from("ai_steps").select("tool, kind, payload, created_at").eq("business_id", business.id).eq("kind", "act").gte("created_at", since < dayStart ? since : dayStart),
    wanted.length ? loadSuppression(sb, wanted) : Promise.resolve({ blocked: new Map<string, unknown>() }),
    spendCentsToday(sb, now),
  ]);
  if (crew.error) throw new Error(`Could not read the crew pause: ${crew.error.message}`);
  if (steps.error) throw new Error(`Could not read recent steps: ${steps.error.message}`);

  const lastEmailAt = new Map<string, number>();
  const postsToday: Record<string, number> = {};
  let firstEmailsToday = 0;

  for (const row of (steps.data ?? []) as StepRow[]) {
    const at = new Date(row.created_at).getTime();
    const payload = row.payload ?? {};
    const to = typeof payload.to === "string" ? payload.to.toLowerCase() : null;
    if (to && at >= now - MIN_EMAIL_GAP_MS) lastEmailAt.set(to, Math.max(lastEmailAt.get(to) ?? 0, at));
    if (row.created_at >= dayStart) {
      if (to && payload.firstContact === true) firstEmailsToday += 1;
      if (Array.isArray(payload.channels)) {
        for (const c of payload.channels) if (typeof c === "string") postsToday[c] = (postsToday[c] ?? 0) + 1;
      }
    }
  }

  return {
    crewPaused: Boolean(crew.data?.paused),
    agentPaused: agent.paused,
    mode: business.mode,
    caps: business.caps,
    suppressed: new Set([...suppression.blocked.keys()].map((k) => String(k).toLowerCase())),
    lastEmailAt,
    firstEmailsToday,
    postsToday,
    spendCentsToday: spend,
    now,
  };
}
