import Link from "next/link";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/default-og-image";
import {
  ACADEMY_NAME,
  ACADEMY_SLOGAN,
  ACADEMY_TAGLINE,
  BUILT_FROM,
  CORE_PHILOSOPHY,
  FOUNDER_NAME,
  FOUNDER_QUOTE,
  LEVELS,
  METHODS,
  METHOD_NOTICE,
  MISSION,
  PRINCIPLES,
  TEACHING_RULE,
} from "@/lib/academy/brand";
import { COURSES, allLessons, canRead, coursesAtLevel, flagshipCourse, priceLabel, totalMinutes } from "@/lib/academy/catalog";
import { SERIES_NAME, VOLUMES } from "@/lib/academy/library";
import { CourseCard, MethodCard } from "@/components/academy/parts";
import { LibraryCard } from "@/components/academy/LibraryCard";
import { WaitlistForm } from "@/components/academy/WaitlistForm";
import { IconArrowRight, IconCheck } from "@/components/Icons";

export const metadata: Metadata = {
  title: { absolute: "AI Academy · Learn AI. Build with AI. · Tomorrow’s Tech AI" },
  description:
    "Practical AI training for business owners, founders and builders. Learn the S.P.E.A.K. Method, build your own AI assistants, websites and automations, and finish every course with something you built.",
  alternates: { canonical: "/academy" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: `${ACADEMY_NAME}: ${ACADEMY_TAGLINE}`,
    description: "Real skills. Real projects. Real results. Free courses to start, practical paid courses when you're ready to build.",
    url: "https://www.tomorrowstechai.com/academy",
    type: "website",
  },
};

