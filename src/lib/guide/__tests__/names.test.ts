import { describe, expect, it } from "vitest";
import { ASK_AGAIN_CLIP, BACK_CLIP, COMMON_NAMES, greetingClips, nameClip, nameKey } from "../names";
import { clipName, GUIDE_STEPS } from "../script";

describe("greeting a returning visitor by name", () => {
  it("finds the recording for a common first name, however it was typed", () => {
    expect(nameClip("John")).toEqual({ id: "back-john", say: "Welcome back, John." });
    expect(nameClip("  JOHN c. Hockinson Jr.")?.id).toBe("back-john");
    expect(nameClip("maria lopez")?.say).toBe("Welcome back, Maria.");
  });

  it("has no recording for a name that is not common, a nickname she was not given, or nothing", () => {
    expect(nameClip("Natosha")).toBeNull();
    expect(nameClip("Zebulon Pike")).toBeNull();
    expect(nameClip("")).toBeNull();
    expect(nameClip(null)).toBeNull();
    expect(nameClip("123")).toBeNull();
  });

  it("reads only the first word, in lower case, letters only", () => {
    expect(nameKey("Mary-Ann Smith")).toBe("maryann");
    expect(nameKey("O'Brien")).toBe("obrien");
    expect(nameKey(undefined)).toBe("");
  });

  it("lists each name once", () => {
    expect(new Set(COMMON_NAMES.map((n) => n.toLowerCase())).size).toBe(COMMON_NAMES.length);
    expect(COMMON_NAMES.length).toBeGreaterThan(200);
  });

  it("has a plain welcome back and a plain first question for everyone else", () => {
    expect(BACK_CLIP.say).toBe("Welcome back.");
    expect(ASK_AGAIN_CLIP.say).toBe("What brought you here today?");
  });

  it("gives every recording its own file, none clashing with the script's", () => {
    const all = [...GUIDE_STEPS, ...greetingClips()];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map(clipName)).size).toBe(all.length);
    expect(greetingClips()).toHaveLength(COMMON_NAMES.length + 2);
  });
});
