import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAccess, readLogin, signAccess, signLogin } from "../access-token";
import { COURSES, allLessons, canRead, forSale, getCourse, gradeQuiz, hasFullAccess } from "../catalog";
import { MAGNETS } from "@/lib/forms/email-content";
import { VOLUMES } from "../library";

const KEY = "test-academy-secret";

describe("academy access tokens", () => {
  beforeEach(() => {
    process.env.ACADEMY_ACCESS_SECRET = KEY;
  });
  afterEach(() => {
    delete process.env.ACADEMY_ACCESS_SECRET;
  });

  it("round-trips an access cookie with a normalized email and unique courses", () => {
    const token = signAccess("  Student@Example.COM ", ["speak-method", "speak-method", "ai-workforce"])!;
    expect(readAccess(token)).toEqual({ email: "student@example.com", courses: ["ai-workforce", "speak-method"] });
  });

  it("rejects a tampered access cookie", () => {
    const token = signAccess("a@b.co", ["speak-method"])!;
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "access", e: "a@b.co", c: ["speak-method", "saas-with-ai"], iat: 1 })).toString("base64url");
    expect(readAccess(`${forged}.${mac}`)).toBeNull();
    expect(readAccess(`${body}.${mac}x`)).toBeNull();
    expect(readAccess("garbage")).toBeNull();
    expect(readAccess(undefined)).toBeNull();
  });

  it("rejects a token signed with another key", () => {
    const token = signAccess("a@b.co", ["speak-method"])!;
    process.env.ACADEMY_ACCESS_SECRET = "rotated";
    expect(readAccess(token)).toBeNull();
  });

  it("keeps login links and access cookies apart", () => {
    const login = signLogin("a@b.co", 3600)!;
    const access = signAccess("a@b.co", ["speak-method"])!;
    expect(readAccess(login)).toBeNull();
    expect(readLogin(access)).toBeNull();
    expect(readLogin(login)).toBe("a@b.co");
  });

  it("expires login links", () => {
    const now = Date.now();
    const login = signLogin("a@b.co", 60, now)!;
    expect(readLogin(login, now + 59_000)).toBe("a@b.co");
    expect(readLogin(login, now + 61_000)).toBeNull();
  });

  it("signs nothing without a key", () => {
    delete process.env.ACADEMY_ACCESS_SECRET;
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(signAccess("a@b.co", ["x"])).toBeNull();
    if (saved) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });
});

describe("academy catalog rules", () => {
  const speak = getCourse("speak-method")!;
  const intro = getCourse("intro-to-ai")!;

  it("opens previews to everyone and the rest only to enrolled students", () => {
    const [first, , third] = allLessons(speak);
    expect(canRead(speak, first)).toBe(true);
    expect(canRead(speak, third)).toBe(false);
    expect(canRead(speak, third, new Set(["speak-method"]))).toBe(true);
    expect(canRead(speak, third, new Set(["ai-workforce"]))).toBe(false);
    expect(hasFullAccess(speak, new Set(["speak-method"]))).toBe(true);
  });

  it("opens every lesson of a free open course", () => {
    expect(allLessons(intro).every((l) => canRead(intro, l))).toBe(true);
    expect(hasFullAccess(intro)).toBe(true);
  });

  it("only sells paid courses that are open", () => {
    expect(forSale(intro)).toBe(false);
    expect(forSale({ ...speak, status: "waitlist" })).toBe(false);
    expect(forSale({ ...speak, status: "open" })).toBe(true);
  });

  it("grades the knowledge check against the pass mark", () => {
    const quiz = speak.quiz!;
    const right = quiz.questions.map((q) => q.answer);
    expect(gradeQuiz(speak, right)).toMatchObject({ score: 100, passed: true });

    const twoWrong = right.map((a, i) => (i < 2 ? (a + 1) % quiz.questions[i].options.length : a));
    expect(gradeQuiz(speak, twoWrong)).toMatchObject({ score: 80, passed: true });

    const threeWrong = right.map((a, i) => (i < 3 ? (a + 1) % quiz.questions[i].options.length : a));
    expect(gradeQuiz(speak, threeWrong)).toMatchObject({ score: 70, passed: false });

    expect(gradeQuiz(speak, right.slice(1))).toBeNull();
    expect(gradeQuiz(speak, "nope")).toBeNull();
    expect(gradeQuiz(intro, [])).toBeNull();
  });

  it("keeps every quiz answer inside its options", () => {
    for (const course of COURSES) {
      for (const q of course.quiz?.questions ?? []) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
      }
    }
  });

  it("has unique course and lesson slugs", () => {
    const slugs = COURSES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COURSES) {
      const lessons = allLessons(c).map((l) => l.slug);
      expect(new Set(lessons).size).toBe(lessons.length);
      expect(lessons).not.toContain("check");
    }
  });

  it("only lists library volumes whose download exists", () => {
    for (const v of VOLUMES) {
      if (v.magnet) expect(MAGNETS[v.magnet]).toBeDefined();
    }
  });
});
