import Link from "next/link";

export const metadata = {
  title: "Services",
  description:
    "Command Centers, Workflow Packages, AI Business Units, and Private On-Site AI Infrastructure for operations-heavy businesses. We design custom AI systems that bring operations, automation, and data into one clear command environment.",
};

const signatureSystems = [
  {
    n: "01",
    title: "Command Centers",
    tag: "Signature System",
    body: "Custom business visibility hubs built to unify reporting, metrics, accountability, and leadership oversight. One place to see what's moving, what's stuck, and what needs attention — without digging through disconnected systems.",
    bullets: [
      "Crew, fleet, and compliance dashboards",
      "Real-time visibility across departments",
      "One source of truth your executives can actually trust",
      "Smartsheet-first, AI-enabled",
    ],
  },
  {
    n: "02",
    title: "Workflow Packages",
    tag: "Signature System",
    body: "Forms, approvals, reporting flows, and automation systems designed around how your business actually operates. Move information cleanly from one stage to the next. Reduce manual handoffs. Catch mistakes early.",
    bullets: [
      "Field-to-office workflow design",
      "Approvals + reporting + billing automation",
      "Process automation built around real operations",
      "Drag-eliminating handoffs and follow-up",
    ],
  },
  {
    n: "03",
    title: "AI Business Units · Nexus One",
    tag: "Signature System",
    body: "Private AI-ready business systems built to support smarter decisions, better internal tools, and faster execution. A dedicated AI environment for the way your business actually runs — not just public chatbot tooling.",
    bullets: [
      "Custom agents and internal automation",
      "Reporting support and process assistance",
      "Designed for business use, not just public use",
      "Maintained and expanded over time",
    ],
  },
];

const onSiteAI = {
  n: "04",
  title: "Private On-Site AI Infrastructure",
  tag: "Hardware Offering",
  body: "When privacy and control matter, we build and deliver dedicated AI hardware for your business. On-premises infrastructure with the performance to actually run modern models — your data never trains someone else's models.",
  specs: [
    { label: "CPU", value: "AMD Ryzen 9 7950X · 16 cores" },
    { label: "GPU", value: "NVIDIA RTX 4090 · 24GB VRAM" },
    { label: "Memory", value: "64GB DDR5 RAM" },
    { label: "Deployment", value: "On-premises, your control" },
  ],
};

const process = [
  {
    n: "01",
    title: "Business Discovery",
    tags: ["Workflow Review", "Business Goals"],
    body: "We listen first. Walk your operations end-to-end. Identify the friction, the bottlenecks, the silent profit leaks. Where the work actually breaks down.",
  },
  {
    n: "02",
    title: "System Design",
    tags: ["System Planning", "Solution Mapping"],
    body: "We map the right mix of command centers, workflows, management systems, and AI tools to support how your business actually runs. Design before code.",
  },
  {
    n: "03",
    title: "Build & Deployment",
    tags: ["System Build", "Deployment Setup", "Process Automation"],
    body: "We build your forms, approvals, automations, dashboards, and connected systems, then deploy everything into a clean operating environment your team can actually use.",
  },
  {
    n: "04",
    title: "Ongoing Support",
    tags: ["System Support", "Continuous Improvement"],
    body: "We stay involved to maintain, improve, and expand your systems over time so they keep performing as your business grows. Not handed off and forgotten.",
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● Services</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] max-w-4xl">
          We build intelligent systems for modern business.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6 max-w-3xl">
          Three signature systems plus on-premises AI infrastructure. Built around how your business actually runs — not how generic tools think it should.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="eyebrow-muted mb-3">Signature Systems</div>
        <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
          The core of the Tomorrowstek ecosystem.
        </h2>
        <div className="grid gap-5">
          {signatureSystems.map((s) => (
            <div key={s.n} className="card p-8">
              <div className="md:flex md:items-start md:gap-10">
                <div className="md:w-1/3 mb-4 md:mb-0">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">{s.n}</span>
                    <span className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">{s.tag}</span>
                  </div>
                  <h3 className="text-2xl font-medium">{s.title}</h3>
                </div>
                <div className="md:w-2/3">
                  <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-4">
                    {s.body}
                  </p>
                  <ul className="space-y-1.5">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm">
                        <span className="text-[color:var(--color-cyan)] mt-0.5">→</span>
                        <span className="text-[color:var(--color-text)]">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="card card-accent p-8">
          <div className="md:flex md:items-start md:gap-10">
            <div className="md:w-1/3 mb-4 md:mb-0">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">{onSiteAI.n}</span>
                <span className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-amber)]">{onSiteAI.tag}</span>
              </div>
              <h3 className="text-2xl font-medium">{onSiteAI.title}</h3>
            </div>
            <div className="md:w-2/3">
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
                {onSiteAI.body}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {onSiteAI.specs.map((s) => (
                  <div key={s.label} className="border border-[color:var(--color-border)] rounded px-3 py-2">
                    <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">{s.label}</div>
                    <div className="text-sm text-[color:var(--color-text)] mt-1 font-mono">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">How it works</div>
          <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            How Tomorrowstek builds your business system.
          </h2>
          <p className="text-[color:var(--color-text-secondary)] leading-relaxed max-w-3xl mb-12">
            We start by understanding how your business actually runs. Then we build the right mix of command centers, workflows, management systems, and AI tools to support it. Four phases. Predictable. No mystery.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {process.map((p) => (
              <div key={p.n} className="card">
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">{p.n}</span>
                  <h3 className="text-lg font-medium">{p.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {p.tags.map((t) => (
                    <span key={t} className="text-xs font-mono tracking-wider text-[color:var(--color-text-muted)] border border-[color:var(--color-border)] px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="card card-accent text-center md:text-left md:flex md:items-center md:justify-between gap-10 p-10">
          <div>
            <div className="eyebrow mb-3">● Open for new engagements</div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight max-w-xl">
              Wondering what this could look like for your business?
            </h3>
            <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-lg">
              Book a discovery call. 30 minutes, no pitch, just notes.
            </p>
          </div>
          <Link href="/contact" className="btn-primary mt-6 md:mt-0 whitespace-nowrap">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
