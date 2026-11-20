import { describe, expect, it } from "vitest";
import { nothingHeardNotice, spaceBarTalks } from "../speechLogic";
import { soundPlan } from "../soundPlan";

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
