import { describe, expect, it } from "vitest";
import { CREW_EFFORT, CREW_MODEL, TESS_EFFORT, TESS_MODEL } from "../models";

describe("crew models", () => {
  it("pins the two crew models with no date suffix", () => {
    expect(TESS_MODEL).toBe("claude-opus-5-5");
    expect(CREW_MODEL).toBe("claude-sonnet-5-5");
  });

  it("sets effort explicitly for both", () => {
    expect(TESS_EFFORT).toBe("medium");
    expect(CREW_EFFORT).toBe("low");
  });
});
