import { describe, expect, it } from "vitest";
import { nothingHeardNotice, spaceBarTalks } from "../speechLogic";
import { BACKGROUNDS, backgroundPlan, DEFAULT_BACKGROUND, parseBackground, playsWhileHidden, soundPlan } from "../soundPlan";

describe("holding the space bar to talk", () => {
  it("talks when nothing is focused", () => {
    expect(spaceBarTalks(null)).toBe(true);
    expect(spaceBarTalks({ tagName: "BODY" })).toBe(true);
  });

  it("still talks after John has clicked a button", () => {
    expect(spaceBarTalks({ tagName: "BUTTON" })).toBe(true);
  });

  it("types a space instead while he is writing", () => {
    expect(spaceBarTalks({ tagName: "INPUT" })).toBe(false);
    expect(spaceBarTalks({ tagName: "TEXTAREA" })).toBe(false);
    expect(spaceBarTalks({ tagName: "SELECT" })).toBe(false);
    expect(spaceBarTalks({ tagName: "DIV", isContentEditable: true })).toBe(false);
  });
});

describe("when listening ends with nothing heard", () => {
  it("says so instead of going quiet", () => {
    expect(nothingHeardNotice("", false)).toMatch(/did not catch/i);
  });

  it("says nothing when words were heard", () => {
    expect(nothingHeardNotice("hello Tess", false)).toBeNull();
  });

  it("does not talk over a real error", () => {
    expect(nothingHeardNotice("", true)).toBeNull();
  });
});

describe("the sound Tess makes in each state", () => {
  it("drifts in her own world while waiting", () => {
    expect(soundPlan("speaking", "idle")).toEqual({ chirp: null, bed: "idle" });
  });

  it("chirps up and goes quiet to listen, so the microphone hears only John", () => {
    expect(soundPlan("idle", "listening")).toEqual({ chirp: "up", bed: "none" });
  });

  it("chirps down when she stops listening and starts thinking", () => {
    expect(soundPlan("listening", "thinking")).toEqual({ chirp: "down", bed: "thinking" });
  });

  it("thinks out loud without a chirp when the message was typed", () => {
    expect(soundPlan("idle", "thinking")).toEqual({ chirp: null, bed: "thinking" });
  });

  it("makes no other sound while she is speaking", () => {
    expect(soundPlan("thinking", "speaking")).toEqual({ chirp: null, bed: "none" });
  });

  it("does not chirp again when nothing changed", () => {
    expect(soundPlan("listening", "listening")).toEqual({ chirp: null, bed: "none" });
  });
});

describe("the background sound John picks", () => {
  it("offers her own ambience, the two focus tones, and none", () => {
    expect(BACKGROUNDS.map((b) => b.id)).toEqual(["ambient", "gamma40", "beta15", "off"]);
    expect(DEFAULT_BACKGROUND).toBe("ambient");
  });

  it("falls back to her ambience for anything it does not recognise", () => {
    expect(parseBackground("gamma40")).toBe("gamma40");
    expect(parseBackground("whale-song")).toBe("ambient");
    expect(parseBackground(null)).toBe("ambient");
  });

  it("her ambience hums and chimes only while she waits", () => {
    expect(backgroundPlan("ambient", "idle")).toEqual({ hum: true, chimes: true, beatHz: null });
    expect(backgroundPlan("ambient", "thinking")).toEqual({ hum: false, chimes: false, beatHz: null });
  });

  it("the 40 Hz tone beats at 40, with no hum or chimes over it", () => {
    expect(backgroundPlan("gamma40", "idle")).toEqual({ hum: false, chimes: false, beatHz: 40 });
  });

  it("the 15 Hz tone beats at 15", () => {
    expect(backgroundPlan("beta15", "idle")).toEqual({ hum: false, chimes: false, beatHz: 15 });
  });

  it("a focus tone carries on while she thinks, so it does not keep cutting out", () => {
    expect(backgroundPlan("gamma40", "thinking").beatHz).toBe(40);
  });

  it("a focus tone stops while she listens or speaks", () => {
    expect(backgroundPlan("gamma40", "none").beatHz).toBeNull();
    expect(backgroundPlan("beta15", "none").beatHz).toBeNull();
  });

  it("none means no background at all", () => {
    expect(backgroundPlan("off", "idle")).toEqual({ hum: false, chimes: false, beatHz: null });
  });

  it("only a focus tone keeps playing when John switches to another tab", () => {
    expect(playsWhileHidden("gamma40")).toBe(true);
    expect(playsWhileHidden("beta15")).toBe(true);
    expect(playsWhileHidden("ambient")).toBe(false);
    expect(playsWhileHidden("off")).toBe(false);
  });
});
