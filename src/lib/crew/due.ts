import type { Agent, Run } from "./types";

/** A run in one of these states is still the bot's current piece of work. */
const UNFINISHED: Run["status"][] = ["running", "waiting", "paused_budget"];

/**
 * Which bots should start a shift now.
 *
 * A bot is due when it has a schedule, is not paused, has no shift still in
 * progress, and its last shift started longer ago than its interval. Tess has
 * no schedule: she runs when John talks to her.
 */
export function dueAgents(agents: Agent[], runs: Pick<Run, "agent_id" | "status">[], now: number): Agent[] {
  const busy = new Set(runs.filter((r) => UNFINISHED.includes(r.status)).map((r) => r.agent_id));
  return agents.filter((a) => {
    if (!a.schedule_minutes || a.paused || busy.has(a.id)) return false;
    if (!a.last_shift_at) return true;
    return now - new Date(a.last_shift_at).getTime() >= a.schedule_minutes * 60_000;
  });
}
