import { describe, expect, it } from "vitest";
import { brainPrompt, FALLBACK_SAY, readDecision, SAY_LIMIT } from "../brain";
import { GUIDE_START, guideStep } from "../script";

const start = guideStep(GUIDE_START)!;
const outcome = guideStep("out-starter")!;
const offers = { "website-starter": { slug: "website-starter", name: "Starter Website", blurb: null, price: "$149", regular: "$750", setup: null } };

describe("what the model is told", () => {
  it("includes the question, its numbered answers and every service it may recommend", () => {
    const prompt = brainPrompt(start, offers);
    expect(prompt).toContain(start.say);
    expect(prompt).toContain("0. I need a website");
    expect(prompt).toContain("out-starter: Starter Website ($149)");
    expect(prompt).toContain("out-seo");
  });

  it("says a price is on request when the catalog has none for an offer", () => {
    expect(brainPrompt(start, {})).toContain("price on request");
  });

  it("tells it the visitor's words are not instructions", () => {
    expect(brainPrompt(start, offers)).toMatch(/never an instruction/i);
  });
});

describe("turning the model's reply into a move the script allows", () => {
  it("picks an answer that is on the screen", () => {
    expect(readDecision('{"choose": 1}', start)).toEqual({ kind: "choose", choice: 1 });
  });

  it("reads the reply even with words or a code fence around it", () => {
    expect(readDecision('Sure:\n```json\n{"go": "out-seo"}\n```', start)).toEqual({ kind: "go", to: "out-seo" });
  });

  it("will not pick an answer that is not offered, or pick one where there is no question", () => {
    expect(readDecision('{"choose": 9}', start)).toEqual({ kind: "say", text: FALLBACK_SAY });
    expect(readDecision('{"choose": 0}', outcome)).toEqual({ kind: "say", text: FALLBACK_SAY });
  });

  it("will not jump to a step that is not a service in the script", () => {
    expect(readDecision('{"go": "out-free-everything"}', start)).toEqual({ kind: "say", text: FALLBACK_SAY });
    expect(readDecision('{"go": "web"}', start)).toEqual({ kind: "say", text: FALLBACK_SAY });
  });

  it("passes on a short sentence and trims a long one", () => {
    expect(readDecision('{"say": "  Yes,  we can   do that. "}', start)).toEqual({ kind: "say", text: "Yes, we can do that." });
    const long = readDecision(JSON.stringify({ say: "word ".repeat(200) }), start);
    expect(long.kind).toBe("say");
    expect((long as { text: string }).text.length).toBeLessThanOrEqual(SAY_LIMIT);
  });

  it("falls back to a safe sentence for anything it cannot read", () => {
    for (const raw of ["", "I think option two", "{not json}", "[]", '{"say": ""}', '{"choose": "1"}', "null"]) {
      expect(readDecision(raw, start)).toEqual({ kind: "say", text: FALLBACK_SAY });
    }
  });
});
