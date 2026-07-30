import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Services",
  description:
    "Command centers, workflow automation, and custom AI systems for construction, field operations, contractors, and operations-heavy businesses.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Services · TomorrowsTech AI",
    description:
      "Three focused ways to bring visibility, control, and intelligent automation to the operations that run your business.",
    url: "https://tomorrowstechai.com/services",
    type: "website",
  },
};

const paths = [
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
    problem: "We need software that fits us.",
    answer: "Custom AI systems",
    href: "#custom-ai",
  },
  {
    problem: "I’m not sure where to begin.",
    answer: "Start with discovery",
    href: "#how-we-work",
  },
];

const solutions = [
  {
    id: "command-centers",
    number: "01",
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
    number: "02",
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
    number: "03",
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

const supporting = [
  {
    title: "Program management consulting",
    body: "PMO structure, schedule discipline, reporting cadence, and operational governance shaped by 18 years inside telecom and infrastructure programs.",
    meta: "4–12 weeks or ongoing",
  },
  {
    title: "Website design and build",
    body: "Fast, custom-coded Next.js websites with SEO, booking, lead capture, analytics, and a visual system built around your actual brand.",
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

      <section className="max-w-7xl mx-auto px-6 py-20 lg:py-24">
        <div className="max-w-3xl mb-14">
          <div className="eyebrow-muted mb-3">Three ways we solve it</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
            Fewer service lines. Clearer outcomes.
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

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/35">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-[0.88fr_1.12fr] gap-10 lg:gap-16 items-center">
            <div>
              <div className="eyebrow mb-4">● Proof, not a pitch deck</div>
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
                Built for the operational reality.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5">
                Aegis Fleet AI brings vehicle readiness, preventive maintenance,
                compliance, dispatch context, and AI-assisted oversight into one
                command interface built specifically for EMS and medical fleets.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-4">
                <ProofMetric label="Operating picture" value="One screen" />
                <ProofMetric label="AI boundary" value="Human approval" />
                <ProofMetric label="Primary mission" value="Readiness" />
                <ProofMetric label="Status" value="Live" accent />
              </div>
              <Link href="/work" className="inline-flex mt-8 text-sm text-[color:var(--color-cyan)] hover:underline">
                See the full body of work →
              </Link>
            </div>
            <div className="relative aspect-[16/10] rounded-xl overflow-hidden border border-[color:var(--color-border)] shadow-[0_28px_70px_-40px_rgba(0,217,255,0.45)]">
              <Image
                src="/work/aegisfleet.png"
                alt="Aegis Fleet AI command center"
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
              Show us where the work is breaking.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-xl">
              We&apos;ll map the system that fixes it—and tell you honestly if
              the answer is smaller than a custom build.
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
