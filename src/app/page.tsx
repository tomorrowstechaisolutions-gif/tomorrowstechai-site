import Link from "next/link";
import Image from "next/image";
import { posts } from "@/content/posts";
import { NewsletterForm } from "@/components/NewsletterForm";
import { IndustryRail } from "@/components/IndustryRail";
import { CommandCenter } from "@/components/home/CommandCenter";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconBot,
  IconBrain,
  IconBrush,
  IconCart,
  IconCloud,
  IconCode,
  IconCpu,
  IconDashboard,
  IconDesktopTower,
  IconInfinity,
  IconMegaphone,
  IconMonitor,
  IconPhone,
  IconPlay,
  IconPlug,
  IconRocket,
  IconSparkle,
  IconStar,
  IconUsers,
} from "@/components/Icons";

/* ── Hero connector labels ──────────────────────────────────────────────── */

/** `\n` forces the two-line breaks from the mockup; rendered with whitespace-pre-line. */
const HERO_LABELS = [
  { Icon: IconMonitor, label: "Website\n& brand" },
  { Icon: IconCart, label: "E-commerce" },
  { Icon: IconUsers, label: "CRM & leads" },
  { Icon: IconDashboard, label: "Admin\ndashboard" },
  { Icon: IconBot, label: "AI &\nautomation" },
  { Icon: IconMegaphone, label: "Social &\nmarketing" },
];

const HERO_STATS = [
  { Icon: IconUsers, value: "18+", label: "Years experience" },
  { Icon: IconRocket, value: "100s", label: "Businesses built" },
  { Icon: IconStar, value: "5.0", label: "Client rating" },
  { Icon: IconBadgeCheck, value: "1", label: "Complete system" },
  { Icon: IconInfinity, value: "∞", label: "Possibilities" },
];

/* ── The five capability layers ─────────────────────────────────────────── */

const LAYERS = [
  {
    Icon: IconBrush,
    title: "Build",
    sub: "your brand",
    body: "Logo, branding, website, hosting, domain, SEO, ecommerce store, and 3D experiences.",
  },
  {
    Icon: IconDashboard,
    title: "Run",
    sub: "your business",
    body: "Private admin center, dashboard, CRM, leads, customers, orders, scheduling, documents.",
  },
  {
    Icon: IconMegaphone,
    title: "Grow",
    sub: "your audience",
    body: "Social media center, content, campaigns, reputation, SEO, and lead nurturing.",
  },
  {
    Icon: IconBrain,
    title: "Automate",
    sub: "with AI & intelligence",
    body: "AI assistants, smart workflows, automations, reporting, and business insights.",
  },
  {
    Icon: IconCode,
    title: "Custom software",
    sub: "& technology",
    body: "Custom apps, SaaS products, computer builds, local AI systems, and integrations.",
  },
];

const TECH = [
  { Icon: IconCode, label: "Custom software" },
  { Icon: IconPhone, label: "Mobile apps" },
  { Icon: IconCloud, label: "SaaS solutions" },
  { Icon: IconSparkle, label: "AI & machine learning" },
  { Icon: IconDesktopTower, label: "Computer builds" },
  { Icon: IconCpu, label: "Local AI systems" },
  { Icon: IconPlug, label: "Integrations & development" },
];

const CASES = [
  {
    name: "Purrfrequency",
    stack: "3D website · E-commerce · Brand",
    body: "Immersive 3D experience with a full online store and custom branding.",
    image: "/work/purrfrequency.webp",
    href: "/work",
  },
  {
    name: "Field House",
    stack: "Website · Lead gen · Automation",
    body: "Complete digital system with lead capture and automated follow-up.",
    image: "/work/fieldhouse.png",
    href: "/work",
  },
  {
    name: "Mintline",
    stack: "Brand · Website · Dashboard",
    body: "Modern brand and custom admin dashboard to run the business.",
    image: "/work/mintline.webp",
    href: "/work",
  },
  {
    name: "Held",
    stack: "E-commerce · Branding · CRM",
    body: "E-commerce store with CRM and customer management system.",
    image: "/work/held.webp",
    href: "/work",
  },
];

