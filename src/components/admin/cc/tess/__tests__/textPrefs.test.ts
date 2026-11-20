import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_PREFS, FADE_OPTIONS, parseTextPrefs, TEXT_STYLES, textFaded } from "../textPrefs";

describe("how Tess's words are shown", () => {
  it("offers three styles plus hidden", () => {
    expect(TEXT_STYLES.map((s) => s.id)).toEqual(["classic", "comic", "tech", "hidden"]);
  });

  it("starts as it looks today, fading after a little while", () => {
    expect(DEFAULT_TEXT_PREFS.style).toBe("classic");
    expect(DEFAULT_TEXT_PREFS.fadeSeconds).toBeGreaterThan(0);
    expect(FADE_OPTIONS.map((o) => o.seconds)).toContain(0);
  });

  it("reads back what was saved", () => {
    expect(parseTextPrefs(JSON.stringify({ style: "comic", fadeSeconds: 60 }))).toEqual({ style: "comic", fadeSeconds: 60 });
  });

  it("falls back to the defaults for anything it does not recognise", () => {
    expect(parseTextPrefs(null)).toEqual(DEFAULT_TEXT_PREFS);
    expect(parseTextPrefs("not json")).toEqual(DEFAULT_TEXT_PREFS);
    expect(parseTextPrefs(JSON.stringify({ style: "papyrus", fadeSeconds: 7 }))).toEqual(DEFAULT_TEXT_PREFS);
  });
});

describe("when her words fade away", () => {
  const base = { fadeSeconds: 20, busy: false, listening: false, speaking: false, pinned: false };

  it("stay up while she is still answering, speaking, or John is talking", () => {
    expect(textFaded({ ...base, busy: true, idleForMs: 60_000 })).toBe(false);
    expect(textFaded({ ...base, speaking: true, idleForMs: 60_000 })).toBe(false);
    expect(textFaded({ ...base, listening: true, idleForMs: 60_000 })).toBe(false);
  });

  it("fade once she has been quiet for the chosen time", () => {
    expect(textFaded({ ...base, idleForMs: 19_000 })).toBe(false);
    expect(textFaded({ ...base, idleForMs: 20_000 })).toBe(true);
  });

  it("never fade when fading is switched off", () => {
    expect(textFaded({ ...base, fadeSeconds: 0, idleForMs: 3_600_000 })).toBe(false);
  });

  it("stay up when John has brought them back", () => {
    expect(textFaded({ ...base, pinned: true, idleForMs: 3_600_000 })).toBe(false);
  });
});
