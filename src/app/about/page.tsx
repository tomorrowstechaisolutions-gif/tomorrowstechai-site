import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "TomorrowsTech AI helps businesses bring operations, automation, and data into one clear command environment. Founded by John Hockinson, Dr. Marlow Griggs, and Abbas Koteish — building intelligent systems for the next generation of business.",
};

const team = [
  {
    name: "John C. Hockinson",
    role: "Founder & Chief AI Officer",
    body: "Systems architect and technology strategist focused on building intelligent operational platforms that combine AI, automation, and real-time command dashboards. 18 years inside telecom and infrastructure programs informs every system we ship.",
    initials: "JH",
  },
  {
    name: "Dr. Marlow Griggs, MD",
    role: "Chief Strategy & Innovation Officer",
    body: "Strategic leader helping guide Tomorrowstech AI's direction, ensuring our technology solutions remain practical, scalable, and aligned with real business challenges. Brings the outside-the-tech-bubble perspective that keeps the work grounded.",
    initials: "MG",
  },
  {
    name: "Abbas Koteish, PMP",
    role: "Director of Program Delivery",
    body: "Experienced delivery leader focused on turning strategy into organized execution. Abbas ensures every system we build is practical, scalable, and aligned with real business goals — not just a great idea on a whiteboard.",
    initials: "AK",
  },
];

const differentiators = [
  {
    title: "Intelligent Systems",
    body: "We design custom AI-powered platforms that bring data, automation, and operations into a single command environment — giving organizations clear visibility and control.",
  },
  {
    title: "Operational Clarity",
    body: "Our dashboards and automation systems turn complex data into simple, actionable insights so leadership teams can make faster, smarter decisions.",
  },
  {
    title: "Scalable Technology",
    body: "We build solutions that grow with your organization — secure, scalable systems designed for real-world business operations, not just demos.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● About TomorrowsTech AI</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          Built for real business operations.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          TomorrowsTech AI helps businesses simplify operations through AI, automation, dashboards, and better system design. We build practical systems that reduce manual work, improve visibility, and help companies scale with clarity.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>We build intelligent systems for modern business.</h2>
          <p>
            We help businesses bring operations, automation, and data into one clear command environment. We design custom AI systems, dashboards, and workflow solutions that give leaders better visibility, faster decisions, and scalable control.
          </p>

          <h2>The problem we saw</h2>
          <p>
            Scattered documents. Tribal knowledge. Duplicate spreadsheets. Outdated processes. No clean source of truth.
          </p>
          <p>
            Companies bolting AI agents on top of that chaos and wondering why it failed.
          </p>
          <p>
            Most companies don&apos;t have an AI problem. They have a foundation problem. The companies that will win with AI aren&apos;t the ones that rush to build the flashiest chatbot — they&apos;re the ones that get their operational foundation right first.
          </p>

          <h2>Our philosophy: propose, never act</h2>
          <p>
            Most AI integrations are built to <em>automate</em>, not to <em>assist</em>. They send the email. They commit the change. And when they&apos;re wrong, it&apos;s loud, public, and expensive.
          </p>
          <p>
            That&apos;s not how we build. Every Claude-powered workflow we set up follows one rule: <strong>AI proposes, you decide.</strong> Claude can draft the schedule change — you approve before it commits. Claude can suggest the right crew — you confirm before dispatch. Claude can compile the executive summary — you read it before it ships.
          </p>
          <p>
            AI is leverage. Never autopilot.
          </p>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">Why businesses choose us</div>
          <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            We build intelligent systems that bring clarity, automation, and real-time insight to complex operations.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {differentiators.map((d) => (
              <div key={d.title} className="card">
                <h3 className="text-lg font-medium mb-3 text-[color:var(--color-cyan)]">{d.title}</h3>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="eyebrow-muted mb-3">Our team</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3 max-w-2xl">
          The minds behind Tomorrowstech AI.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-12 max-w-2xl">
          Building intelligent systems for the next generation of business.
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
            Alongside our consulting work, we&apos;ve built our own products to prove the principle in our own operations:
          </p>
          <ul>
            <li>
              <strong>Held</strong> — AI-powered coordination app for busy households, now on iOS. Same proposal-only architecture, applied to family logistics.
            </li>
            <li>
              <strong>NexaFlow AI</strong> — local AI operating system that runs on your machine. Online or offline, your data stays private.
            </li>
            <li>
              <strong>REI Ops Local</strong> — operational platform purpose-built for real estate investment operations.
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
            If your team is running operations through Smartsheet, dealing with field crews, contractors, fleet, and compliance — we&apos;d be glad to compare notes.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
