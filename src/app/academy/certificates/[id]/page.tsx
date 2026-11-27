import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCertificate } from "@/lib/academy/enrollments";
import { getCourse } from "@/lib/academy/catalog";
import { FOUNDER_NAME } from "@/lib/academy/brand";
import { PrintButton } from "@/components/academy/PrintButton";
import { BrandMark } from "@/components/BrandMark";
import { IconBadgeCheck } from "@/components/Icons";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const cert = await getCertificate(id.toUpperCase());
  const course = cert && getCourse(cert.course_slug);
  return {
    title: cert ? `Certificate ${cert.id} · AI Academy` : "Certificate · AI Academy",
    description: cert && course ? `${cert.name} completed ${course.title} at Tomorrow’s Tech AI Academy.` : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function CertificatePage({ params }: Params) {
  const { id } = await params;
  const cert = await getCertificate(id.toUpperCase());
  if (!cert) notFound();
  const course = getCourse(cert.course_slug);
  const issued = new Date(cert.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Chicago" });

  return (
    <section className="max-w-4xl mx-auto px-6 py-12">
      <div className="ac-verified mb-6">
        <IconBadgeCheck size={18} />
        <span>
          Verified: certificate <strong>{cert.id}</strong> was issued by Tomorrow&apos;s Tech AI Academy on {issued}.
        </span>
      </div>

      <div className="ac-cert">
        <div className="ac-cert-inner">
          <div className="flex items-center justify-center gap-3 mb-8">
            <BrandMark size={36} />
            <span className="ac-kicker !text-[12px]">Tomorrow&apos;s Tech AI Academy</span>
          </div>
          <p className="ac-cert-label">Certificate of Completion</p>
          <p className="ac-cert-sub">This certifies that</p>
          <p className="ac-cert-name">{cert.name}</p>
          <p className="ac-cert-sub">has completed</p>
          <p className="ac-cert-course">{course?.title ?? cert.course_slug}</p>
          <p className="ac-cert-sub">and passed its final knowledge check with a score of {cert.score}%.</p>

          <div className="ac-cert-foot">
            <div>
              <span className="ac-cert-sign">{FOUNDER_NAME}</span>
              <span>Founder, Tomorrow&apos;s Tech AI Solutions</span>
            </div>
            <div>
              <span className="ac-cert-sign">{issued}</span>
              <span>Date issued</span>
            </div>
            <div>
              <span className="ac-cert-sign font-mono">{cert.id}</span>
              <span>Verify at tomorrowstechai.com/academy/certificates</span>
            </div>
          </div>
        </div>
      </div>

      <div className="ac-noprint mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[color:var(--color-text-muted)] max-w-lg">
          A Tomorrow&apos;s Tech AI certificate of completion. It is our own credential, not an accredited certification.
        </p>
        <div className="flex gap-3">
          <PrintButton />
          {course && (
            <Link href={`/academy/${course.slug}`} className="btn-secondary text-sm">Back to the course</Link>
          )}
        </div>
      </div>
    </section>
  );
}
