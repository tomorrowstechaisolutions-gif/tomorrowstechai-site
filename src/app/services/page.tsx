import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Services",
  description:
    "Custom business operating platforms, command centers, workflow automation, CRM, dashboards, apps, and AI built around the way your company actually runs.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Services · Tomorrow’s Tech AI",
    description:
      "A modern public website and a private operating system behind it—plus command centers, workflow automation, CRM, dashboards, apps, and AI.",
    url: "https://tomorrowstechai.com/services",
    type: "website",
  },
};

const paths = [
  {
    problem: "I need one system to run the business.",
    answer: "Business operating platforms",
    href: "#business-platforms",
  },
  {
    problem: "I can’t see what’s happening.",
    answer: "Command centers",
    href: "#command-centers",
  },
  {
    problem: "Our workflows keep breaking.",
    answer: "Workflow automation",
    href: "#workflow-automation",
  },
  {
    problem: "I just need a website, not a whole system.",
    answer: "Website packages",
    href: "#website-packages",
  },
  {
    problem: "I’m not sure where to begin.",
    answer: "Start with discovery",
    href: "#how-we-work",
  },
];

const websiteTiers = [
  {
    id: "starter",
    name: "Starter Website",
    tagline: "Get online fast, at the lowest price we offer.",
    price: "$149",
    turnaround: "2\u20133 business days after content",
    featured: false,
    includes: [
      "Up to 3 pages \u2014 Home, Services, Contact",
      "Professional starter layout customization",
      "Mobile responsive design",
      "Contact / lead form",
      "Basic SEO setup",
      "Domain connection and SSL",
      "Deployment",
      "1 revision round",
    ],
    excludes: [
      "E-commerce",
      "CRM",
      "Booking systems",
      "Advanced automation",
      "Custom app development",
      "Unlimited revisions",
    ],
    href: "/starter-website",
    ctaLabel: "See the $149 package",
  },
  {
    id: "classic",
    name: "Classic Business Website",
    tagline: "Professional, polished, ready to launch.",
    price: "$399",
    turnaround: "7\u201314 days",
    featured: true,
    includes: [
      "Up to 5 custom pages",
      "More customized design and custom page layouts",
      "Mobile responsive design",
      "Contact / lead form and enhanced contact forms",
      "Basic SEO setup",
      "Social media integration",
      "Google Maps / business location",
      "Testimonials / reviews section",
      "Basic analytics setup",
      "CMS / editing access where applicable",
      "Conversion-focused layout",
      "2 revision rounds and launch support",
    ],
    excludes: [],
    href: "/business-launch",
    ctaLabel: "See the $399 package",
  },
  {
    id: "professional",
    name: "Professional Business Website",
    tagline: "Built to generate and organize business, not just to exist.",
    price: "$699",
    turnaround: null,
    featured: false,
    includes: [
      "Up to 10 custom pages",
      "Premium custom design",
      "Custom graphics and image treatment",
      "Multiple lead forms plus a quote / request form",
      "Lead capture workflow",
      "CRM-ready integration",
      "Appointment / inquiry workflow",
      "Blog / news capability",
      "Google Analytics and Search Console setup",
      "Enhanced on-page SEO and conversion tracking",
      "Email notification automation",
      "Advanced testimonials and project galleries",
      "3 revision rounds",
      "30 days of launch support",
    ],
    excludes: [],
    href: "/professional-website",
    ctaLabel: "See the $699 package",
  },
  {
    id: "ecommerce",
    name: "E-Commerce Website",
    tagline: "Launch your online store and start selling.",
    price: "$999",
    turnaround: null,
    featured: false,
    includes: [
      "Custom e-commerce website",
      "Up to 8\u201310 informational pages",
      "Product catalog with categories, collections and search",
      "Up to 20 products entered by us \u2014 store supports 100+",
      "Shopping cart and secure checkout",
      "Payment integration (Stripe, PayPal and more)",
      "Shipping setup and tax configuration",
      "Order notifications",
      "Customer accounts with order history",
      "Social media integration",
      "Mobile responsive store",
      "Basic SEO and analytics setup",
      "3 revision rounds and launch support",
    ],
    excludes: [
      "Product data entry beyond 20 items",
      "Custom app development",
      "Advanced automation systems",
      "CRM or business workflows",
      "Ongoing management (available as an add-on)",
    ],
    href: "/contact",
    ctaLabel: "Talk through E-Commerce",
  },
];

