import type { Course, Lesson, LevelId, Module, Price } from "./types";
import { introToAi } from "./courses/intro-to-ai";
import { speakMethod } from "./courses/speak-method";
import {
  aiBuilderProgram,
  aiForSmallBusiness,
  aiWorkforce,
  automationMasterclass,
  humanAdvantage,
  saasWithAi,
  websitesWithAi,
} from "./courses/roadmap";

/**
 * Every course in the Academy, in the order the catalog shows them.
 * To add a course: create its file in ./courses, import it, and list it here.
 */
export const COURSES: Course[] = [
  introToAi,
  speakMethod,
  aiWorkforce,
  aiForSmallBusiness,
  humanAdvantage,
  websitesWithAi,
  automationMasterclass,
  saasWithAi,
  aiBuilderProgram,
];

export function getCourse(slug: string): Course | undefined {
  return COURSES.find((c) => c.slug === slug);
}

export function coursesAtLevel(level: LevelId): Course[] {
  return COURSES.filter((c) => c.level === level);
}

export function flagshipCourse(): Course | undefined {
  return COURSES.find((c) => c.flagship);
}

export function allLessons(course: Course): Lesson[] {
  return (course.modules ?? []).flatMap((m) => m.lessons);
}

export type LessonPosition = {
  lesson: Lesson;
  module: Module;
  index: number;
  total: number;
  prev?: Lesson;
  next?: Lesson;
};

export function findLesson(course: Course, slug: string): LessonPosition | undefined {
  const lessons = allLessons(course);
  const index = lessons.findIndex((l) => l.slug === slug);
  if (index < 0) return undefined;
  const lesson = lessons[index];
  const parent = (course.modules ?? []).find((m) => m.lessons.includes(lesson))!;
  return { lesson, module: parent, index, total: lessons.length, prev: lessons[index - 1], next: lessons[index + 1] };
}

/**
 * Who can read a lesson's body: preview lessons, every lesson in a free
 * course that is open, and every lesson in a course the visitor bought
 * (`access` holds the course slugs from their signed Academy cookie).
 * Leave `access` out for the public view (sitemap, search).
 */
export function canRead(course: Course, lesson: Lesson, access?: ReadonlySet<string>): boolean {
  if (lesson.preview) return true;
  if (access?.has(course.slug)) return true;
  return course.price.kind === "free" && course.status === "open";
}

/** True when the visitor can open every lesson (and so take the knowledge check). */
export function hasFullAccess(course: Course, access?: ReadonlySet<string>): boolean {
  if (access?.has(course.slug)) return true;
  return course.price.kind === "free" && course.status === "open";
}

/** Can people buy this course right now? */
export function forSale(course: Course): boolean {
  return course.price.kind === "paid" && course.status === "open";
}

export type GradedAnswer = { correct: boolean; answer: number; why: string };

/** Grades a knowledge check. `answers[i]` is the option index chosen for question i. */
export function gradeQuiz(course: Course, answers: unknown): { score: number; passed: boolean; results: GradedAnswer[] } | null {
  const quiz = course.quiz;
  if (!quiz || !Array.isArray(answers) || answers.length !== quiz.questions.length) return null;
  const results = quiz.questions.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, why: q.why }));
  const score = Math.round((results.filter((r) => r.correct).length / quiz.questions.length) * 100);
  return { score, passed: score >= quiz.pass, results };
}

export function totalMinutes(course: Course): number {
  return allLessons(course).reduce((sum, l) => sum + l.minutes, 0);
}

export function priceLabel(price: Price): string {
  if (price.kind === "free") return "Free";
  if (price.kind === "tbd") return "Pricing soon";
  return `$${price.amount}`;
}

export const STATUS_LABEL: Record<Course["status"], string> = {
  open: "Open now",
  waitlist: "Founding students",
  planned: "In development",
};
