/**
 * How Tess's words are shown on her screen: which style, and how long they
 * stay up after she goes quiet. A per-browser choice, kept in localStorage
 * like the sound switch. The decisions are here, apart from the page, so
 * they can be tested.
 */

export const TEXT_STYLES = [
  { id: "classic", label: "Classic" },
  { id: "comic", label: "Comic" },
  { id: "tech", label: "Tech" },
  { id: "hidden", label: "Hidden" },
] as const;
export type TextStyle = (typeof TEXT_STYLES)[number]["id"];

export const FADE_OPTIONS = [
  { seconds: 0, label: "Never" },
  { seconds: 10, label: "10s" },
  { seconds: 20, label: "20s" },
  { seconds: 60, label: "1 min" },
] as const;

export type TextPrefs = { style: TextStyle; fadeSeconds: number };
export const DEFAULT_TEXT_PREFS: TextPrefs = { style: "classic", fadeSeconds: 20 };

export const TEXT_KEY = "tess-text";
/** The style to go back to when the text is switched on again. */
export const TEXT_PREV_KEY = "tess-text-prev";
export const TEXT_EVENT = "tess-text-change";

/** What was saved in the browser, or the defaults for anything missing or unrecognised. */
export function parseTextPrefs(raw: string | null): TextPrefs {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
  } catch {
    /* not JSON: use the defaults */
  }
  const style = TEXT_STYLES.some((s) => s.id === saved.style) ? (saved.style as TextStyle) : DEFAULT_TEXT_PREFS.style;
  const fadeSeconds = FADE_OPTIONS.some((o) => o.seconds === saved.fadeSeconds) ? (saved.fadeSeconds as number) : DEFAULT_TEXT_PREFS.fadeSeconds;
  return { style, fadeSeconds };
}

/**
 * Whether her words should have faded off the screen. They stay while
 * anything is happening, and when John has brought them back.
 */
export function textFaded(s: { fadeSeconds: number; busy: boolean; listening: boolean; speaking: boolean; pinned: boolean; idleForMs: number }): boolean {
  if (!s.fadeSeconds || s.busy || s.listening || s.speaking || s.pinned) return false;
  return s.idleForMs >= s.fadeSeconds * 1000;
}
