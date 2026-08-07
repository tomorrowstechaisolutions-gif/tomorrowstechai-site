import type { Metadata } from "next";
import Link from "next/link";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconBrush,
  IconChart,
  IconCloud,
  IconCode,
  IconMonitor,
  IconPlay,
  IconRocket,
  IconShield,
  IconSparkle,
  IconStar,
} from "@/components/Icons";
import { StudioPreview } from "@/components/logo-studio/StudioPreview";

export const metadata: Metadata = {
  title: "Logo Studio — AI logo maker, professionally refined",
  description:
    "Create a logo in minutes with our AI, then let our designers perfect it. Vector files, brand colours, typography and a full brand kit — plus the option to grow it into a complete business system.",
  alternates: { canonical: "/logo-studio" },
  openGraph: {
    title: "Tomorrow’s Tech Logo Studio — AI logo maker, professionally refined",
    description:
      "Create a logo in minutes with our AI, then let our designers perfect it. Vector files, brand colours, typography and a full brand kit.",
  },
};

const FEATURES = [
  { Icon: IconSparkle, title: "Uniquely generated", body: "Every concept is composed for your name, industry and style." },
  { Icon: IconShield, title: "Full commercial rights", body: "Use your logo anywhere your business goes." },
  { Icon: IconMonitor, title: "High-res files", body: "Vector SVG plus PNG at 2048, 1024 and 512." },
  { Icon: IconCloud, title: "Multiple formats", body: "Web, print, signs and merchandise ready." },
  { Icon: IconBadgeCheck, title: "Money-back guarantee", body: "Not happy? Full refund within 7 days." },
  { Icon: IconBrush, title: "Human + AI", body: "AI speed, then real designers refine it." },
];

const TIERS = [
  {
    id: "diy",
    name: "DIY Logo",
    sub: "AI logo pack",
    price: "$39",
    blurb: "Perfect for getting started.",
    cta: "Start free",
    href: "/logo-studio/create",
    features: [
      "6 AI-generated logo concepts",
      "High-resolution files",
      "PNG, JPG and SVG formats",
      "Commercial licence",
    ],
  },
  {
    id: "pro",
    name: "Logo Pro",
    sub: "Brand essentials",
    price: "$149",
    blurb: "Everything you need to launch.",
    cta: "Start free",
    href: "/logo-studio/create",
    popular: true,
    features: [
      "12+ concepts and unlimited regenerates",
      "Full colour palette",
      "Typography recommendations",
      "Brand guide (PDF)",
      "Social media kit",
      "All file formats",
    ],
  },
  {
    id: "custom",
    name: "Custom Brand",
    sub: "Professionally designed",
    price: "$499+",
    blurb: "Hand-crafted by our designers.",
    cta: "Talk to us",
    href: "/contact",
    features: [
      "Custom logo design",
      "Unlimited revisions",
      "Full brand kit",
      "Business card and stationery",
      "Social media kit",
      "Priority support",
    ],
  },
  {
    id: "launch",
    name: "Full Business Launch",
    sub: "The complete system",
    price: "$2,500+",
    blurb: "Brand, website and the systems to run it.",
    cta: "Talk to us",
    href: "/contact",
    features: [
      "Everything in Custom Brand",
      "Website and ecommerce",
      "CRM and admin center",
      "Automation and AI",
      "Hosting, SEO and launch",
    ],
  },
];

const STEPS = [
  { n: "1", Icon: IconCode, title: "Tell us about your business", body: "Answer a few questions about your business, industry and style." },
  { n: "2", Icon: IconSparkle, title: "AI creates concepts", body: "Our engine composes unique logo concepts just for you." },
  { n: "3", Icon: IconBrush, title: "Choose & customize", body: "Pick your favourite and tune colours, fonts and layout." },
  { n: "4", Icon: IconChart, title: "Download & launch", body: "Take your files and start building your brand." },
];

