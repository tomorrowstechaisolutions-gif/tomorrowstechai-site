import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SERIES_NAME, VOLUMES } from "@/lib/academy/library";
import { IconArrowRight, IconChecklist, IconGuide } from "@/components/Icons";
import "../academy/academy.css";

/**
 * Every free download in one place: the Business AI Series volumes plus the
 * two earlier guides. Each card goes to that guide's own page and form.
 */

export const metadata: Metadata = {
  title: { absolute: "Free Guides · Tomorrow’s Tech AI" },
  description:
    "Free PDF guides for business owners: build AI assistants, prompt by voice, find where AI saves money, earn trust as an AI founder, and audit your operation before adding AI.",
  alternates: { canonical: "/free" },
  openGraph: {
    title: "Free guides from Tomorrow’s Tech AI",
    description: "Practical PDF guides for business owners. Put in your email and the guide comes straight to your inbox.",
    url: "https://www.tomorrowstechai.com/free",
    type: "website",
  },
};

/** The guides that came before the series. They keep their own pages. */
const MORE_GUIDES = [
  {
    href: "/operations-audit",
    title: "The Operations Audit Checklist",
    blurb: "12 questions to ask before adding AI to your operation. Score yourself in five minutes.",
    meta: "3-page PDF",
    Icon: IconChecklist,
  },
  {
    href: "/ai-field-guide",
    title: "Your Best Next Hire Is AI",
    blurb: "A plain-English playbook for using AI: what to hand off first and how to start in a week.",
    meta: "6-page PDF",
    Icon: IconGuide,
  },
];

export default function FreeGuidesPage() {
  const series = VOLUMES.filter((v) => v.magnet);

  return (
    <>
      <section className="ac-hero">
        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-12 md:pt-14">
          <div className="ac-kicker mb-4">● Free guides</div>
          <h1 className="text-3xl md:text-5xl font-medium tracking-tight leading-[1.08] mb-5 max-w-3xl">
            Free guides for business owners who want AI to actually do something.
          </h1>
          <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed max-w-2xl">
            Plain English, built from real client work. Pick one, put in your email, and the PDF comes straight to your inbox.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="ac-kicker mb-2">{SERIES_NAME}</div>
        <p className="text-sm text-[color:var(--color-text-secondary)] mb-6">
          Four volumes: how to build, how to communicate, how to implement, how to earn trust.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {series.map((v) => (
            <Link key={v.slug} href={`/free/${v.slug}`} className="card !p-0 overflow-hidden flex flex-col group">
              {v.cover && (
                <span className="relative block aspect-[3/4] border-b border-[color:var(--color-border)]">
                  <Image src={v.cover} alt={`${v.title} cover`} fill sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 270px" className="object-cover" />
                </span>
              )}
              <span className="p-4 flex flex-col gap-1.5 flex-1">
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  Vol {v.number} · {v.teaches}{v.pages ? ` · ${v.pages} pages` : ""}
                </span>
                <span className="font-medium leading-snug">{v.title}</span>
                <span className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{v.subtitle}</span>
                <span className="mt-auto pt-2 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] group-hover:underline">
                  Get your free copy <IconArrowRight size={14} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="ac-kicker mb-6">More free downloads</div>
          <div className="grid md:grid-cols-2 gap-5">
            {MORE_GUIDES.map(({ href, title, blurb, meta, Icon }) => (
              <Link key={href} href={href} className="card !p-5 flex gap-4 items-start group">
                <span className="w-11 h-11 shrink-0 rounded-lg border border-[color:var(--color-border)] flex items-center justify-center text-[color:var(--color-blue-bright)]">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex flex-col gap-1">
                  <span className="text-xs text-[color:var(--color-text-muted)]">{meta}</span>
                  <span className="font-medium leading-snug">{title}</span>
                  <span className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{blurb}</span>
                  <span className="pt-1 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] group-hover:underline">
                    Get your free copy <IconArrowRight size={14} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
