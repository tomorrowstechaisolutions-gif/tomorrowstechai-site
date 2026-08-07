import type { Metadata } from "next";
import Link from "next/link";
import { Studio } from "@/components/logo-studio/Studio";
import { IconArrowRight } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Create your logo",
  description:
    "Answer a few questions and see real logo concepts for your business in seconds — then watch them come alive on signs, vehicles, cards and apps.",
  // A tool, not a landing page: nothing here for search to index, and the
  // generated URLs carry no unique content.
  robots: { index: false, follow: true },
};

export default function CreatePage() {
  return (
    <section className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-2">
            Tomorrow&rsquo;s Tech Logo Studio
          </div>
          <h1 className="text-[26px] md:text-[32px] font-bold tracking-tight">
            Build your logo.
          </h1>
        </div>
        <Link href="/logo-studio" className="btn-secondary text-[11.5px] uppercase tracking-[0.1em]">
          Pricing &amp; packages
          <IconArrowRight size={14} />
        </Link>
      </div>

      <Studio />
    </section>
  );
}