export default function LogoStudioPage() {
  return (
    <>
      {/* ══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="tt-hero tt-grid-bg border-b border-[color:var(--color-border)]">
        <div className="max-w-7xl mx-auto px-5 md:px-6 pt-14 pb-12 lg:pt-18 lg:pb-16 relative z-10">
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-12 items-center">
            <div className="tt-hero-rule">
              <div className="text-[12px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-5 flex items-center gap-2">
                <IconBrush size={15} />
                Tomorrow&rsquo;s Tech Logo Studio
              </div>
              <h1 className="text-[34px] md:text-[46px] font-extrabold tracking-[-0.03em] leading-[1.05] uppercase">
                AI-powered logo maker.
                <br />
                <span className="tt-gradient-text">Professionally unique.</span>
              </h1>
              <p className="text-[16px] md:text-[17px] text-[color:var(--color-text-secondary)] mt-5 max-w-md leading-relaxed">
                Create a stunning logo in minutes with our engine. Then let us
                perfect it by hand for your brand.
              </p>

              <ul className="mt-7 space-y-3.5">
                {[
                  { Icon: IconSparkle, t: "AI-generated concepts", b: "Multiple unique concepts tailored to your business." },
                  { Icon: IconBrush, t: "Professionally refined", b: "Our designers handcraft and refine your favourite." },
                  { Icon: IconCloud, t: "Complete brand kit", b: "Logos, colours, fonts, mockups and all the files you need." },
                ].map(({ Icon, t, b }) => (
                  <li key={t} className="flex gap-3">
                    <span className="tt-icon-tile !w-9 !h-9 !rounded-lg shrink-0">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold uppercase tracking-[0.06em]">{t}</span>
                      <span className="block text-[12.5px] text-[color:var(--color-text-muted)] mt-0.5">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/logo-studio/create" className="btn-primary uppercase tracking-[0.08em] px-6 py-3.5" data-magnetic>
                  Create my logo now
                  <IconArrowRight size={16} />
                </Link>
                <Link href="#how-it-works" className="btn-secondary uppercase tracking-[0.08em] px-6 py-3.5" data-magnetic>
                  <IconPlay size={16} />
                  See how it works
                </Link>
              </div>

              <div className="mt-7 flex items-center gap-3">
                <div className="flex text-[color:var(--color-blue-bright)]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <IconStar key={i} size={15} />
                  ))}
                </div>
                <span className="text-[12.5px] text-[color:var(--color-text-secondary)]">
                  Built by the team behind Tomorrow&rsquo;s Tech AI
                </span>
              </div>
            </div>

            <StudioPreview />
          </div>
        </div>

        {/* Feature strip */}
        <div className="max-w-7xl mx-auto px-5 md:px-6 pb-12 relative z-10">
          <div className="tt-glass grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-[color:var(--color-border-subtle)]">
            {FEATURES.map(({ Icon, title, body }) => (
              <div key={title} className="p-4 flex gap-3 min-w-0">
                <span className="tt-icon-tile !w-9 !h-9 !rounded-lg shrink-0">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.08em] leading-tight">{title}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-muted)] mt-1 leading-snug">{body}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING ════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 py-20">
        <div className="grid lg:grid-cols-[minmax(0,0.7fr)_minmax(0,2.4fr)] gap-10 items-start">
          <div className="lg:sticky lg:top-24">
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-4">
              Simple pricing
            </div>
            <h2 className="text-[30px] md:text-[36px] font-bold tracking-tight leading-[1.08]">
              Choose your
              <br />
              perfect logo.
            </h2>
            <p className="text-[15px] text-[color:var(--color-text-secondary)] mt-4 leading-relaxed">
              Start with the generator for free. Pay when you find one you love —
              and upgrade to custom whenever you&rsquo;re ready.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                data-spotlight
                className={`relative rounded-xl border p-6 flex flex-col ${
                  tier.popular
                    ? "border-[color:var(--color-blue)] bg-[rgba(59,130,246,0.06)]"
                    : "border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9.5px] font-bold tracking-[0.14em] uppercase bg-[color:var(--color-blue)] text-white rounded-full px-3 py-1">
                    Most popular
                  </span>
                )}
                <h3 className="text-[15px] font-bold uppercase tracking-[0.06em]">{tier.name}</h3>
                <div className="text-[11.5px] text-[color:var(--color-text-muted)] mt-0.5">{tier.sub}</div>
                <div className="text-[34px] font-extrabold tracking-tight mt-4">{tier.price}</div>
                <div className="text-[12px] text-[color:var(--color-text-muted)] mt-1 mb-5">{tier.blurb}</div>
                <ul className="space-y-2 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12.5px] text-[color:var(--color-text-secondary)]">
                      <IconBadgeCheck size={14} className="text-[color:var(--color-blue)] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.href}
                  className={`${tier.popular ? "btn-primary" : "btn-secondary"} w-full justify-center mt-6 text-[11.5px] uppercase tracking-[0.1em]`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ═══════════════════════════════════════════════ */}
      <section id="how-it-works" className="tt-tech-band scroll-mt-24">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-18 lg:py-20">
          <div className="text-center text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-4">
            How it works
          </div>
          <h2 className="text-center text-[26px] md:text-[34px] font-bold tracking-tight mb-12">
            Your new logo in 4 simple steps.
          </h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(({ n, Icon, title, body }) => (
              <li key={n} className="tt-layer-card" data-spotlight>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-7 h-7 rounded-full bg-[color:var(--color-blue)] text-white grid place-items-center text-[12px] font-bold shrink-0">
                    {n}
                  </span>
                  <span className="tt-icon-tile !w-10 !h-10">
                    <Icon size={18} />
                  </span>
                </div>
                <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] leading-snug">{title}</h3>
                <p className="text-[12.5px] text-[color:var(--color-text-secondary)] leading-relaxed mt-2">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ══ MORE THAN A LOGO ═══════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-4">
              Why businesses choose us
            </div>
            <h2 className="text-[30px] md:text-[38px] font-bold tracking-tight leading-[1.08]">
              More than a logo.
              <br />
              It&rsquo;s your brand
              <br />
              <span className="tt-gradient-text">foundation.</span>
            </h2>
            <p className="text-[15px] text-[color:var(--color-text-secondary)] mt-5 leading-relaxed max-w-md">
              Our process combines the speed of a generator with the judgement of
              real designers. And when you&rsquo;re ready, the same team builds the
              website, store and systems that run behind it.
            </p>
            <Link href="/services" className="btn-secondary mt-7 uppercase tracking-[0.08em]" data-magnetic>
              See the full business system
              <IconArrowRight size={15} />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { Icon: IconRocket, t: "Start in minutes", b: "No brief, no back-and-forth. Answer a few questions and see real concepts." },
              { Icon: IconBrush, t: "Refined by hand", b: "Upgrade any concept and a designer takes it the rest of the way." },
              { Icon: IconCloud, t: "Every file you need", b: "Vector for signs and wraps, raster for web and social, icons for apps." },
              { Icon: IconChart, t: "Room to grow", b: "The same brand carries into your website, store and admin system." },
            ].map(({ Icon, t, b }) => (
              <div key={t} className="tt-layer-card" data-spotlight>
                <span className="tt-icon-tile mb-4">
                  <Icon size={19} />
                </span>
                <h3 className="text-[13.5px] font-bold uppercase tracking-[0.05em]">{t}</h3>
                <p className="text-[12.5px] text-[color:var(--color-text-secondary)] leading-relaxed mt-2">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ════════════════════════════════════════════════════════ */}
      <section className="tt-final">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-16 text-center">
          <h2 className="text-[26px] md:text-[34px] font-bold tracking-tight uppercase">
            Ready to see your brand?
          </h2>
          <p className="text-[color:var(--color-text-secondary)] mt-4 text-[15px] max-w-xl mx-auto">
            Free to generate. Free to explore. Pay only when you find the one.
          </p>
          <Link
            href="/logo-studio/create"
            className="btn-primary mt-7 uppercase tracking-[0.08em] px-7 py-4"
            data-magnetic
          >
            Create my logo now
            <IconArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
