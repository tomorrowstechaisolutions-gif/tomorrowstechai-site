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
 * Who can read a lesson's body.
 *
 * Today: preview lessons, and every lesson in a free course that is open.
 * Paid lessons stay locked until enrollment and payment are switched on; that
 * check belongs here, so every page that shows a lesson gets it at once.
 */
export function canRead(course: Course, lesson: Lesson): boolean {
  if (lesson.preview) return true;
  return course.price.kind === "free" && course.status === "open";
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
