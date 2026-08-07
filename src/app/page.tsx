import Link from "next/link";
import Image from "next/image";
import { posts } from "@/content/posts";
import { NewsletterForm } from "@/components/NewsletterForm";
import { IndustryRail } from "@/components/IndustryRail";
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
    image: null,
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
    image: "/work/mintline.png",
    href: "/work",
  },
  {
    name: "Held",
    stack: "E-commerce · Branding · CRM",
    body: "E-commerce store with CRM and customer management system.",
    image: "/work/held.png",
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
                <Link href="/contact" className="btn-primary uppercase tracking-[0.08em] px-6 py-3.5">
                  Build my business
                  <IconArrowRight size={16} />
                </Link>
                <Link href="/services" className="btn-secondary uppercase tracking-[0.08em] px-6 py-3.5">
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
                    alt="The TomorrowsTech AI business system, visualised as a connected building"
                    fill
                    priority
                    fetchPriority="high"
                    sizes="(max-width: 1024px) 92vw, 640px"
                    className="object-contain"
                  />
                </div>
              </div>

              <ul className="tt-hero-labels w-full lg:w-[184px] lg:shrink-0">
                {HERO_LABELS.map(({ Icon, label }) => (
                  <li key={label} className="tt-hero-label">
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
            <Link key={title} href="/services" className="tt-layer-card group">
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
            <Link key={item.name} href={item.href} className="tt-case group">
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
            <Link key={post.slug} href={`/blog/${post.slug}`} className="tt-case group">
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
            <Link href="/contact" className="btn-primary mt-7 uppercase tracking-[0.08em] px-6 py-3.5">
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

/* ═══════════════════════════════════════════════════════════════════════
   Command center — a representative admin dashboard, drawn entirely in
   markup + SVG so it costs no image payload and recolors with the theme.
   Figures are illustrative sample data, not a real client account.
   ═══════════════════════════════════════════════════════════════════════ */

const DASH_NAV = [
  "Dashboard",
  "Leads",
  "Customers",
  "Orders",
  "Calendar",
  "Products",
  "Marketing",
  "Reports",
  "Automations",
  "Settings",
];

const DASH_KPIS = [
  { label: "New leads", value: "128", delta: "+24%" },
  { label: "Sales", value: "$24,560", delta: "+18%" },
  { label: "Orders", value: "84", delta: "+12%" },
  { label: "Revenue", value: "$96,430", delta: "+11%" },
];

const DASH_SOURCES = [
  { name: "Website", pct: 42, color: "#3B82F6" },
  { name: "Facebook", pct: 28, color: "#6366F1" },
  { name: "Instagram", pct: 15, color: "#8B5CF6" },
  { name: "Google", pct: 10, color: "#22C55E" },
  { name: "Other", pct: 5, color: "#475569" },
];

const DASH_APPTS = [
  { time: "10:00 AM", title: "Pool estimate", who: "Sarah Johnson" },
  { time: "1:00 PM", title: "Consultation call", who: "Mike Reyes" },
  { time: "3:30 PM", title: "Site visit", who: "Dana Whitfield" },
];

function CommandCenter() {
  return (
    <div className="tt-dash" aria-label="Representative business dashboard">
      <div className="grid grid-cols-[124px_minmax(0,1fr)] md:grid-cols-[150px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="tt-dash-side p-3 hidden sm:block">
          <div className="flex items-center gap-2 px-1.5 pb-4 mb-2 border-b border-[color:var(--color-border-subtle)]">
            <span className="w-4 h-4 rounded bg-[color:var(--color-blue)]" />
            <span className="text-[9.5px] font-bold tracking-[0.06em] uppercase truncate">
              TomorrowsTech
            </span>
          </div>
          <nav className="space-y-0.5">
            {DASH_NAV.map((item, i) => (
              <div key={item} className="tt-dash-nav" data-active={i === 0}>
                <span className="w-1.5 h-1.5 rounded-sm bg-current opacity-70 shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="p-3.5 md:p-5 col-span-2 sm:col-span-1">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-[14px] md:text-[16px] font-semibold">Welcome back, John</div>
              <div className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">
                Here&apos;s what&apos;s happening in your business today.
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-[color:var(--color-text-muted)] border border-[color:var(--color-border-subtle)] rounded-md px-2.5 py-1.5">
              Quick actions
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
            {DASH_KPIS.map(({ label, value, delta }) => (
              <div key={label} className="tt-dash-panel tt-dash-kpi">
                <span>{label}</span>
                <strong>{value}</strong>
                <div className="text-[9.5px] text-[color:var(--color-success)] mt-1 whitespace-nowrap">
                  {delta} <span className="text-[color:var(--color-text-muted)]">vs 7 days</span>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.05fr)] gap-2 mb-2">
            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Sales overview</div>
              <SalesChart />
            </div>

            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Leads by source</div>
              <div className="flex items-center gap-3">
                <Donut />
                <ul className="space-y-1 min-w-0">
                  {DASH_SOURCES.map((s) => (
                    <li key={s.name} className="flex items-center gap-1.5 text-[9.5px] whitespace-nowrap">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: s.color }}
                      />
                      <span className="text-[color:var(--color-text-secondary)] truncate">{s.name}</span>
                      <span className="text-[color:var(--color-text-muted)] ml-auto">{s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Upcoming appointments</div>
              <ul className="space-y-2">
                {DASH_APPTS.map((a) => (
                  <li key={a.time} className="flex items-start gap-2">
                    <span className="text-[9.5px] font-medium text-[color:var(--color-blue)] w-[52px] shrink-0 pt-px">
                      {a.time}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10.5px] truncate">{a.title}</span>
                      <span className="block text-[9.5px] text-[color:var(--color-text-muted)] truncate">
                        {a.who}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Activity + assistant */}
          <div className="grid lg:grid-cols-2 gap-2">
            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2.5">Recent activity</div>
              <ul className="space-y-2">
                {[
                  { dot: "var(--color-success)", text: "New lead from website", time: "2 min ago" },
                  { dot: "var(--color-amber)", text: "New order #1234", time: "18 min ago" },
                  { dot: "var(--color-blue)", text: "Invoice paid — Mintline", time: "1 hr ago" },
                ].map((row) => (
                  <li key={row.text} className="flex items-center gap-2 text-[10.5px]">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: row.dot }}
                    />
                    <span className="truncate">{row.text}</span>
                    <span className="ml-auto text-[9.5px] text-[color:var(--color-text-muted)] shrink-0">
                      {row.time}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tt-dash-panel !bg-[rgba(59,130,246,0.07)] !border-[rgba(59,130,246,0.28)]">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[color:var(--color-blue-bright)] mb-2.5">
                <IconSparkle size={13} />
                AI assistant
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg)]/60 px-2.5 py-2 text-[10.5px] text-[color:var(--color-text-muted)]">
                  What would you like to do today?
                </div>
                <span className="tt-icon-tile !w-8 !h-8 !rounded-lg">
                  <IconBot size={15} />
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {["Summarize this week", "Draft follow-ups", "Flag stale leads"].map((chip) => (
                  <span
                    key={chip}
                    className="text-[9px] rounded-full border border-[color:var(--color-border-subtle)] px-2 py-1 text-[color:var(--color-text-secondary)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Illustrative sales trend. Points are a fixed path — no live data. */
function SalesChart() {
  const points = [26, 34, 30, 44, 38, 52, 47, 63, 58, 72, 66, 80];
  const w = 260;
  const h = 76;
  const step = w / (points.length - 1);
  const max = 90;
  const coords = points.map((p, i) => [i * step, h - (p / max) * h] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="tt-sales-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          y1={h * f}
          x2={w}
          y2={h * f}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-[color:var(--color-border-subtle)]"
        />
      ))}
      <path d={area} fill="url(#tt-sales-fill)" />
      <path d={line} fill="none" stroke="#60A5FA" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3" fill="#60A5FA" />
    </svg>
  );
}

/**
 * Donut built from stroke-dasharray arcs so it needs no chart library.
 * Arc offsets are precomputed as a running total rather than mutated during
 * render, so the output is identical on every pass.
 */
const DONUT_R = 22;
const DONUT_C = 2 * Math.PI * DONUT_R;

const DONUT_ARCS = DASH_SOURCES.map((s, i) => {
  const len = (s.pct / 100) * DONUT_C;
  const start = DASH_SOURCES.slice(0, i).reduce((sum, prev) => sum + (prev.pct / 100) * DONUT_C, 0);
  return { ...s, len, start };
});

function Donut() {
  return (
    <svg viewBox="0 0 60 60" className="w-[62px] h-[62px] shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="30" cy="30" r={DONUT_R} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="9" />
      {DONUT_ARCS.map((arc) => (
        <circle
          key={arc.name}
          cx="30"
          cy="30"
          r={DONUT_R}
          fill="none"
          stroke={arc.color}
          strokeWidth="9"
          strokeDasharray={`${arc.len} ${DONUT_C - arc.len}`}
          strokeDashoffset={-arc.start}
        />
      ))}
    </svg>
  );
}
