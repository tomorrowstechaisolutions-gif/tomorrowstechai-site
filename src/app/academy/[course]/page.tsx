import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFAULT_OG_IMAGE } from "@/lib/default-og-image";
import { COURSES, STATUS_LABEL, allLessons, canRead, forSale, getCourse, hasFullAccess, priceLabel, totalMinutes } from "@/lib/academy/catalog";
import { currentAccess } from "@/lib/academy/enrollments";
import { EnrollButton } from "@/components/academy/EnrollButton";
import { LEVELS, METHOD_NOTICE, METHODS } from "@/lib/academy/brand";
import { VOLUMES } from "@/lib/academy/library";
import { CourseProgress, Curriculum, type CurriculumModule } from "@/components/academy/progress";
import { MethodCard } from "@/components/academy/parts";
import { WaitlistForm } from "@/components/academy/WaitlistForm";
import { IconArrowRight, IconCheck, IconChevronLeft } from "@/components/Icons";

export function generateStaticParams() {
  return COURSES.map((c) => ({ course: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ course: string }> }): Promise<Metadata> {
  const { course: slug } = await params;
  const course = getCourse(slug);
  if (!course) return {};
  return {
    title: `${course.title} · AI Academy`,
    description: course.tagline,
    alternates: { canonical: `/academy/${course.slug}` },
    openGraph: {
      images: [DEFAULT_OG_IMAGE],
      title: `${course.title} · Tomorrow’s Tech AI Academy`,
      description: course.tagline,
      url: `https://www.tomorrowstechai.com/academy/${course.slug}`,
      type: "website",
    },
  };
}

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ course: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { course: slug } = await params;
  const query = await searchParams;
  const course = getCourse(slug);
  if (!course) notFound();

  const lessons = allLessons(course);
  const level = LEVELS.find((l) => l.id === course.level);
  const method = METHODS.find((m) => m.id === course.framework);
  const volume = VOLUMES.find((v) => v.number === course.volume);
  const access = await currentAccess();
  const enrolled = access.courses.has(course.slug);
  const fullAccess = hasFullAccess(course, access.courses);
  const firstReadable = lessons.find((l) => canRead(course, l, access.courses));

  const curriculum: CurriculumModule[] = (course.modules ?? []).map((m) => ({
    title: m.title,
    summary: m.summary,
    lessons: m.lessons.map((l) => ({
      slug: l.slug,
      title: l.title,
      minutes: l.minutes,
      readable: canRead(course, l, access.courses),
      preview: Boolean(l.preview),
    })),
  }));

  return (
    <>
      <section className="ac-hero">
        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-14">
          {query.welcome && enrolled && (
            <div className="ac-success mb-8" role="status">
              <div className="ac-kicker">✓ You&apos;re enrolled</div>
              <p className="text-sm text-[color:var(--color-text-secondary)]">
                Welcome in. Every lesson is open below. We also emailed you a link so you can get back in from any device.
              </p>
            </div>
          )}
          {query.checkout === "cancelled" && (
            <div className="ac-callout mb-8 text-sm" role="status">Checkout was cancelled. You weren&apos;t charged.</div>
          )}
          <Link href="/academy#courses" className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] mb-8">
            <IconChevronLeft size={15} /> All courses
          </Link>
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-10 items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="ac-kicker">Level {String(course.level).padStart(2, "0")} · {level?.name}</span>
                <span className="ac-pill" data-status={course.status}>{STATUS_LABEL[course.status]}</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-medium tracking-tight leading-[1.08] mb-5">{course.title}</h1>
              <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed mb-6 max-w-2xl">{course.tagline}</p>
              <p className="text-sm text-[color:var(--color-text-muted)] max-w-2xl">
                <span className="text-[color:var(--color-text-secondary)]">Who it&apos;s for:</span> {course.audience}
              </p>
            </div>

            <aside className="ac-side">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-3xl font-medium">{priceLabel(course.price)}</span>
                {lessons.length > 0 && (
                  <span className="text-xs text-[color:var(--color-text-muted)]">
                    {lessons.length} lessons · {totalMinutes(course)} min
                  </span>
                )}
              </div>
              {course.price.kind === "paid" && course.price.note && (
                <p className="text-xs text-[color:var(--color-blue-bright)] mb-4">{course.price.note}</p>
              )}

              {fullAccess && firstReadable ? (
                <>
                  <p className="text-sm text-[color:var(--color-text-secondary)] mb-5">
                    {enrolled
                      ? `You're enrolled${access.email ? ` as ${access.email}` : ""}. Your progress is saved in this browser.`
                      : "Free. No account needed. Your progress is saved in this browser."}
                  </p>
                  <div className="mb-5">
                    <CourseProgress course={course.slug} lessons={lessons.map((l) => l.slug)} />
                  </div>
                  <Link href={`/academy/${course.slug}/${firstReadable.slug}`} className="btn-primary w-full justify-center">
                    {enrolled ? "Go to the lessons" : "Start the course"} <IconArrowRight size={16} />
                  </Link>
                  {course.quiz && (
                    <Link href={`/academy/${course.slug}/check`} className="btn-secondary w-full justify-center mt-3">
                      Take the knowledge check
                    </Link>
                  )}
                </>
              ) : forSale(course) && course.price.kind === "paid" ? (
                <>
                  <p className="text-sm text-[color:var(--color-text-secondary)] mb-5 mt-3">
                    One payment, yours to keep. Every lesson, the knowledge check and your certificate.
                  </p>
                  <EnrollButton course={course.slug} label={`Enroll for $${course.price.amount} →`} />
                  {firstReadable && (
                    <Link href={`/academy/${course.slug}/${firstReadable.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] hover:underline">
                      Try the free preview lesson <IconArrowRight size={14} />
                    </Link>
                  )}
                  <p className="text-xs text-[color:var(--color-text-muted)] mt-4">
                    Already enrolled? <Link href="/academy/access" className="text-[color:var(--color-blue-bright)] hover:underline">Get access on this device</Link>.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-[color:var(--color-text-secondary)] mb-5 mt-3">
                    {course.status === "waitlist"
                      ? "Lessons are being recorded now. Join the founding student list and you get first access at this price."
                      : "This course is in development. Join the list and you'll hear the moment it opens."}
                  </p>
                  <WaitlistForm
                    course={course.slug}
                    buttonLabel={course.status === "waitlist" ? "Save my founding seat →" : "Tell me when it opens →"}
                  />
                  {firstReadable && (
                    <Link href={`/academy/${course.slug}/${firstReadable.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] hover:underline">
                      Try the free preview lesson <IconArrowRight size={14} />
                    </Link>
                  )}
                </>
              )}

              {course.includes && (
                <ul className="mt-6 pt-5 border-t border-[color:var(--color-border-subtle)] space-y-2">
                  {course.includes.map((i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
                      <IconCheck size={14} className="text-[color:var(--color-blue-bright)] shrink-0" /> {i}
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-12">
          <div>
            <div className="ac-buildbox mb-10">
              <div className="ac-kicker mb-2">What you&apos;ll build</div>
              <p className="text-lg text-[color:var(--color-text)] leading-relaxed">{course.build}</p>
            </div>

            <h2 className="text-2xl font-medium tracking-tight mb-4">What you&apos;ll be able to do</h2>
            <ul className="ac-ticks mb-12">
              {course.outcomes.map((o) => (
                <li key={o} className="!text-[15px]">{o}</li>
              ))}
            </ul>

            <h2 className="text-2xl font-medium tracking-tight mb-6">Curriculum</h2>
            {curriculum.length > 0 ? (
              <Curriculum course={course.slug} modules={curriculum} />
            ) : (
              <>
                <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
                  The outline. Lessons are added as they are recorded.
                </p>
                <ol className="ac-lessons">
                  {(course.outline ?? []).map((topic, i) => (
                    <li key={topic} className="ac-lesson">
                      <span className="ac-lesson-mark">{String(i + 1).padStart(2, "0")}</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>

          <div className="space-y-6">
            {method && (
              <div>
                <MethodCard method={method} />
                <p className="text-[11px] text-[color:var(--color-text-muted)] mt-2">{METHOD_NOTICE}</p>
              </div>
            )}
            {volume && (
              <div className="card p-6">
                <div className="ac-kicker mb-2">Free companion guide · Vol {volume.number}</div>
                <h3 className="text-lg font-medium mb-1">{volume.title}</h3>
                <p className="text-sm text-[color:var(--color-text-secondary)] mb-4">{volume.subtitle}</p>
                {volume.magnet ? (
                  <Link href="/academy#library" className="text-sm text-[color:var(--color-blue-bright)] hover:underline">
                    Get the free PDF →
                  </Link>
                ) : (
                  <span className="ac-pill">Coming soon</span>
                )}
              </div>
            )}
            {course.includes?.some((i) => /certificate/i.test(i)) && (
            <div className="card p-6">
              <div className="ac-kicker mb-2">Certificate</div>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                Finish the lessons and the final check to earn a Tomorrow&apos;s Tech AI certificate of completion.
                It&apos;s our own credential, not an accredited certification.
              </p>
            </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
