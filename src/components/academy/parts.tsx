import Link from "next/link";
import { IconArrowRight, IconPlay } from "@/components/Icons";
import { CopyPrompt } from "./CopyPrompt";
import type { Block, Course } from "@/lib/academy/types";
import type { Method } from "@/lib/academy/brand";
import { LEVELS } from "@/lib/academy/brand";
import { STATUS_LABEL, allLessons, priceLabel, totalMinutes } from "@/lib/academy/catalog";

export function LessonBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="ac-prose">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "p":
            return <p key={i}>{b.text}</p>;
          case "h":
            return <h2 key={i}>{b.text}</h2>;
          case "list":
            return b.ordered ? (
              <ol key={i}>{b.items.map((t) => <li key={t}>{t}</li>)}</ol>
            ) : (
              <ul key={i}>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
            );
          case "quote":
            return (
              <blockquote key={i}>
                <p>“{b.text}”</p>
                {b.by && <cite>{b.by}</cite>}
              </blockquote>
            );
          case "prompt":
            return <CopyPrompt key={i} label={b.label} text={b.text} />;
          case "compare":
            return (
              <div key={i} className="ac-compare">
                <div data-tone="weak">
                  <span>What most people type</span>
                  <p>“{b.weak}”</p>
                </div>
                <div data-tone="strong">
                  <span>What actually works</span>
                  <p>“{b.strong}”</p>
                </div>
                {b.note && <small>{b.note}</small>}
              </div>
            );
          case "callout":
            return (
              <aside key={i} className="ac-callout">
                <strong>{b.title}</strong>
                <p>{b.text}</p>
              </aside>
            );
        }
      })}
    </div>
  );
}

/** YouTube id → embed; anything else is treated as a direct video file. */
export function LessonVideo({ src, title }: { src?: string; title: string }) {
  if (!src) {
    return (
      <div className="ac-video ac-video-empty">
        <IconPlay size={28} />
        <span>Video lesson recording soon. The written lesson is below.</span>
      </div>
    );
  }
  const isYouTubeId = /^[\w-]{11}$/.test(src);
  if (isYouTubeId) {
    return (
      <div className="ac-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${src}?rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div className="ac-video">
      <video src={src} controls preload="metadata" />
    </div>
  );
}

export function MethodCard({ method }: { method: Method }) {
  return (
    <div className="ac-method" data-method={method.id}>
      <div className="ac-kicker mb-2">{method.teaches}</div>
      <h3 className="text-2xl font-medium tracking-tight">{method.name}</h3>
      <p className="text-sm text-[color:var(--color-text-secondary)] mt-1 mb-6">{method.subtitle}</p>
      <ol className="space-y-3 mb-6">
        {method.steps.map((s) => (
          <li key={s.letter} className="ac-step">
            <span className="ac-letter">{s.letter}</span>
            <span>
              <strong className="block text-[15px] font-medium">{s.title}</strong>
              <span className="text-sm text-[color:var(--color-text-secondary)]">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="ac-method-foot">{method.slogan}</div>
    </div>
  );
}

export function CourseCard({ course }: { course: Course }) {
  const lessons = allLessons(course).length;
  const minutes = totalMinutes(course);
  const level = LEVELS.find((l) => l.id === course.level);
  return (
    <Link href={`/academy/${course.slug}`} className="ac-course" data-status={course.status}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="ac-kicker">Level {String(course.level).padStart(2, "0")} · {level?.name}</span>
        <span className="ac-pill" data-status={course.status}>{STATUS_LABEL[course.status]}</span>
      </div>
      <h3 className="text-lg font-medium leading-snug mb-2">{course.title}</h3>
      <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-4">{course.tagline}</p>
      <div className="ac-build">
        <span>You build</span>
        {course.build}
      </div>
      <div className="mt-auto pt-5 flex items-center justify-between text-sm">
        <span className="font-medium">
          {priceLabel(course.price)}
          {course.price.kind === "paid" && course.price.note && (
            <span className="text-xs text-[color:var(--color-text-muted)] font-normal"> · {course.price.note}</span>
          )}
        </span>
        <span className="text-[color:var(--color-text-muted)] inline-flex items-center gap-1.5">
          {lessons ? `${lessons} lessons · ${minutes} min` : `${course.outline?.length ?? 0} topics`}
          <IconArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