export default function AcademyPage() {
  const flagship = flagshipCourse();
  const flagshipLessons = flagship ? allLessons(flagship) : [];
  const freeCourses = COURSES.filter((c) => c.price.kind === "free" && c.status === "open").length;
  const freeLessons = COURSES.reduce((n, c) => n + allLessons(c).filter((l) => canRead(c, l)).length, 0);

  return (
    <>
      {/* Hero */}
      <section className="ac-hero">
        <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-16 md:pt-20 md:pb-20">
          <div className="grid lg:grid-cols-[1.25fr_1fr] gap-12 items-end">
            <div>
              <div className="ac-kicker mb-5">● {ACADEMY_NAME}</div>
              <h1 className="text-4xl md:text-6xl font-medium tracking-tight leading-[1.02] mb-6">
                Learn AI.
                <br />
                Build with AI.
                <br />
                <span className="text-[color:var(--color-blue-bright)]">Transform your business.</span>
              </h1>
              <p className="text-lg md:text-xl text-[color:var(--color-text-secondary)] leading-relaxed max-w-xl mb-8">
                Practical training for business owners, founders and people who want to do what we do.
                No hype and no theory for its own sake. You learn by building, and you leave every
                course with something that works.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/academy/intro-to-ai" className="btn-primary">
                  Start free <IconArrowRight size={16} />
                </Link>
                <Link href="#courses" className="btn-secondary">
                  Browse courses
                </Link>
              </div>
            </div>
            <div className="space-y-6">
              <blockquote className="ac-quote">
                <p>“{FOUNDER_QUOTE}”</p>
                <cite>{FOUNDER_NAME}</cite>
              </blockquote>
              <div className="grid grid-cols-3 gap-3">
                <div className="ac-stat">
                  <strong>{COURSES.length}</strong>
                  <span>courses</span>
                </div>
                <div className="ac-stat">
                  <strong>{freeLessons}</strong>
                  <span>free lessons</span>
                </div>
                <div className="ac-stat">
                  <strong>{VOLUMES.filter((v) => v.magnet).length}</strong>
                  <span>free guides</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy strip */}
      <section className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/50">
        <div className="max-w-6xl mx-auto px-6 py-6 grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="ac-kicker mb-1">Our approach</div>
            <span className="text-[color:var(--color-text)]">{CORE_PHILOSOPHY}</span>
          </div>
          <div>
            <div className="ac-kicker mb-1">How we teach</div>
            <span className="text-[color:var(--color-text)]">{ACADEMY_SLOGAN}</span>
          </div>
          <div>
            <div className="ac-kicker mb-1">One rule</div>
            <span className="text-[color:var(--color-text)]">Every course ends with something you built.</span>
          </div>
        </div>
      </section>

      {/* Levels */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="ac-section-head">
          <div className="ac-kicker">Four levels</div>
          <h2>Start free. Go as deep as you want.</h2>
          <p>
            Come in at Foundations, at no cost. Move into paid training as your skills grow. Bring
            your whole team in when you are ready.
          </p>
        </div>
        <div className="ac-levels">
          {LEVELS.map((level) => {
            const count = coursesAtLevel(level.id).length;
            return (
              <div key={level.id} className="ac-level" style={{ ["--lvl" as string]: level.id }}>
                <div className="ac-level-n mb-4">{String(level.id).padStart(2, "0")}</div>
                <h3 className="font-medium text-lg mb-1">{level.name}</h3>
                <div className="text-sm text-[color:var(--color-blue-bright)] mb-3">{level.priceRange}</div>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{level.summary}</p>
                <div className="mt-4 text-xs text-[color:var(--color-text-muted)]">
                  {level.id === 4 ? (
                    <Link href="#corporate" className="hover:text-[color:var(--color-text)]">Built per company →</Link>
                  ) : (
                    `${count} course${count === 1 ? "" : "s"}`
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Flagship */}
      {flagship && (
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <div className="ac-flagship grid lg:grid-cols-[1.3fr_1fr] gap-10">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="ac-kicker">Flagship course</span>
                <span className="ac-pill" data-status={flagship.status}>Founding students</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight mb-4">{flagship.title}</h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-6 max-w-xl">{flagship.tagline}</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-7">
                {(flagship.includes ?? []).map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <IconCheck size={15} className="text-[color:var(--color-blue-bright)] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-4">
                <Link href={`/academy/${flagship.slug}`} className="btn-primary">
                  See the curriculum <IconArrowRight size={16} />
                </Link>
                <Link href={`/academy/${flagship.slug}/${flagshipLessons[0]?.slug}`} className="text-sm text-[color:var(--color-blue-bright)] hover:underline">
                  Watch lesson 1 free
                </Link>
              </div>
            </div>
            <div className="card p-6 self-start">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-3xl font-medium">{priceLabel(flagship.price)}</span>
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  {flagshipLessons.length} lessons · {totalMinutes(flagship)} min
                </span>
              </div>
              <p className="text-sm text-[color:var(--color-text-secondary)] mb-5">
                Founding student price. Join the list and you&apos;ll get first access when it opens.
              </p>
              <WaitlistForm course={flagship.slug} />
            </div>
          </div>
        </section>
      )}

      {/* Catalog */}
      <section id="courses" className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="ac-section-head">
            <div className="ac-kicker">Course catalog</div>
            <h2>Every course ends with something you built.</h2>
            <p>
              {freeCourses} free course{freeCourses === 1 ? "" : "s"} open now, the flagship taking founding students, and the rest in
              development. New courses and modules get added as they are recorded.
            </p>
          </div>
          {LEVELS.filter((l) => l.id !== 4).map((level) => {
            const courses = coursesAtLevel(level.id);
            if (!courses.length) return null;
            return (
              <div key={level.id} className="mb-12 last:mb-0">
                <div className="flex items-baseline gap-3 mb-4">
                  <h3 className="text-xl font-medium">Level {String(level.id).padStart(2, "0")} · {level.name}</h3>
                  <span className="text-sm text-[color:var(--color-text-muted)]">{level.priceRange}</span>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {courses.map((c) => (
                    <CourseCard key={c.slug} course={c} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Methods */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="ac-section-head">
          <div className="ac-kicker">Our two methods</div>
          <h2>One for talking to AI. One for talking to people.</h2>
          <p>
            S.P.E.A.K. teaches you how to communicate with technology. H.U.M.A.N. teaches you how to build
            relationships with people. Most AI training only covers the first one. You need both.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {METHODS.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </div>
        <p className="text-xs text-[color:var(--color-text-muted)] mt-4">{METHOD_NOTICE}</p>
      </section>

      {/* Library */}
      <section id="library" className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30 scroll-mt-24">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="ac-section-head">
            <div className="ac-kicker">Free library · {SERIES_NAME}</div>
            <h2>Real guides, free. Start reading tonight.</h2>
            <p>
              Each volume teaches one part of the job: how to build, how to communicate, how to implement and
              how to earn trust. Each one pairs with a course.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VOLUMES.map((v) => (
              <LibraryCard key={v.number} volume={v} />
            ))}
          </div>
        </div>
      </section>

      {/* Principles + mission */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12">
          <div>
            <div className="ac-kicker mb-3">Our mission</div>
            <p className="text-2xl md:text-[1.7rem] font-medium leading-snug tracking-tight mb-8">{MISSION}</p>
            <div className="ac-buildbox">
              <div className="ac-kicker mb-2">The one rule for every course</div>
              <p className="text-[color:var(--color-text)] leading-relaxed">{TEACHING_RULE}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="ac-principle">
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Taught from real builds */}
      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30">
        <div className="max-w-6xl mx-auto px-6 py-16 grid lg:grid-cols-[1fr_1.4fr] gap-10 items-center">
          <div>
            <div className="ac-kicker mb-3">Taught from real work</div>
            <h2 className="text-3xl font-medium tracking-tight leading-tight mb-3">Not hypotheticals. Things we actually built.</h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed">
              The case studies in these courses come from real projects, including the mistakes and how they
              got fixed. You see the whole build, not a highlight reel.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3">
            {BUILT_FROM.map((b) => (
              <li key={b} className="flex items-center gap-3 card !p-4 text-sm">
                <IconCheck size={16} className="text-[color:var(--color-blue-bright)] shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Corporate */}
      <section id="corporate" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-24">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
          <div>
            <div className="ac-kicker mb-3">Level 04 · Corporate AI Training</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight mb-4">Train your whole team.</h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-6">
              Live workshops and training programs built around how your company actually works: your tools, your
              workflows, your rules about data. Your people leave using AI on their own work, not watching a demo.
            </p>
            <ul className="ac-ticks mb-6">
              <li>Live workshops, on-site in Central Texas or remote</li>
              <li>S.P.E.A.K. training for every employee</li>
              <li>Custom assistants built for your departments</li>
              <li>AI usage rules your team can actually follow</li>
              <li>Implementation help after the training ends</li>
            </ul>
            <p className="text-sm text-[color:var(--color-text-muted)]">Typically $499–$2,500+, depending on team size and scope.</p>
          </div>
          <div className="card p-6 md:p-8">
            <h3 className="text-xl font-medium mb-1">Tell us about your team</h3>
            <p className="text-sm text-[color:var(--color-text-secondary)] mb-5">We&apos;ll reply with a plan and a price. No pitch deck.</p>
            <WaitlistForm
              kind="corporate"
              buttonLabel="Request training info →"
              successTitle="Got it."
              successBody="We'll get back to you within one business day with a plan for your team."
            />
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="border-t border-[color:var(--color-border)]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <div className="ac-kicker mb-4">{ACADEMY_SLOGAN}</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight mb-5">
            Start with the free course. It takes about half an hour.
          </h2>
          <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8">
            Five short lessons. By the end you&apos;ll have one prompt you actually reuse every week.
          </p>
          <Link href="/academy/intro-to-ai" className="btn-primary">
            Start Introduction to AI <IconArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
