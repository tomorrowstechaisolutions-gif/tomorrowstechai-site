import { BACKGROUND_EVENT, BACKGROUND_KEY, BACKGROUNDS, type Background } from "./soundPlan";
import { FADE_OPTIONS, parseTextPrefs, TEXT_EVENT, TEXT_KEY, TEXT_STYLES, type TextStyle } from "./textPrefs";

/**
 * The settings that live in John's browser, not on the server: the
 * background sound, how her words are shown, and whether sound is on. Tess
 * can change them when he asks: her tool call names the change, the chat
 * route passes it to the page, and the page applies it here.
 */

export const SOUND_KEY = "tess-sound";
export const SOUND_EVENT = "tess-sound-change";

export type ScreenChange = { background?: Background; textStyle?: TextStyle; fadeSeconds?: number; sound?: boolean };

/** The tool that carries these changes, and the fields of its input that are screen settings. */
export const SETTINGS_TOOL = "change_settings";

/** The screen settings in a tool input, keeping only values that exist. Null when there are none. */
export function cleanScreenChange(input: unknown): ScreenChange | null {
  const given = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const change: ScreenChange = {};
  if (BACKGROUNDS.some((b) => b.id === given.background)) change.background = given.background as Background;
  if (TEXT_STYLES.some((s) => s.id === given.text_style)) change.textStyle = given.text_style as TextStyle;
  if (FADE_OPTIONS.some((o) => o.seconds === given.text_fade_seconds)) change.fadeSeconds = given.text_fade_seconds as number;
  if (given.sound === "on" || given.sound === "off") change.sound = given.sound === "on";
  return Object.keys(change).length ? change : null;
}

/** The screen change Tess asked for in one reply, read from its tool calls. */
export function screenChangeFromMessage(content: unknown): ScreenChange | null {
  if (!Array.isArray(content)) return null;
  let merged: ScreenChange | null = null;
  for (const block of content as { type?: string; name?: string; input?: unknown }[]) {
    if (block?.type !== "tool_use" || block.name !== SETTINGS_TOOL) continue;
    const change = cleanScreenChange(block.input);
    if (change) merged = { ...(merged ?? {}), ...change };
  }
  return merged;
}

/** Apply a change in this browser. The page's own listeners pick it up, exactly as if John had pressed the control. */
export function applyScreenChange(change: ScreenChange): void {
  const set = (key: string, value: string, event: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode: the change lasts for this page only */
    }
    window.dispatchEvent(new Event(event));
  };
  if (change.background) set(BACKGROUND_KEY, change.background, BACKGROUND_EVENT);
  if (change.sound !== undefined) set(SOUND_KEY, change.sound ? "on" : "off", SOUND_EVENT);
  if (change.textStyle || change.fadeSeconds !== undefined) {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(TEXT_KEY);
    } catch {
      /* fall back to the defaults */
    }
    const now = parseTextPrefs(saved);
    set(TEXT_KEY, JSON.stringify({ style: change.textStyle ?? now.style, fadeSeconds: change.fadeSeconds ?? now.fadeSeconds }), TEXT_EVENT);
  }
}
