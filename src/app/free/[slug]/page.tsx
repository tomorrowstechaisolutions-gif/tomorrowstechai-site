import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";
import { SERIES_NAME, VOLUMES, getVolume } from "@/lib/academy/library";
import { FOUNDER_NAME, FOUNDER_QUOTE } from "@/lib/academy/brand";
import { IconArrowRight, IconCheck } from "@/components/Icons";
import "../../academy/academy.css";

/**
 * One landing page per free guide. These are the links for social posts:
 * the cover, what's inside, and one email form that sends the PDF and
 * records the person as a lead.
 */

export function generateStaticParams() {
  return VOLUMES.filter((v) => v.magnet).map((v) => ({ slug: v.slug }));
}

export const dynamicParams = false;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const volume = getVolume(slug);
  if (!volume) return {};
  const title = `${volume.title}: Free Guide`;
  return {
    title: { absolute: `${title} · Tomorrow’s Tech AI` },
    description: `${volume.hook} Free ${volume.pages}-page guide from ${SERIES_NAME}, Volume ${volume.number}.`,
    alternates: { canonical: `/free/${volume.slug}` },
    openGraph: {
      title: `Free guide: ${volume.title}`,
      description: volume.hook,
      url: `https://www.tomorrowstechai.com/free/${volume.slug}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title: `Free guide: ${volume.title}`, description: volume.hook },
  };
}

export default async function FreeGuidePage({ params }: Params) {
  const { slug } = await params;
  const volume = getVolume(slug);
  if (!volume?.magnet) notFound();
  const others = VOLUMES.filter((v) => v.magnet && v.slug !== volume.slug);
  const success = `${volume.title} is on its way to your inbox. You can also download it right here.`;

  return (
    <>
      <section className="ac-hero">
        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-16 md:pt-14">
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-start">
            <div>
              <div className="ac-kicker mb-4">
                ● Free guide · {SERIES_NAME} · Volume {volume.number}
              </div>
              <h1 className="text-3xl md:text-5xl font-medium tracking-tight leading-[1.08] mb-5">{volume.hook}</h1>
              <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed mb-8 max-w-xl">
                <strong className="text-[color:var(--color-text)] font-medium">{volume.title}.</strong> {volume.subtitle}{" "}
                {volume.pages} pages, plain English, free.
              </p>

              <div className="card p-6 md:p-7 max-w-lg" id="get-it">
                <div className="ac-kicker mb-2">Get your free copy</div>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
                  Put in your email and we&apos;ll send the PDF straight to your inbox. You can download it on the next screen too.
                </p>
                <LeadMagnetForm magnet={volume.magnet} buttonLabel="Send me the free guide →" successMessage={success} />
              </div>
            </div>

            <div className="relative w-full max-w-sm mx-auto lg:max-w-none">
              <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-[color:var(--color-border)] shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
                {volume.cover && (
                  <Image
                    src={volume.cover}
                    alt={`${volume.title} cover`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 90vw, 480px"
                    className="object-cover"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12">
          <div>
            <div className="ac-kicker mb-3">What&apos;s inside</div>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-6">Practical, not theory. Use it the same day.</h2>
            <ul className="space-y-3">
              {volume.inside.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed">
                  <IconCheck size={17} className="text-[color:var(--color-blue-bright)] shrink-0 mt-1" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[color:var(--color-text-muted)] mt-6">
              <span className="text-[color:var(--color-text-secondary)]">Who it&apos;s for:</span> {volume.audience}
            </p>
          </div>
          <div className="space-y-6">
            <blockquote className="ac-quote">
              <p>“{FOUNDER_QUOTE}”</p>
              <cite>{FOUNDER_NAME}</cite>
            </blockquote>
            <div className="card p-6">
              <div className="ac-kicker mb-2">Want to go further?</div>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-4">
                Every guide pairs with a course in the Tomorrow&apos;s Tech AI Academy. Start with the free Introduction to AI course, no account needed.
              </p>
              <Link href="/academy" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] hover:underline">
                Visit the Academy <IconArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30">
          <div className="max-w-6xl mx-auto px-6 py-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
              <div className="ac-kicker">More free guides in {SERIES_NAME}</div>
              <Link href="/free" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-blue-bright)] hover:underline">
                See all free guides <IconArrowRight size={14} />
              </Link>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {others.map((v) => (
                <Link key={v.slug} href={`/free/${v.slug}`} className="card !p-4 flex gap-4 items-center">
                  {v.cover && (
                    <span className="relative w-16 aspect-[3/4] shrink-0 rounded overflow-hidden border border-[color:var(--color-border)]">
                      <Image src={v.cover} alt="" fill sizes="64px" className="object-cover" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs text-[color:var(--color-text-muted)]">Vol {v.number} · {v.teaches}</span>
                    <span className="block font-medium leading-snug">{v.title}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
