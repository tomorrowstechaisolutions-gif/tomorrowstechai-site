import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFAULT_OG_IMAGE } from "@/lib/default-og-image";
import { COURSES, allLessons, canRead, findLesson, forSale, getCourse } from "@/lib/academy/catalog";
import { currentAccess } from "@/lib/academy/enrollments";
import { EnrollButton } from "@/components/academy/EnrollButton";
import { CompleteButton, Curriculum, type CurriculumModule } from "@/components/academy/progress";
import { LessonBody, LessonVideo } from "@/components/academy/parts";
import { WaitlistForm } from "@/components/academy/WaitlistForm";
import { IconArrowRight, IconChevronLeft, IconLock } from "@/components/Icons";

export function generateStaticParams() {
  return COURSES.flatMap((c) => allLessons(c).map((l) => ({ course: c.slug, lesson: l.slug })));
}

export const dynamicParams = false;

type Params = { params: Promise<{ course: string; lesson: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const course = getCourse(courseSlug);
  const pos = course && findLesson(course, lessonSlug);
  if (!course || !pos) return {};
  return {
    title: `${pos.lesson.title} · ${course.title}`,
    description: pos.lesson.summary,
    alternates: { canonical: `/academy/${course.slug}/${pos.lesson.slug}` },
    // Locked lessons are thin pages; keep them out of search until they open.
    robots: canRead(course, pos.lesson) ? undefined : { index: false, follow: true },
    openGraph: {
      images: [DEFAULT_OG_IMAGE],
      title: `${pos.lesson.title} · Tomorrow’s Tech AI Academy`,
      description: pos.lesson.summary,
      url: `https://www.tomorrowstechai.com/academy/${course.slug}/${pos.lesson.slug}`,
      type: "article",
    },
  };
}

export default async function LessonPage({ params }: Params) {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const course = getCourse(courseSlug);
  const pos = course && findLesson(course, lessonSlug);
  if (!course || !pos) notFound();

  const { lesson, module, index, total, prev, next } = pos;
  const access = await currentAccess();
  const readable = canRead(course, lesson, access.courses);

  const curriculum: CurriculumModule[] = (course.modules ?? []).map((m) => ({
    title: m.title,
    lessons: m.lessons.map((l) => ({
      slug: l.slug,
      title: l.title,
      minutes: l.minutes,
      readable: canRead(course, l, access.courses),
      preview: Boolean(l.preview),
    })),
  }));

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-6 py-8 md:py-10">
      <Link href={`/academy/${course.slug}`} className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] mb-6">
        <IconChevronLeft size={15} /> {course.title}
      </Link>

      <div className="grid lg:grid-cols-[1fr_320px] gap-10">
        <article className="min-w-0">
          <div className="ac-kicker mb-3">
            Lesson {index + 1} of {total} · {module.title.replace(/^Module \d+ · /, "")}
            {lesson.preview && course.price.kind !== "free" ? " · Free preview" : ""}
          </div>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight mb-3">{lesson.title}</h1>
          <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed mb-8">{lesson.summary}</p>

          {readable ? (
            <>
              {(lesson.video || course.price.kind !== "free") && (
                <div className="mb-10">
                  <LessonVideo src={lesson.video} title={lesson.title} />
                </div>
              )}
              {lesson.body && <LessonBody blocks={lesson.body} />}
              {lesson.build && (
                <div className="ac-buildbox mt-10">
                  <div className="ac-kicker mb-2">Build this before you move on</div>
                  <p className="text-[color:var(--color-text)] leading-relaxed">{lesson.build}</p>
                </div>
              )}
              <div className="mt-10 pt-8 border-t border-[color:var(--color-border)] flex flex-wrap items-center justify-between gap-4">
                <CompleteButton course={course.slug} lesson={lesson.slug} />
                {next ? (
                  <Link href={`/academy/${course.slug}/${next.slug}`} className="btn-secondary text-sm">
                    Next: {next.title} <IconArrowRight size={15} />
                  </Link>
                ) : course.quiz ? (
                  <Link href={`/academy/${course.slug}/check`} className="btn-secondary text-sm">
                    Take the knowledge check <IconArrowRight size={15} />
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <div className="ac-locked">
              <div className="flex items-center gap-2 ac-kicker mb-3">
                <IconLock size={13} /> {forSale(course) ? "Students only" : course.status === "planned" ? "In development" : "Founding students"}
              </div>
              <h2 className="text-xl font-medium mb-2">{forSale(course) ? "Enroll to open this lesson." : "This lesson opens with the full course."}</h2>
              {lesson.build && (
                <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-6">
                  <span className="text-[color:var(--color-text)]">What you&apos;ll build here:</span> {lesson.build}
                </p>
              )}
              {forSale(course) && course.price.kind === "paid" ? (
                <div className="max-w-xs">
                  <EnrollButton course={course.slug} label={`Enroll for $${course.price.amount} →`} />
                  <p className="text-xs text-[color:var(--color-text-muted)] mt-3">
                    Already enrolled? <Link href="/academy/access" className="text-[color:var(--color-blue-bright)] hover:underline">Get access on this device</Link>.
                  </p>
                </div>
              ) : (
                <div className="max-w-xl">
                  <WaitlistForm course={course.slug} />
                </div>
              )}
            </div>
          )}

          <nav className="mt-10 grid sm:grid-cols-2 gap-3" aria-label="Lesson navigation">
            {prev ? (
              <Link href={`/academy/${course.slug}/${prev.slug}`} className="card !p-4 text-sm">
                <span className="block text-xs text-[color:var(--color-text-muted)] mb-1">← Previous</span>
                {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/academy/${course.slug}/${next.slug}`} className="card !p-4 text-sm sm:text-right">
                <span className="block text-xs text-[color:var(--color-text-muted)] mb-1">Next →</span>
                {next.title}
              </Link>
            )}
          </nav>
        </article>

        <aside className="lg:sticky lg:top-24 self-start">
          <div className="ac-side">
            <div className="ac-kicker mb-4">Course lessons</div>
            <Curriculum course={course.slug} modules={curriculum} current={lesson.slug} compact />
          </div>
        </aside>
      </div>
    </div>
  );
}
