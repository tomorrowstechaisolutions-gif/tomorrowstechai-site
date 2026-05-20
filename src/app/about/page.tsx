import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "Founded by John Hockinson with Dr. Marlow Griggs, MD and Abbas Koteish, PMP. Operations veterans building AI systems for the operations teams they came from.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About · TomorrowsTech AI",
    description:
      "Founded by John Hockinson with Dr. Marlow Griggs and Abbas Koteish — 18 years inside operations, now building the systems we wished existed.",
    url: "https://tomorrowstechai.com/about",
    type: "website",
  },
};

const team = [
  {
    name: "John C. Hockinson",
    role: "Founder & Chief AI Officer",
    body: "Systems architect and technology strategist. 18 years inside telecom and infrastructure programs informs every system we ship. Drives the technology vision and the build itself.",
    initials: "JH",
  },
  {
    name: "Dr. Marlow Griggs, MD",
    role: "Chief Strategy & Innovation Officer",
    body: "Strategic leader who keeps the technology grounded in practical business reality. Brings the outside-the-tech-bubble perspective that ensures every system we ship actually fits how businesses run.",
    initials: "MG",
  },
  {
    name: "Abbas Koteish, PMP",
    role: "Director of Program Delivery",
    body: "Delivery leader focused on turning strategy into organized execution. Abbas ensures every system we build is practical, scalable, and aligned with real business goals — not just a great idea on a whiteboard.",
    initials: "AK",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● About TomorrowsTech AI</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          18 years inside operations. Now building the systems we wished
          existed.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          TomorrowsTech AI was founded by John Hockinson — a program manager
          who spent two decades running telecom and infrastructure programs —
          alongside Dr. Marlow Griggs and Abbas Koteish. Three operators who
          watched the same operational chaos repeat at every level, and
          decided to build the systems that could fix it.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>The problem we saw</h2>
          <p>
            Scattered documents. Tribal knowledge. Duplicate spreadsheets.
            Outdated processes. No clean source of truth.
          </p>
          <p>
            Companies bolting AI agents on top of that chaos and wondering why
            it failed.
          </p>
          <p>
            Most companies don&apos;t have an AI problem. They have a foundation
            problem. The companies that will win with AI aren&apos;t the ones
            that rush to build the flashiest chatbot — they&apos;re the ones
            that get their operational foundation right first.
          </p>

          <h2>What we build</h2>
          <p>
            We build AI command centers, Smartsheet workflows, fleet and crew
            management systems, financial dashboards, custom AI platforms, and
            modern websites — the kind of systems that pull every layer of an
            operation onto one source of truth.
          </p>
          <p>
            For construction, contractors, field operations, telecom, real
            estate investment, and service businesses still running critical
            operations on spreadsheets and email chains — that&apos;s exactly
            where we work.
          </p>

          <h2>Our philosophy: propose, never act</h2>
          <p>
            Most AI integrations are built to <em>automate</em>, not to{" "}
            <em>assist</em>. They send the email. They commit the change. And
            when they&apos;re wrong, it&apos;s loud, public, and expensive.
          </p>
          <p>
            That&apos;s not how we build. Every Claude-powered workflow we set
            up follows one rule: <strong>AI proposes, you decide.</strong>{" "}
            Claude can draft the schedule change — you approve before it
            commits. Claude can suggest the right crew — you confirm before
            dispatch. Claude can compile the executive summary — you read it
            before it ships.
          </p>
          <p>
            AI is leverage. Never autopilot.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="eyebrow-muted mb-3">Who&apos;s behind TomorrowsTech AI</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3 max-w-2xl">
          The team building the systems.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-12 max-w-2xl">
          Three founders. One philosophy: build the operational foundation
          right before bolting on AI.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {team.map((member) => (
            <div key={member.name} className="card">
              <div className="w-14 h-14 rounded-full bg-[color:var(--color-cyan-deep)]/30 border border-[color:var(--color-cyan)]/40 flex items-center justify-center mb-4">
                <span className="font-mono text-[color:var(--color-cyan)] text-base tracking-widest">{member.initials}</span>
              </div>
              <h3 className="text-lg font-medium mb-1">{member.name}</h3>
              <div className="eyebrow-muted mb-4">{member.role}</div>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{member.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>Our products</h2>
          <p>
            Alongside our consulting work, we&apos;ve built our own products
            and brands to prove the principle in our own operations:
          </p>
          <ul>
            <li>
              <strong>Held</strong> — AI-powered coordination app for busy
              households, now on iOS. Same proposal-only architecture, applied
              to family logistics.
            </li>
            <li>
              <strong>NexaFlow AI</strong> — local AI operating system that
              runs on your machine. Online or offline, your data stays private.
            </li>
            <li>
              <strong>REI Ops Local</strong> — operational platform purpose-built
              for real estate investment operations.
            </li>
            <li>
              <strong>TomorrowsTek</strong> — our content and media business
              for how-to videos, drone services, and reviews.
            </li>
          </ul>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card card-accent p-10">
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            Want to compare notes?
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl">
            If your team is running operations through Smartsheet, dealing with
            field crews, contractors, fleet, and compliance — we&apos;d be glad
            to compare notes.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
