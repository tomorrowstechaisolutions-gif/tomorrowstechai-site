import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "Founded by John Hockinson, an operations veteran with 18 years building telecom and infrastructure programs. Now building AI systems for the operations teams he came from.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About · TomorrowsTech AI",
    description:
      "Founded by John Hockinson — 18 years inside operations, now building the systems we wished existed.",
    url: "https://tomorrowstechai.com/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● About TomorrowsTech AI</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          18 years inside operations. Now building the systems I wished
          existed.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          TomorrowsTech AI was founded by John Hockinson — a program manager
          who spent two decades running telecom and infrastructure programs,
          and watched the same operational chaos repeat at every level.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>The problem I saw</h2>
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
            Our flagship build is a custom business operating platform: a
            modern public website for customers and a private operating system
            behind it for the team. CRM, dashboards, apps, forms, approvals,
            reporting, social-content workflows, and AI all live in one system
            shaped around the company.
          </p>
          <p>
            We also build focused command centers, Smartsheet workflows, fleet
            and crew management systems, financial dashboards, and private AI
            tools—the pieces that give leadership one trustworthy operating
            picture.
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

          <h2>Our products</h2>
          <p>
            Alongside our consulting work, we&apos;ve built our own products
            and brands to prove the principle in our own operations:
          </p>
          <ul>
            <li>
              <strong><Link href="/job-catcher">Job Catcher</Link></strong> —
              missed-call text-back, review automation, and lead follow-up for
              contractors. A focused product built to keep real opportunities
              from dying in voicemail.
            </li>
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
