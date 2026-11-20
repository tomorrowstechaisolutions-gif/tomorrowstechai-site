import type { StationId } from "@/lib/crew/stations";
import type { StepKind } from "@/lib/crew/types";

/**
 * Turning the crew's step log into what the floor shows.
 *
 * Pure functions, no drawing. A bot on the floor moves only because a step
 * says it did something somewhere: nothing here invents motion.
 */

/** The fields of a step the floor uses. */
export type FloorStep = {
  id: string;
  run_id: string;
  agent_id: string;
  seq: number;
  kind: StepKind;
  tool: string;
  station: StationId | null;
  summary: string;
  created_at: string;
  payload?: Record<string, unknown> | null;
};

export type Move = { id: string; agentId: string; station: StationId | null; summary: string; kind: StepKind; at: number };

const MIN_GAP_MS = 900;
const MAX_GAP_MS = 4000;

function inOrder(steps: FloorStep[]): FloorStep[] {
  return [...steps].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.run_id === b.run_id ? a.seq - b.seq : 0));
}

/** One move per step that happened at a station, oldest first. */
export function planMoves(steps: FloorStep[]): Move[] {
  return inOrder(steps)
    .filter((s) => s.station !== null)
    .map((s) => ({ id: s.id, agentId: s.agent_id, station: s.station, summary: s.summary, kind: s.kind, at: Date.parse(s.created_at) }));
}

/** What the floor plays: every move, plus each end-of-shift report, which is made to the lead (no station). */
export function floorFeed(steps: FloorStep[]): Move[] {
  return inOrder(steps)
    .filter((s) => s.station !== null || s.kind === "report")
    .map((s) => ({ id: s.id, agentId: s.agent_id, station: s.station, summary: s.summary, kind: s.kind, at: Date.parse(s.created_at) }));
}

/** The steps of the most recent run that ended with a report. */
export function lastShift(steps: FloorStep[]): FloorStep[] {
  const reports = inOrder(steps).filter((s) => s.kind === "report");
  const latest = reports[reports.length - 1];
  if (!latest) return [];
  return inOrder(steps.filter((s) => s.run_id === latest.run_id));
}

/** How long to wait before each move in a replay: the real gap, kept between a moment and four seconds. */
export function replayDelays(moves: Move[]): number[] {
  return moves.map((m, i) => (i === 0 ? 0 : Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, m.at - moves[i - 1].at))));
}
