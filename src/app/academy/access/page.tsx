import Link from "next/link";
import type { Metadata } from "next";
import { AccessForm } from "@/components/academy/AccessForm";
import { currentAccess } from "@/lib/academy/enrollments";
import { getCourse } from "@/lib/academy/catalog";
import { IconArrowRight, IconChevronLeft } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Get access · AI Academy",
  description: "Sign back into your Tomorrow’s Tech AI Academy courses with the email you paid with.",
  robots: { index: false, follow: true },
};

const NOTICES: Record<string, string> = {
  expired: "That sign-in link has expired or isn't valid. Ask for a new one below.",
  none: "We couldn't find a course for that email. Use the address you paid with.",
  invalid: "We couldn't confirm that checkout. If you were charged, ask for a sign-in link below or reply to your receipt.",
  pending: "Your payment is still processing. You'll get an email with your link as soon as it clears.",
  error: "Something went wrong confirming your purchase. Ask for a sign-in link below, it uses the same email.",
};

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const notice = NOTICES[params.link ?? params.claim ?? ""];
  const access = await currentAccess();
  const owned = Array.from(access.courses).map(getCourse).filter((c) => c !== undefined);

  return (
    <section className="max-w-xl mx-auto px-6 py-16">
      <Link href="/academy" className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] mb-8">
        <IconChevronLeft size={15} /> Academy
      </Link>
      <div className="ac-kicker mb-3">Student access</div>
      <h1 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">Get back into your courses</h1>
      <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8">
        No passwords. Enter the email you paid with and we&apos;ll send you a sign-in link for this device.
      </p>

      {notice && <div className="ac-callout mb-6 text-sm">{notice}</div>}

      {owned.length > 0 && (
        <div className="card p-5 mb-8">
          <div className="ac-kicker mb-3">Signed in as {access.email}</div>
          <ul className="space-y-2">
            {owned.map((c) => (
              <li key={c.slug}>
                <Link href={`/academy/${c.slug}`} className="inline-flex items-center gap-1.5 text-[color:var(--color-blue-bright)] hover:underline">
                  {c.title} <IconArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-6">
        <AccessForm />
      </div>
    </section>
  );
}
