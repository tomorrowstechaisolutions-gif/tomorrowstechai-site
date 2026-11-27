"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { IconCheck, IconLock } from "@/components/Icons";

/**
 * Lesson progress, kept in the visitor's browser.
 *
 * There are no student accounts yet, so progress lives in localStorage under
 * one key: { [courseSlug]: lessonSlug[] }. When accounts arrive this is the
 * only file that has to learn about them.
 */

const KEY = "ttai-academy-progress";
const EVENT = "ttai-academy-progress";
type Store = Record<string, string[]>;

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The serialized store, so React compares a string and not a fresh object every render. */
function useRaw(): string {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) || "{}",
    () => "{}"
  );
}

function useCompleted(course: string): string[] {
  const raw = useRaw();
  try {
    const store = JSON.parse(raw) as Store;
    return Array.isArray(store[course]) ? store[course] : [];
  } catch {
    return [];
  }
}

function setCompleted(course: string, lesson: string, done: boolean) {
  const store = read();
  const current = new Set(store[course] ?? []);
  if (done) current.add(lesson);
  else current.delete(lesson);
  store[course] = Array.from(current);
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

export function CourseProgress({ course, lessons }: { course: string; lessons: string[] }) {
  const done = useCompleted(course).filter((s) => lessons.includes(s)).length;
  const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  return (
    <div className="ac-progress" aria-label={`${done} of ${lessons.length} lessons complete`}>
      <div className="flex items-baseline justify-between mb-2 text-xs font-mono uppercase tracking-widest">
        <span className="text-[color:var(--color-text-muted)]">Your progress</span>
        <span className={done ? "text-[color:var(--color-success)]" : "text-[color:var(--color-text-muted)]"}>
          {done}/{lessons.length} · {pct}%
        </span>
      </div>
      <div className="ac-progress-track">
        <div className="ac-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export type CurriculumModule = {
  title: string;
  summary?: string;
  lessons: { slug: string; title: string; minutes: number; readable: boolean; preview: boolean }[];
};

export function Curriculum({
  course,
  modules,
  current,
  compact = false,
}: {
  course: string;
  modules: CurriculumModule[];
  current?: string;
  compact?: boolean;
}) {
  const completed = useCompleted(course);
  // Lesson numbers run across modules: module 2 starts where module 1 ended.
  const starts = modules.map((_, i) => modules.slice(0, i).reduce((sum, m) => sum + m.lessons.length, 0));
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {modules.map((m, mi) => (
        <div key={m.title}>
          <div className={compact ? "ac-kicker mb-2" : "mb-3"}>
            {compact ? m.title : <h3 className="text-lg font-medium">{m.title}</h3>}
            {!compact && m.summary && <p className="text-sm text-[color:var(--color-text-secondary)] mt-1">{m.summary}</p>}
          </div>
          <ol className="ac-lessons">
            {m.lessons.map((l, li) => {
              const n = starts[mi] + li + 1;
              const done = completed.includes(l.slug);
              const active = l.slug === current;
              return (
                <li key={l.slug}>
                  <Link
                    href={`/academy/${course}/${l.slug}`}
                    className="ac-lesson"
                    data-active={active || undefined}
                    data-done={done || undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="ac-lesson-mark" aria-hidden="true">
                      {done ? <IconCheck size={13} /> : l.readable ? String(n).padStart(2, "0") : <IconLock size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{l.title}</span>
                      {!compact && (
                        <span className="text-xs text-[color:var(--color-text-muted)]">
                          {l.minutes} min{l.preview ? " · Free preview" : !l.readable ? " · Locked" : ""}
                        </span>
                      )}
                    </span>
                    {compact && <span className="text-[11px] text-[color:var(--color-text-muted)] shrink-0">{l.minutes}m</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function CompleteButton({ course, lesson }: { course: string; lesson: string }) {
  const done = useCompleted(course).includes(lesson);
  return (
    <button
      type="button"
      onClick={() => setCompleted(course, lesson, !done)}
      className={done ? "ac-complete" : "btn-primary text-sm"}
      data-done={done || undefined}
      aria-pressed={done}
    >
      {done ? (
        <>
          <IconCheck size={15} /> Lesson complete
        </>
      ) : (
        "Mark lesson complete"
      )}
    </button>
  );
}