const CLIENT_LOGOS = ["Field House", "Mintline", "Held", "Purrfrequency", "Job Catcher"];

export default function Home() {
  const latestPosts = posts
    .filter((post) => !post.tags.includes("Aegis Fleet AI"))
    .slice(0, 3);

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="tt-hero tt-grid-bg border-b border-[color:var(--color-border)]">
        <div className="max-w-7xl mx-auto px-5 md:px-6 pt-14 pb-10 lg:pt-20 lg:pb-14 relative z-10">
          <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] gap-12 lg:gap-8 items-center">
            {/* Copy */}
            <div className="tt-hero-rule">
              <div className="text-[12px] font-semibold tracking-[0.28em] uppercase text-[color:var(--color-blue-bright)] mb-6">
                We build. You grow.
              </div>
              <h1 className="tt-h1">
                We build
                <br />
                <span className="tt-gradient-text">modern</span>
                <br />
                businesses.
              </h1>
              <p className="text-[17px] md:text-lg text-[color:var(--color-text-secondary)] mt-7 max-w-lg leading-relaxed">
                From brand to backend. From website to workflow. Everything you
                need to launch, run, and scale—all in{" "}
                <span className="text-[color:var(--color-blue-bright)] font-medium">
                  one powerful system.
                </span>
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/contact" className="btn-primary uppercase tracking-[0.08em] px-6 py-3.5" data-magnetic>
                  Build my business
                  <IconArrowRight size={16} />
                </Link>
                <Link href="/services" className="btn-secondary uppercase tracking-[0.08em] px-6 py-3.5" data-magnetic>
                  <IconPlay size={17} />
                  See how it works
                </Link>
              </div>
            </div>

            {/* Building render + connector labels.
                Below lg the labels drop under the image as a two-column grid so
                the fixed-width column never squeezes the render. */}
            <div className="flex flex-col lg:flex-row items-center gap-7 lg:gap-6">
              <div className="tt-hero-visual relative w-full lg:flex-1 min-w-0 lg:-my-6 xl:-mr-6">
                {/* Aspect matches the asset (1020x941) so object-contain fills the
                    box exactly — no letterboxing, no wasted vertical space. The
                    asset's edges are alpha-feathered, so it dissolves into the
                    page rather than showing a black rectangle. */}
                <div className="relative aspect-[1020/941]">
                  <Image
                    src="/hero-building.webp"
                    alt="The Tomorrow’s Tech AI business system, visualised as a connected building"
                    fill
                    priority
                    fetchPriority="high"
                    sizes="(max-width: 1024px) 92vw, 640px"
                    className="object-contain"
                  />
                </div>
              </div>

              <ul className="tt-hero-labels w-full lg:w-[184px] lg:shrink-0">
                {HERO_LABELS.map(({ Icon, label }, i) => (
                  <li key={label} className="tt-hero-label" style={{ ["--pulse-delay" as string]: `${i * 0.45}s` }}>
                    <span className="tt-hero-label-dot" aria-hidden="true" />
                    <Icon size={19} className="text-[color:var(--color-blue-bright)] shrink-0" />
                    <strong className="whitespace-pre-line">{label}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Stat bar */}
        <div className="max-w-7xl mx-auto px-5 md:px-6 pb-12 relative z-10">
          <div className="tt-glass tt-statbar">
            {HERO_STATS.map(({ Icon, value, label }) => (
              <div key={label}>
                <Icon size={24} className="text-[color:var(--color-blue-bright)] shrink-0" />
                <div className="min-w-0">
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CLIENT STRIP ══════════════════════════════════════════════════ */}
      <section className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/25">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-6 flex flex-wrap items-center gap-x-10 gap-y-4">
          <div className="text-[10.5px] font-semibold tracking-[0.2em] uppercase text-[color:var(--color-text-muted)]">
            Trusted by businesses across the U.S.
          </div>
          <div className="tt-logostrip">
            {CLIENT_LOGOS.map((name) => (
              <span key={name}>
                <IconBadgeCheck size={15} />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FIVE CAPABILITY LAYERS ════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 py-20 lg:py-24">
        <h2 className="text-center text-[26px] md:text-[34px] font-bold tracking-tight uppercase leading-tight">
          Everything your business needs.{" "}
          <span className="tt-gradient-text">All in one system.</span>
        </h2>
        <p className="text-center text-[color:var(--color-text-secondary)] mt-4 max-w-2xl mx-auto leading-relaxed">
          Five capability layers that combine into one flagship offer—the
          TomorrowsTech Business System. Start with what you need. Add the rest
          as you grow.
        </p>

        <div className="grid gap-4 mt-12 sm:grid-cols-2 lg:grid-cols-5">
          {LAYERS.map(({ Icon, title, sub, body }) => (
            <Link key={title} href="/services" className="tt-layer-card group" data-spotlight>
              <span className="tt-icon-tile mb-5">
                <Icon size={21} />
              </span>
              <h3 className="tt-layer-title">
                {title}
                <em>{sub}</em>
              </h3>
              <p className="text-[13.5px] leading-relaxed text-[color:var(--color-text-secondary)] mt-3.5 flex-1">
                {body}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--color-blue)] group-hover:text-[color:var(--color-blue-bright)] transition-colors">
                Learn more
                <IconArrowRight size={13} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ COMMAND CENTER ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 pb-20 lg:pb-24">
        <div className="grid lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.55fr)] gap-10 lg:gap-12 items-center">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-4">
              Your business command center
            </div>
            <h2 className="text-[30px] md:text-[38px] font-bold tracking-tight leading-[1.08]">
              The power behind
              <br />
              your business.
            </h2>
            <p className="text-lg text-[color:var(--color-text-secondary)] mt-4">
              One dashboard to run everything.
            </p>
            <p className="text-[15px] text-[color:var(--color-text-secondary)] leading-relaxed mt-5 max-w-md">
              See your leads, sales, orders, customers, appointments, inventory,
              and marketing in one place—built around how your business actually
              works.
            </p>
            <ul className="mt-7 space-y-3">
              {["Real-time data", "AI insights", "Automations", "Mobile ready"].map((item) => (
                <li key={item} className="flex items-center gap-3 text-[15px]">
                  <IconBadgeCheck size={19} className="text-[color:var(--color-blue)] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/services" className="btn-secondary mt-8 uppercase tracking-[0.08em]">
              Explore the dashboard
              <IconArrowRight size={15} />
            </Link>
          </div>

          <CommandCenter />
        </div>
      </section>

      {/* ══ INDUSTRIES ════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 pb-20 lg:pb-24">
        <div className="text-center text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-8">
          Solutions for every industry
        </div>
        <IndustryRail />
      </section>

      {/* ══ RESULTS ═══════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 pb-20 lg:pb-24">
        <h2 className="text-center text-[26px] md:text-[34px] font-bold tracking-tight uppercase leading-tight mb-12">
          Real businesses. <span className="tt-gradient-text">Real results.</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CASES.map((item) => (
            <Link key={item.name} href={item.href} className="tt-case group" data-spotlight>
              <div className="tt-case-media">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 260px"
                    className="object-cover"
                  />
                ) : (
                  <div className="tt-case-fallback">{item.name.slice(0, 4).toUpperCase()}</div>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="text-[15px] font-bold uppercase tracking-[0.06em]">{item.name}</h3>
                <div className="text-[11px] text-[color:var(--color-blue)] mt-1.5 font-medium">
                  {item.stack}
                </div>
                <p className="text-[13px] leading-relaxed text-[color:var(--color-text-secondary)] mt-2.5 flex-1">
                  {item.body}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--color-blue)] group-hover:text-[color:var(--color-blue-bright)] transition-colors">
                  View case study
                  <IconArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}

          <Link
            href="/work"
            data-spotlight
            className="tt-case items-center justify-center text-center p-7 !bg-[linear-gradient(160deg,rgba(59,130,246,0.14),rgba(99,102,241,0.06))] border-[color:var(--color-blue-deep)]"
          >
            <h3 className="text-[17px] font-bold uppercase tracking-[0.05em] leading-snug">
              See what we
              <br />
              can build
              <br />
              for you
            </h3>
            <span className="btn-secondary mt-6 text-[11px] uppercase tracking-[0.14em]">
              View all work
              <IconArrowRight size={13} />
            </span>
          </Link>
        </div>
      </section>

      {/* ══ TECHNOLOGY BAND ═══════════════════════════════════════════════ */}
      <section className="tt-tech-band">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-16">
          <h2 className="text-center text-[24px] md:text-[30px] font-bold tracking-tight uppercase mb-10">
            Technology, software &amp; <span className="tt-gradient-text">hardware</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {TECH.map(({ Icon, label }) => (
              <Link key={label} href="/services" className="tt-tech-item">
                <span className="tt-icon-tile">
                  <Icon size={21} />
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FROM THE FIELD ════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 py-20">
        <div className="flex items-end justify-between gap-6 mb-9">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase text-[color:var(--color-blue-bright)] mb-3">
              From the field
            </div>
            <h2 className="text-[26px] md:text-[32px] font-bold tracking-tight">
              What we&apos;re building and learning.
            </h2>
          </div>
          <Link
            href="/blog"
            className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--color-blue)] hover:text-[color:var(--color-blue-bright)] whitespace-nowrap py-2 transition-colors"
          >
            All posts →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {latestPosts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="tt-case group" data-spotlight>
              {post.image && (
                <div className="tt-case-media !aspect-[16/9]">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 380px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-[color:var(--color-text-muted)] mb-2.5">
                  {post.date}
                </div>
                <h3 className="text-[17px] font-semibold leading-snug mb-2">{post.title}</h3>
                <p className="text-[13.5px] text-[color:var(--color-text-secondary)] leading-relaxed">
                  {post.excerpt}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ══ NEWSLETTER ════════════════════════════════════════════════════ */}
      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/30">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-14 md:flex md:items-center md:justify-between gap-12">
          <div className="md:max-w-md mb-6 md:mb-0">
            <h2 className="text-[22px] md:text-[26px] font-bold tracking-tight mb-2.5">
              Get the next one in your inbox.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
              Short notes on building, running, and automating a modern business.
              No spam. Unsubscribe any time.
            </p>
          </div>
          <div className="flex-1 max-w-lg">
            <NewsletterForm />
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ═════════════════════════════════════════════════════ */}
      <section className="tt-final">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-16 lg:py-20 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-12 items-center">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-4">
            {[
              { value: "18+", label: "Years of experience" },
              { value: "100s", label: "Businesses built" },
              { value: "1", label: "Complete system" },
              { value: "∞", label: "Possibilities" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-[30px] lg:text-[34px] font-bold tracking-tight tt-gradient-text leading-none">
                  {value}
                </div>
                <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--color-text-muted)] mt-2.5 leading-relaxed">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-[26px] md:text-[32px] font-bold tracking-tight uppercase leading-tight">
              Ready to build your business?
            </h2>
            <p className="text-[color:var(--color-text-secondary)] mt-4 text-[15px] leading-relaxed max-w-lg">
              Let&apos;s build the foundation your business deserves. The future
              starts now.
            </p>
            <Link href="/contact" className="btn-primary mt-7 uppercase tracking-[0.08em] px-6 py-3.5" data-magnetic>
              Start your project
              <IconArrowRight size={16} />
            </Link>
            <div className="text-[12px] text-[color:var(--color-text-muted)] mt-4">
              No pressure. Just a conversation.
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