const solutions = [
  {
    id: "business-platforms",
    number: "01",
    label: "The flagship build",
    title: "Custom business operating platforms",
    statement: "A modern website in front. The entire operation behind it.",
    body:
      "We build one connected system around your company: a high-performance public website for customers and a secure private backend for the people running the business. Every module is shaped around your processes instead of forcing the company into generic software.",
    includes: [
      "Custom public website, SEO, booking, and lead capture",
      "Private admin backend with roles and permissions",
      "CRM, customer records, lead pipeline, and follow-up",
      "Dashboards, apps, forms, approvals, and reporting",
      "Social content planning, asset workflows, and lead-source visibility",
      "AI assistants and automations with human approval controls",
    ],
    outcome: "One custom-built home for the public brand and the private operation.",
    timeline: "8–16 weeks",
    price: "Scoped proposal",
    visual: "platform",
  },
  {
    id: "command-centers",
    number: "02",
    label: "Visibility and control",
    title: "Command centers",
    statement: "One operating picture your leadership team can trust.",
    body:
      "We connect the sheets, reports, field updates, compliance records, and operational data already running your business—then turn them into one clear view of what is happening, what is slipping, and what needs attention.",
    includes: [
      "Smartsheet architecture and cross-sheet reporting",
      "Executive, operations, and field-level views",
      "Crew, fleet, job, compliance, and financial dashboards",
      "Alerts that surface risk before it becomes an emergency",
    ],
    outcome: "Stop searching for the answer. See it.",
    timeline: "4–8 weeks",
    price: "$5,000–$15,000",
    visual: "command",
  },
  {
    id: "workflow-automation",
    number: "03",
    label: "Flow and accountability",
    title: "Workflow automation",
    statement: "Move work from field capture to final approval without the chase.",
    body:
      "We map how work actually moves through your company—including the undocumented workarounds—then build a controlled path through forms, reviews, approvals, reporting, billing, and customer communication.",
    includes: [
      "Mobile-first field capture and intake forms",
      "Approval chains with clear owners and escalation rules",
      "Automated reports, notifications, and handoffs",
      "AI-assisted drafting with human approval boundaries",
    ],
    outcome: "Less chasing. Fewer dropped handoffs. Clear ownership.",
    timeline: "3–8 weeks",
    price: "$5,000–$15,000",
    visual: "workflow",
  },
  {
    id: "custom-ai",
    number: "04",
    label: "Purpose-built intelligence",
    title: "Custom AI systems",
    statement: "Software designed around your operation—not the average company.",
    body:
      "When an off-the-shelf platform cannot match the work, we build the missing system: internal tools, customer portals, private AI assistants, local AI deployments, and full operational products.",
    includes: [
      "Custom Next.js applications and internal platforms",
      "Private or local AI tuned to your business context",
      "Roles, permissions, audit trails, and approval controls",
      "Source ownership without per-seat platform lock-in",
    ],
    outcome: "A system that fits the operation instead of fighting it.",
    timeline: "6–12 weeks",
    price: "Scoped proposal",
    visual: "system",
  },
];

type Supporting = {
  title: string;
  body: string;
  meta: string;
  href?: string;
  hrefLabel?: string;
};

