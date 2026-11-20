import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAdvisorContext } from "@/lib/dashboard/advisor-context";
import { chicagoDate } from "@/lib/time/chicago";
import { spendCentsToday } from "./gate-state";
import { loadStepsSince } from "./log";
import type { Agent, AgentSlug, Business, Goal, Run, Step, StepKind } from "./types";

/**
 * What Tess knows when John walks in.
 *
 * Everything here is read from the database at the moment it is asked for:
 * what the crew did since his last visit (from the step log and nothing
 * else), what is waiting on him, how far along this period's targets are,
 * and the same business snapshot the advisor reads. Tess is given this as
 * text and may not add to it.
 */

export type Brief = {
  asOf: string;
  since: string;
  business: { id: string; name: string; mode: Business["mode"]; hasPlaybook: boolean } | null;
  setupNeeded: boolean;
  /** Launched, but with no target for the current period: the crew runs no shifts until one is set. */
  noTarget: boolean;
  crewPaused: boolean;
  didWhileOut: { agent: string; summary: string; kind: StepKind; at: string }[];
  needsJohn: { id: string; title: string }[];
  /** `current` is null when nothing measures that target yet. */
  targets: { metric: Goal["metric"]; current: number | null; target: number }[];
  crew: { slug: AgentSlug; name: string; doing: string | null; working: boolean; paused: boolean }[];
  spendCentsToday: number;
  capCents: number;
  rulesCount: number;
  /** The newest standing rules, in John's words, so he can see what was saved. */
  rules: string[];
  snapshot: string;
};

/** A visit lasts this long. Coming back sooner is the same visit. */
const VISIT_MS = 4 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

/**
 * When John was last here before this visit. Opening the tab hours after the
 * last time starts a new visit and moves the mark; a refresh does not, so
 * "while you were out" stays put for the whole sitting.
 */
export async function visitSince(sb: SupabaseClient, userId: string, now: number = Date.now()): Promise<string> {
  const nowIso = new Date(now).toISOString();
  const { data, error } = await sb.from("ai_visits").select("*").eq("user_id", userId).maybeSingle();
  if (error) fail("Could not read the last visit", error);
  const visit = data as { last_seen: string; previous_seen: string | null } | null;

  if (!visit) {
    const { error: insertError } = await sb.from("ai_visits").insert({ user_id: userId, last_seen: nowIso, previous_seen: null });
    if (insertError) fail("Could not record the visit", insertError);
    return new Date(now - DAY_MS).toISOString();
  }
  if (now - Date.parse(visit.last_seen) < VISIT_MS) return visit.previous_seen ?? new Date(now - DAY_MS).toISOString();

  const previous = visit.last_seen;
  const { error: updateError } = await sb.from("ai_visits").update({ last_seen: nowIso, previous_seen: previous }).eq("user_id", userId);
  if (updateError) fail("Could not record the visit", updateError);
  return previous;
}

const QUALIFIED = ["Qualified", "Demo Scheduled", "Proposal/Checkout Sent", "Won"];

/** How far along one target is, counted from this period's own rows. */
async function progress(sb: SupabaseClient, goal: Goal): Promise<number | null> {
  const from = goal.period_start;
  const to = `${goal.period_end}T23:59:59.999Z`;
  try {
    if (goal.metric === "qualified_leads") {
      const { data, error } = await sb.from("leads").select("id").in("lead_status", QUALIFIED).gte("created_at", from).lte("created_at", to).limit(1000);
      return error ? null : (data ?? []).length;
    }
    if (goal.metric === "booked_calls") {
      const { data, error } = await sb.from("meetings").select("id").neq("status", "cancelled").gte("created_at", from).lte("created_at", to).limit(1000);
      return error ? null : (data ?? []).length;
    }
    if (goal.metric === "sales") {
      const { data, error } = await sb.from("invoice_payments").select("id").gte("paid_on", from).lte("paid_on", goal.period_end).limit(1000);
      return error ? null : (data ?? []).length;
    }
  } catch {
    return null;
  }
  // Site visitors and days-unpaid have no counter wired up yet.
  return null;
}

