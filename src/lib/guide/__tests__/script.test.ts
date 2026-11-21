import { describe, expect, it } from "vitest";
import { clipName, GUIDE_START, GUIDE_STEPS, guideOfferSlugs, guideStep, nextStep, pathSummary, scriptProblems, type GuideStep } from "../script";

describe("the site guide's script", () => {
  it("is sound: every answer leads somewhere, every step can be reached, nothing loops", () => {
    expect(scriptProblems()).toEqual([]);
  });

  it("opens by asking what brought the visitor here", () => {
    const start = guideStep(GUIDE_START);
    expect(start?.kind).toBe("question");
    expect(start?.say).toMatch(/what brought you here/i);
  });

  it("reaches a recommendation in at most three questions, whatever is picked", () => {
    const depth = (id: string): number => {
      const s = guideStep(id)!;
      return s.kind === "question" ? 1 + Math.max(...s.options.map((o) => depth(o.to))) : 0;
    };
    expect(depth(GUIDE_START)).toBeLessThanOrEqual(3);
  });

  it("moves to the step an answer points at, and nowhere for an answer that is not offered", () => {
    expect(nextStep(GUIDE_START, 0)?.id).toBe("web");
    expect(nextStep("web-size", 0)?.id).toBe("out-starter");
    expect(nextStep(GUIDE_START, 99)).toBeNull();
    expect(nextStep("out-starter", 0)).toBeNull();
    expect(nextStep("nope", 0)).toBeNull();
  });

  it("never speaks a price, because prices change and the recording does not", () => {
    for (const s of GUIDE_STEPS) expect(s.say).not.toMatch(/\$|\d+ ?(dollars|a month)/i);
  });

  it("keeps every line short enough to say in one breath or two", () => {
    for (const s of GUIDE_STEPS) expect(s.say.length).toBeLessThanOrEqual(240);
  });

  it("recommends each offer by its catalog slug, once in the list", () => {
    const slugs = guideOfferSlugs();
    expect(slugs).toContain("website-starter");
    expect(slugs).toContain("ai-operator-growth");
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("finding what is wrong with a script", () => {
  const question = (id: string, to: string[]): GuideStep => ({ kind: "question", id, say: "Q?", options: to.map((t) => ({ label: t, to: t })) });
  const outcome = (id: string): GuideStep => ({ kind: "outcome", id, say: "Done.", offer: "x", href: "/x", need: "x" });

  it("names an answer that leads nowhere", () => {
    expect(scriptProblems([question("start", ["a", "missing"]), outcome("a")]).join(" ")).toMatch(/missing/);
  });

  it("names a step nothing leads to", () => {
    expect(scriptProblems([question("start", ["a", "b"]), outcome("a"), outcome("b"), outcome("orphan")]).join(" ")).toMatch(/orphan/);
  });

  it("names a path that loops", () => {
    expect(scriptProblems([question("start", ["again", "a"]), question("again", ["start", "a"]), outcome("a")]).join(" ")).toMatch(/back to itself/);
  });

  it("needs a start question", () => {
    expect(scriptProblems([outcome("a")]).join(" ")).toMatch(/start/);
  });
});

describe("a line's recording", () => {
  it("is named for the step and its words, so rewording a line retires the old recording", () => {
    const a = clipName({ id: "start", say: "What brought you here today?" });
    expect(a).toMatch(/^start-[0-9a-f]{8}\.mp3$/);
    expect(clipName({ id: "start", say: "What brought you here today?" })).toBe(a);
    expect(clipName({ id: "start", say: "What brings you in?" })).not.toBe(a);
  });
});

describe("what goes on the lead record", () => {
  it("lists each question with the answer picked, then what she recommended", () => {
    const text = pathSummary([{ id: GUIDE_START, choice: 0 }, { id: "web", choice: 0 }, { id: "web-size", choice: 0 }], "out-starter");
    expect(text).toContain("I need a website");
    expect(text).toContain("No website yet");
    expect(text).toMatch(/Tess recommended: .*website-starter/);
  });

  it("leaves out anything that is not a real question or answer", () => {
    expect(pathSummary([{ id: "nope", choice: 0 }, { id: GUIDE_START, choice: 99 }], "nope")).toBe("");
  });
});
