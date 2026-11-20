import type { TessState } from "./TessCore";

/** The continuous sound under a state: her own drifting world, her thinking, or silence. */
export type SoundBed = "idle" | "thinking" | "none";
export type SoundPlan = { chirp: "up" | "down" | null; bed: SoundBed };

/**
 * What Tess should sound like when she moves from one state to the next.
 * Listening and speaking are silent underneath: the microphone must hear only
 * John, and nothing should sit under her own voice.
 */
export function soundPlan(prev: TessState, next: TessState): SoundPlan {
  const bed: SoundBed = next === "idle" ? "idle" : next === "thinking" ? "thinking" : "none";
  if (prev === next) return { chirp: null, bed };
  if (next === "listening") return { chirp: "up", bed };
  if (prev === "listening") return { chirp: "down", bed };
  return { chirp: null, bed };
}