const supporting: Supporting[] = [
  {
    title: "Program management consulting",
    body: "PMO structure, schedule discipline, reporting cadence, and operational governance shaped by 18 years inside telecom and infrastructure programs.",
    meta: "4–12 weeks or ongoing",
  },
  {
    title: "Custom marketing websites",
    body: "The step above the packages. When the design, the words and the structure have to be yours rather than ours — original layout, copy written for your market, and as many pages as the business actually needs.",
    meta: "$1,500–$3,000 · 2–4 weeks",
  },
  {
    title: "Video and brand content",
    body: "Concept, production, editing, and campaign-ready cuts for websites, social media, and paid advertising.",
    meta: "Scoped by production",
  },
];

const pricing = [
  {
    engagement: "Custom business operating platform",
    range: "Scoped proposal",
    timeline: "8–16 weeks",
  },
  {
    engagement: "Command center or Smartsheet system",
    range: "$5,000–$15,000",
    timeline: "4–8 weeks",
  },
  {
    engagement: "AI workflow and operations automation",
    range: "$5,000–$15,000",
    timeline: "3–8 weeks",
  },
  {
    engagement: "Custom application or private AI",
    range: "Scoped proposal",
    timeline: "6–12 weeks",
  },
  {
    engagement: "Website package (Starter → E-Commerce)",
    range: "$149–$999 + $29/month",
    timeline: "From 2–3 days",
  },
  {
    engagement: "Custom marketing website",
    range: "$1,500–$3,000",
    timeline: "2–4 weeks",
  },
  {
    engagement: "Ongoing support and improvements",
    range: "From $200/month",
    timeline: "Monthly",
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="relative grid-overlay overflow-hidden border-b border-[color:var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-16 lg:pt-24 lg:pb-20 relative z-10">
          <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-14 lg:gap-20 items-center">
            <div>
              <div className="eyebrow mb-6">● Services · built around the operation</div>
              <h1 className="text-5xl md:text-6xl lg:text-[68px] font-medium leading-[1.02] tracking-[-0.045em] max-w-4xl">
                Fix the way the work{" "}
                <span className="text-[color:var(--color-cyan)]">moves.</span>
              </h1>
              <p className="text-lg md:text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-7 max-w-2xl">
                We build the visibility, workflows, and intelligent systems that
                operations-heavy companies need to run with less friction and
                more control.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/contact" className="btn-primary">
                  Show us where it&apos;s breaking →
                </Link>
                <Link href="/work" className="btn-secondary">
                  See what we&apos;ve built
                </Link>
              </div>
            </div>

            <div className="service-path-panel">
              <div className="px-5 py-4 border-b border-[color:var(--color-border)]">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                  Start with the problem
                </div>
                <h2 className="text-lg font-medium mt-1">What sounds most familiar?</h2>
              </div>
              <div className="p-3">
                {paths.map((path, index) => (
                  <a key={path.problem} href={path.href} className="service-path-row group">
                    <span className="service-path-number">0{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[color:var(--color-text)]">
                        {path.problem}
                      </span>
                      <span className="block text-xs text-[color:var(--color-cyan)] mt-0.5">
                        {path.answer}
                      </span>
                    </span>
                    <span className="text-[color:var(--color-text-muted)] group-hover:text-[color:var(--color-cyan)] transition-colors">
                      →
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="website-packages"
        className="border-b border-[color:var(--color-border)] scroll-mt-28"
      >
        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-24">
          <div className="max-w-3xl mb-12">
            <div className="eyebrow-muted mb-3">Website packages</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
              Four fixed-price ways to get online.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
              Proven layouts, a one-time build price, no hourly meter. Every
              package runs on hosting and management at $29/month, free for the
              first 30 days. When the design has to be original rather than
              proven, that is a custom build \u2014 priced further down this page.
            </p>
          </div>

          <div className="tier-grid">
            {websiteTiers.map((tier) => (
              <article
                key={tier.id}
                className="tier-card"
                data-featured={tier.featured ? "true" : "false"}
              >
                {tier.featured ? (
                  <div className="tier-flag">Most popular</div>
                ) : null}
                <h3 className="text-lg font-medium">{tier.name}</h3>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mt-1.5 min-h-[40px]">
                  {tier.tagline}
                </p>
                <div className="tier-price">
                  <span className="tier-price-value">{tier.price}</span>
                  <span className="tier-price-note">one time</span>
                </div>
                <div className="tier-hosting">
                  + $29/month hosting &middot; first 30 days free
                </div>
                {tier.turnaround ? (
                  <div className="tier-meta">Typical turnaround &middot; {tier.turnaround}</div>
                ) : null}
                <ul className="tier-list">
                  {tier.includes.map((item) => (
                    <li key={item} className="tier-list-item">
                      <span aria-hidden="true">&#10003;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {tier.excludes.length > 0 ? (
                  <div className="tier-excludes">
                    <div className="tier-excludes-label">Not included</div>
                    <p>{tier.excludes.join(" \u00b7 ")}</p>
                  </div>
                ) : null}
                <Link href={tier.href} className="tier-cta">
                  {tier.ctaLabel} &rarr;
                </Link>
              </article>
            ))}
          </div>

          <p className="tier-footnote">
            Every package is a proven layout built fast. If the design, the
            words and the structure have to be yours rather than ours, that is a
            custom marketing website, and if the business needs systems behind
            the site, that is a platform build. Both are below.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20 lg:py-24">
        <div className="max-w-3xl mb-14">
          <div className="eyebrow-muted mb-3">Four ways we solve it</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
            One flagship system. Three focused specialties.
          </h2>
          <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
            Most engagements land in one of these three systems. We start with
            the operational problem, then choose the smallest build that solves it.
          </p>
        </div>

        <div className="space-y-8">
          {solutions.map((solution) => (
            <article key={solution.id} id={solution.id} className="core-solution scroll-mt-28">
              <div className="core-solution-copy">
                <div className="flex items-center gap-3 mb-5">
                  <span className="solution-number">{solution.number}</span>
                  <span className="eyebrow-muted">{solution.label}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-medium tracking-tight">
                  {solution.title}
                </h2>
                <p className="text-xl text-[color:var(--color-text)] leading-snug mt-4 max-w-xl">
                  {solution.statement}
                </p>
                <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5 max-w-xl">
                  {solution.body}
                </p>
                <ul className="mt-7 grid sm:grid-cols-2 gap-x-7 gap-y-3">
                  {solution.includes.map((item) => (
                    <li key={item} className="solution-list-item">
                      <span aria-hidden="true">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
                  <ServiceMeta label="Typical timeline" value={solution.timeline} />
                  <ServiceMeta label="Typical investment" value={solution.price} accent />
                </div>
                <div className="mt-7 pt-5 border-t border-[color:var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm font-medium">{solution.outcome}</p>
                  <Link
                    href="/contact"
                    className="text-sm text-[color:var(--color-cyan)] hover:underline whitespace-nowrap"
                  >
                    Talk through this solution →
                  </Link>
                </div>
              </div>
              <SolutionVisual kind={solution.visual} />
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="job-catcher-feature">
          <div className="job-catcher-badge">JC</div>
          <div className="flex-1">
            <div className="eyebrow mb-2">● Featured product · contractors</div>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
              Job Catcher turns missed calls into another chance to win the work.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-3 max-w-3xl">
              We connect the contractor&apos;s business line and write custom
              responses around their trade, hours, service area, and tone. When
              the crew cannot answer, the customer gets an immediate text and
              the contractor gets another chance to win the work.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-sm text-[color:var(--color-cyan)]">$350/month managed service</span>
              <span className="text-sm text-[color:var(--color-text-muted)]">Free two-week pilot</span>
              <Link href="/job-catcher" className="text-sm text-[color:var(--color-text)] hover:text-[color:var(--color-cyan)]">
                See Job Catcher →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/35">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-[0.88fr_1.12fr] gap-10 lg:gap-16 items-center">
            <div>
              <div className="eyebrow mb-4">● Client proof</div>
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
                One brand experience, built from top to bottom.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5">
                For The Field House Gym, we built the positioning, website,
                customer journey, lead capture, onboarding flow, FAQs, and
                campaign video used across both Texas locations.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-4">
                <ProofMetric label="Locations supported" value="Two" />
                <ProofMetric label="Customer access" value="24 / 7" />
                <ProofMetric label="Delivery" value="Site + video" />
                <ProofMetric label="Status" value="Live" accent />
              </div>
              <Link href="/work" className="inline-flex mt-8 text-sm text-[color:var(--color-cyan)] hover:underline">
                See the full body of work →
              </Link>
            </div>
            <div className="relative aspect-[16/10] rounded-xl overflow-hidden border border-[color:var(--color-border)] shadow-[0_28px_70px_-40px_rgba(0,217,255,0.45)]">
              <Image
                src="/work/fieldhouse.png"
                alt="The Field House Gym website"
                fill
                sizes="(max-width: 1024px) 100vw, 650px"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-20 lg:py-24">
        <div className="grid lg:grid-cols-[0.72fr_1.28fr] gap-10 lg:gap-16">
          <div>
            <div className="eyebrow-muted mb-3">Supporting capabilities</div>
            <h2 className="text-3xl font-medium tracking-tight leading-tight">
              When the system needs more than software.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
              These capabilities support the core operational build without
              competing with it.
            </p>
          </div>
          <div className="divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {supporting.map((item, index) => (
              <div key={item.title} className="supporting-row">
                <span className="font-mono text-xs text-[color:var(--color-cyan)] pt-1">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-medium">{item.title}</h3>
                  <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mt-2">
                    {item.body}
                  </p>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-muted)] mt-3">
                    {item.meta}
                  </div>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="inline-block mt-3 text-sm text-[color:var(--color-cyan)] border-b border-[color:var(--color-cyan)]/30 hover:border-[color:var(--color-cyan)] pb-0.5 transition-colors"
                    >
                      {item.hrefLabel ?? "Read more →"}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/35">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-[0.7fr_1.3fr] gap-10 lg:gap-16">
            <div>
              <div className="eyebrow-muted mb-3">Straight answers</div>
              <h2 className="text-3xl font-medium tracking-tight">
                Typical engagement ranges.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
                You get an all-in number before work begins. No hourly meter and
                no surprise invoice at the end.
              </p>
            </div>
            <div className="pricing-table" role="table" aria-label="Typical service pricing">
              <div className="pricing-row pricing-header" role="row">
                <span role="columnheader">Engagement</span>
                <span role="columnheader">Typical range</span>
                <span role="columnheader">Timeline</span>
              </div>
              {pricing.map((item) => (
                <div key={item.engagement} className="pricing-row" role="row">
                  <span role="cell" className="text-[color:var(--color-text)]">
                    {item.engagement}
                  </span>
                  <span role="cell" className="text-[color:var(--color-cyan)]">
                    {item.range}
                  </span>
                  <span role="cell">{item.timeline}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-we-work" className="max-w-7xl mx-auto px-6 py-20 lg:py-24 scroll-mt-28">
        <div className="max-w-3xl mb-12">
          <div className="eyebrow-muted mb-3">How we work</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight">
            Three stages. Nothing hidden.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-px bg-[color:var(--color-border)] border border-[color:var(--color-border)] rounded-xl overflow-hidden">
          <Process
            n="01"
            title="Diagnose"
            body="We map the real workflow, the data, the ownership gaps, and the highest-leverage place to start."
          />
          <Process
            n="02"
            title="Build and prove"
            body="We build the smallest useful system, test it with the people doing the work, and earn trust before expanding."
          />
          <Process
            n="03"
            title="Deploy and improve"
            body="We launch, train the team, document the boundaries, and keep improving the system as the operation changes."
          />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="services-cta">
          <div>
            <div className="eyebrow mb-3">● Start with the operational problem</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-2xl">
              Build the system that runs your business.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-xl">
              Start with the public brand, the private operation, or the gap
              between them. We&apos;ll map the right platform around the company.
            </p>
          </div>
          <Link href="/contact" className="btn-primary whitespace-nowrap">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}

function ServiceMeta({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--color-text-muted)]">
        {label}
      </div>
      <div className={`text-sm mt-1 ${accent ? "text-[color:var(--color-cyan)]" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function SolutionVisual({ kind }: { kind: string }) {
  if (kind === "platform") {
    return (
      <div className="solution-visual">
        <div className="visual-label">One connected business platform</div>
        <div className="platform-architecture">
          <div className="platform-layer platform-layer-public">
            <span>Public experience</span>
            <strong>Website · SEO · Leads · Booking</strong>
          </div>
          <div className="platform-connector">Connected company data</div>
          <div className="platform-layer platform-layer-private">
            <span>Private operation</span>
            <strong>Admin · CRM · Apps · Dashboards</strong>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {["Workflows", "Reporting", "Social systems", "AI controls"].map((item) => (
            <div key={item} className="system-module">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-cyan)]" />
              {item}
            </div>
          ))}
        </div>
        <div className="visual-note">Built around the business. Owned by the business.</div>
      </div>
    );
  }

  if (kind === "workflow") {
    return (
      <div className="solution-visual">
        <div className="visual-label">Controlled workflow</div>
        <div className="workflow-stack">
          {[
            ["01", "Field capture", "Complete"],
            ["02", "Operations review", "In progress"],
            ["03", "AI draft", "Queued"],
            ["04", "Human approval", "Required"],
          ].map(([n, title, status], index) => (
            <div key={title} className="workflow-step">
              <span className="workflow-step-number">{n}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-[color:var(--color-text-muted)] mt-0.5">
                  {status}
                </span>
              </span>
              <span className={`workflow-step-dot ${index < 2 ? "is-active" : ""}`} />
            </div>
          ))}
        </div>
        <div className="visual-note">Nothing moves without a clear owner.</div>
      </div>
    );
  }

  if (kind === "system") {
    return (
      <div className="solution-visual">
        <div className="visual-label">Purpose-built system</div>
        <div className="system-core">
          <div className="system-core-title">Your operation</div>
          <div className="system-core-subtitle">One controlled environment</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {["Live data", "Private AI", "Role controls", "Audit trail"].map((item) => (
            <div key={item} className="system-module">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-cyan)]" />
              {item}
            </div>
          ))}
        </div>
        <div className="visual-note">Your data. Your rules. Your source code.</div>
      </div>
    );
  }

  return (
    <div className="solution-visual">
      <div className="flex items-center justify-between">
        <div className="visual-label">Live operating picture</div>
        <span className="live-pill">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-success)]" />
          Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-5">
        <DashboardMetric label="Jobs on track" value="84%" />
        <DashboardMetric label="Needs attention" value="07" warn />
        <DashboardMetric label="Crew readiness" value="92%" />
        <DashboardMetric label="Open approvals" value="03" warn />
      </div>
      <div className="mt-3 h-2 rounded-full bg-[color:var(--color-border)] overflow-hidden">
        <div className="h-full w-[84%] bg-gradient-to-r from-[color:var(--color-cyan-deep)] to-[color:var(--color-cyan)]" />
      </div>
      <div className="visual-note">The answer is visible before the meeting starts.</div>
    </div>
  );
}

function DashboardMetric({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="dashboard-metric">
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
        {label}
      </div>
      <div className={`text-2xl font-medium mt-2 ${warn ? "text-[color:var(--color-amber)]" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ProofMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-l border-[color:var(--color-border)] pl-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-muted)]">
        {label}
      </div>
      <div className={`text-sm font-medium mt-1 ${accent ? "text-[color:var(--color-success)]" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Process({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-[color:var(--color-surface)] p-7 md:p-8">
      <div className="font-mono text-sm text-[color:var(--color-cyan)] tracking-widest">
        {n}
      </div>
      <h3 className="text-xl font-medium mt-5">{title}</h3>
      <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mt-3">
        {body}
      </p>
    </div>
  );
}
