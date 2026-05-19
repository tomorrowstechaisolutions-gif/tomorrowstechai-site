import Link from "next/link";

export const metadata = {
  title: "Services",
  description:
    "AI Command Centers, Smartsheet consulting, custom AI app development, local AI deployment, and program management consulting for operations-heavy businesses.",
};

const services = [
  {
    tag: "01",
    title: "AI Command Centers",
    body: "Smartsheet workflows, crew/fleet/compliance dashboards, real-time visibility across departments. One source of truth your executives can actually trust. Built field-up, not boardroom-down.",
  },
  {
    tag: "02",
    title: "Smartsheet Consulting & Build-out",
    body: "From contractor master sheets with scheduling violation detection to PMO governance templates that scale across projects. P6-style scheduling rigor translated into Smartsheet-native systems.",
  },
  {
    tag: "03",
    title: "Custom AI Workflow Design",
    body: "AI workflows built around how your business actually works, not how generic tools think it should. Smartsheet-first, Claude-enabled, field-tested. Operations first, AI second.",
  },
  {
    tag: "04",
    title: "Custom AI App Development",
    body: "TypeScript + Next.js + Vercel + Neon. The same stack we use to build Held. Production-ready apps for internal operations, customer portals, or net-new products.",
  },
  {
    tag: "05",
    title: "Local AI Deployment",
    body: "NexaFlow AI-style: local LLM platforms that run on your machine. Online or offline, your data stays private. No training someone else's models on your operational secrets.",
  },
  {
    tag: "06",
    title: "Operations Automation",
    body: "Field-to-office workflows that start with crews capturing information on their phone and flow through operations, reporting, approvals, billing, and customer invoicing.",
  },
  {
    tag: "07",
    title: "Program Management Consulting",
    body: "Drawing on 18 years running real telecom and infrastructure programs. We help leadership teams design PMO structures, scheduling discipline, and operational governance.",
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● Services</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] max-w-4xl">
          AI for the operations teams that actually run the work.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6 max-w-3xl">
          Seven service lines. One philosophy: operational clarity, not AI for
          AI&apos;s sake. Built by an operator who lived inside the chaos for
          two decades.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-2 gap-5">
          {services.map((s) => (
            <div key={s.tag} className="card">
              <div className="flex items-baseline gap-4 mb-3">
                <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">
                  {s.tag}
                </span>
                <h2 className="text-xl font-medium">{s.title}</h2>
              </div>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">How we work</div>
          <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            Five phases. Predictable. No mystery.
          </h2>
          <div className="grid md:grid-cols-5 gap-5">
            <Phase n="01" title="Discovery" body="We listen first. Map the operational chaos. Identify the highest-leverage starting point." />
            <Phase n="02" title="Foundation" body="Clean the data architecture. AI on top of disorganized sheets gives disorganized answers." />
            <Phase n="03" title="Build" body="Read-only queries first. Trust through accuracy before write access." />
            <Phase n="04" title="Boundary" body="Define propose-vs-act explicitly. Where AI suggests. Where humans decide. Hardest part — most important." />
            <Phase n="05" title="Scale" body="One workflow at a time. Low-stakes writes first. Trust pattern, then expand." />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
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

function Phase({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="font-mono text-sm text-[color:var(--color-cyan)] tracking-widest mb-2">
        {n}
      </div>
      <h3 className="text-base font-medium mb-2">{title}</h3>
      <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}