export async function buildBrief(sb: SupabaseClient, sinceIso: string): Promise<Brief> {
  const today = chicagoDate();
  const [bizRes, agentRes, stateRes, actionRes, ruleRes, runRes, steps, spend, context] = await Promise.all([
    sb.from("ai_businesses").select("*"),
    sb.from("ai_agents").select("*"),
    sb.from("ai_crew_state").select("paused").limit(1).maybeSingle(),
    sb.from("ai_actions").select("id, title, status, proposed_by, created_at").eq("status", "proposed").eq("proposed_by", "ai").order("created_at", { ascending: false }).limit(20),
    sb.from("ai_rules").select("id, text, created_at").eq("active", true).order("created_at", { ascending: false }),
    sb.from("ai_runs").select("id, agent_id, status, trigger").in("status", ["running", "waiting"]).eq("trigger", "shift"),
    loadStepsSince(sb, sinceIso, 400),
    spendCentsToday(sb),
    buildAdvisorContext(sb).catch(() => null),
  ]);
  if (bizRes.error) fail("Could not load the business", bizRes.error);
  if (agentRes.error) fail("Could not load the crew", agentRes.error);

  const businesses = (bizRes.data ?? []) as Business[];
  const business = businesses.find((b) => b.mode === "launch") ?? businesses[0] ?? null;
  const agents = (agentRes.data ?? []) as Agent[];
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));

  const goals: Goal[] = business
    ? (((await sb.from("ai_goals").select("*").eq("business_id", business.id).gte("period_end", today)).data ?? []) as Goal[])
    : [];
  const targets = await Promise.all(goals.map(async (g) => ({ metric: g.metric, current: await progress(sb, g), target: g.target })));

  const open = (runRes.data ?? []) as Pick<Run, "id" | "agent_id">[];
  const crew = await Promise.all(
    agents
      .filter((a) => a.slug !== "tess")
      .map(async (a) => {
        const run = open.find((r) => r.agent_id === a.id);
        let doing: string | null = null;
        if (run) {
          const { data } = await sb.from("ai_steps").select("summary, created_at").eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          doing = (data as Pick<Step, "summary"> | null)?.summary ?? "starting a shift";
        }
        return { slug: a.slug, name: a.name, doing, working: Boolean(run), paused: Boolean(a.paused) };
      })
  );

  return {
    asOf: new Date().toISOString(),
    since: sinceIso,
    business: business ? { id: business.id, name: business.name, mode: business.mode, hasPlaybook: Boolean(business.playbook?.sellsTo) } : null,
    setupNeeded: !business || business.mode === "setup",
    noTarget: business?.mode === "launch" && targets.length === 0,
    crewPaused: Boolean(stateRes.data?.paused),
    didWhileOut: steps.filter((s) => s.kind !== "read").map((s) => ({ agent: nameOf.get(s.agent_id) ?? "A bot", summary: s.summary, kind: s.kind, at: s.created_at })),
    needsJohn: ((actionRes.data ?? []) as { id: string; title: string }[]).map((a) => ({ id: a.id, title: a.title })),
    targets,
    crew,
    spendCentsToday: spend,
    capCents: business?.caps?.spendCentsPerDay ?? 0,
    rulesCount: (ruleRes.data ?? []).length,
    rules: ((ruleRes.data ?? []) as { text: string }[]).slice(0, 6).map((r) => r.text),
    snapshot: context?.snapshot ?? "",
  };
}

const KIND_WORD: Record<StepKind, string> = { read: "looked up", act: "did", refused: "was stopped", needs_john: "raised for John", report: "reported" };

/** The brief as Tess reads it. */
export function briefText(brief: Brief): string {
  const lines: string[] = [`Brief as of ${brief.asOf}. John was last here at ${brief.since}.`];

  if (brief.setupNeeded) {
    lines.push(
      brief.business?.hasPlaybook
        ? "This business has a saved playbook that John has not confirmed, so there is no confirmed playbook and nothing can be sent. Read it back to him briefly and tell him to press Confirm playbook, or change it if he asks."
        : "This business has no confirmed playbook, so nothing can be sent. Your first job is the setup interview."
    );
  }
  if (brief.noTarget) lines.push("There is no target for the current period, so the crew is not running shifts. Tell John, ask him for this month's target, and save it with set_target.");
  if (brief.crewPaused) lines.push("The whole crew is paused by John.");

  lines.push("", "What the crew did since John was last here:");
  if (!brief.didWhileOut.length) lines.push("- Nothing. No bot took any action.");
  for (const d of brief.didWhileOut.slice(-40)) lines.push(`- ${d.agent} ${KIND_WORD[d.kind]}: ${d.summary}`);

  lines.push("", "Waiting on John:");
  if (!brief.needsJohn.length) lines.push("- Nothing.");
  for (const n of brief.needsJohn) lines.push(`- ${n.title}`);

  lines.push("", "This period's targets:");
  if (!brief.targets.length) lines.push("- None set.");
  for (const t of brief.targets) lines.push(`- ${t.metric.replace(/_/g, " ")}: ${t.current === null ? "not measured yet" : t.current} of ${t.target}`);

  lines.push("", "The crew right now:");
  for (const c of brief.crew) lines.push(`- ${c.name}: ${c.paused ? "paused" : c.working ? `working (${c.doing})` : "idle"}`);

  lines.push("", `AI spend today: $${(brief.spendCentsToday / 100).toFixed(2)} of a $${(brief.capCents / 100).toFixed(2)} daily limit. Standing rules: ${brief.rulesCount}.`);
  if (brief.snapshot) lines.push("", "Business snapshot:", brief.snapshot);
  return lines.join("\n");
}
