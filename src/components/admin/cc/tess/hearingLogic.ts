/**
 * The decisions behind hearing John through a recording: when he has
 * finished talking, and what the transcription service said. No browser or
 * server code here, so both sides can use it and it can be tested.
 */

export const HEAR_LIMITS = {
  /** Loudness (0 to 1) above which a moment counts as speech. Raise it in a noisy room. */
  speechLevel: 0.03,
  /** How long he must be quiet, after speaking, before a tapped recording sends itself. */
  quietMs: 1500,
  /** How long a tapped recording waits for him to start before giving up. */
  waitForSpeechMs: 8000,
  /** No recording runs longer than this. */
  maxMs: 120_000,
  /** Smaller than this is a click, not speech. */
  minBytes: 800,
  /** About two minutes of compressed audio, with room to spare. */
  maxBytes: 6_000_000,
};

export type ListenState = { startedAt: number; spoke: boolean; quietSince: number | null };

export const newListen = (now: number): ListenState => ({ startedAt: now, spoke: false, quietSince: null });

/**
 * One reading of the microphone level. "tap" stops by itself when he goes
 * quiet; "hold" runs until he lets go of the space bar. Both stop at the
 * length limit.
 */
export function listenStep(state: ListenState, level: number, now: number, mode: "tap" | "hold"): { state: ListenState; stop: boolean } {
  const loud = level >= HEAR_LIMITS.speechLevel;
  const next: ListenState = loud ? { ...state, spoke: true, quietSince: null } : { ...state, quietSince: state.quietSince ?? now };
  if (now - state.startedAt >= HEAR_LIMITS.maxMs) return { state: next, stop: true };
  if (mode === "hold") return { state: next, stop: false };
  if (!next.spoke) return { state: next, stop: now - state.startedAt >= HEAR_LIMITS.waitForSpeechMs };
  return { state: next, stop: next.quietSince !== null && now - next.quietSince >= HEAR_LIMITS.quietMs };
}

/** The words from the transcription service's answer, or "" when there are none. */
export function heardText(payload: unknown): string {
  const text = payload && typeof payload === "object" ? (payload as { text?: unknown }).text : null;
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}
