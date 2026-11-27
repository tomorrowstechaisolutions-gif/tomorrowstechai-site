import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { forSale, getCourse, hasFullAccess } from "@/lib/academy/catalog";
import { currentAccess } from "@/lib/academy/enrollments";
import { QuizForm } from "@/components/academy/QuizForm";
import { EnrollButton } from "@/components/academy/EnrollButton";
import { IconChevronLeft, IconLock } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Knowledge check · AI Academy",
  robots: { index: false, follow: true },
};

export default async function CheckPage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = getCourse(slug);
  if (!course?.quiz) notFound();

  const access = await currentAccess();
  const allowed = hasFullAccess(course, access.courses);
  // Only the questions and options go to the browser. The answers stay on the server.
  const questions = course.quiz.questions.map(({ q, options }) => ({ q, options }));

  return (
    <section className="max-w-3xl mx-auto px-6 py-12">
      <Link href={`/academy/${course.slug}`} className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] mb-8">
        <IconChevronLeft size={15} /> {course.title}
      </Link>
      <div className="ac-kicker mb-3">Final knowledge check</div>
      <h1 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight mb-3">{course.title}</h1>
      <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-10">
        {course.quiz.questions.length} questions. Score {course.quiz.pass}% or better and you get a Tomorrow&apos;s Tech AI
        certificate of completion with a public link anyone can use to verify it. You can retake it as many times as you
        need.
      </p>

      {allowed ? (
        <QuizForm course={course.slug} questions={questions} pass={course.quiz.pass} needsEmail={!access.email} />
      ) : (
        <div className="ac-locked">
          <div className="flex items-center gap-2 ac-kicker mb-3">
            <IconLock size={13} /> Students only
          </div>
          <p className="text-[color:var(--color-text-secondary)] mb-6">The knowledge check opens when you enroll in the course.</p>
          {forSale(course) && course.price.kind === "paid" ? (
            <div className="max-w-xs">
              <EnrollButton course={course.slug} label={`Enroll for $${course.price.amount} →`} />
            </div>
          ) : (
            <Link href={`/academy/${course.slug}`} className="btn-secondary text-sm">Back to the course</Link>
          )}
          <p className="text-sm text-[color:var(--color-text-muted)] mt-4">
            Already enrolled? <Link href="/academy/access" className="text-[color:var(--color-blue-bright)] hover:underline">Get access on this device</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
