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

/**
 * What plays in the background while Tess is not listening or speaking.
 * "ambient" is her own hum and chimes. The two focus tones are binaural
 * beats: a slightly different pitch in each ear, which the brain hears as a
 * pulse at the difference. They only work as intended on headphones. They
 * are John's choice of working sound, not a treatment for anything.
 */
export const BACKGROUNDS = [
  { id: "ambient", label: "Ambient", note: "Her own hum and soft chimes." },
  { id: "gamma40", label: "40 Hz", note: "Gamma. A 40 Hz binaural beat. Use headphones." },
  { id: "beta15", label: "15 Hz", note: "Beta. A 15 Hz binaural beat. Use headphones." },
  { id: "off", label: "None", note: "No background sound." },
] as const;
export type Background = (typeof BACKGROUNDS)[number]["id"];
export const DEFAULT_BACKGROUND: Background = "ambient";
export const BACKGROUND_KEY = "tess-background";
export const BACKGROUND_EVENT = "tess-background-change";

const BEAT_HZ: Partial<Record<Background, number>> = { gamma40: 40, beta15: 15 };

export function parseBackground(raw: string | null): Background {
  return BACKGROUNDS.some((b) => b.id === raw) ? (raw as Background) : DEFAULT_BACKGROUND;
}

/**
 * What the chosen background does under a given bed. A focus tone carries on
 * while she thinks so it does not keep cutting in and out, and stops while
 * she listens or speaks.
 */
export function backgroundPlan(background: Background, bed: SoundBed): { hum: boolean; chimes: boolean; beatHz: number | null } {
  const beat = BEAT_HZ[background];
  if (beat) return { hum: false, chimes: false, beatHz: bed === "none" ? null : beat };
  const ambient = background === "ambient" && bed === "idle";
  return { hum: ambient, chimes: ambient, beatHz: null };
}

/** A focus tone is for working to, so it keeps going when John looks at another tab. Her ambience does not. */
export function playsWhileHidden(background: Background): boolean {
  return Boolean(BEAT_HZ[background]);
}
