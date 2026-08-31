import Link from "next/link";

export const metadata = {
  title: "FAQ",
  description:
    "Common questions about Tomorrow’s Tech AI services, pricing, timelines, and how we work. Operations-first AI consulting answered in plain language.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ · Tomorrow’s Tech AI",
    description:
      "Common questions about Tomorrow’s Tech AI — services, timelines, pricing, and how we work.",
    url: "https://tomorrowstechai.com/faq",
    type: "website",
  },
};

const faqs = [
  {
    q: "What is a custom business operating platform?",
    a: "It is a modern public website and a private business operating system built as one connected platform. Customers see the website, booking, services, and lead experience. Your team signs into the private side for CRM, customer records, dashboards, apps, forms, approvals, reporting, social-content workflows, and AI-assisted operations. Every module is built around the way your company actually runs.",
  },
  {
    q: "What is Job Catcher, and what does the $350/month include?",
    a: "Job Catcher is a managed missed-call response service for contractors. We connect an eligible business line or configure forwarding, write custom responses around the contractor's trade, services, hours, area, tone, and callback process, test the workflow, and tune it over time. A missed caller gets an immediate text and the contractor gets an alert so a human can take over. The managed service is $350/month, with a free two-week pilot after number and carrier approval.",
  },
  {
    q: "How long does an engagement take?",
    a: "It depends on scope. A standalone marketing website typically ships in 2–4 weeks. A Smartsheet command center build is 4–8 weeks. A full business operating platform, AI workflow, or custom application is usually 8–16 weeks. We tell you the realistic timeline during the discovery call — no rosy estimates that slip later.",
  },
  {
    q: "Do you offer ongoing maintenance and support?",
    a: "Yes. Every site or system we build comes with the option of an ongoing partnership for maintenance, security updates, content changes, and small enhancements. We don't ship-and-disappear. Pricing for ongoing support depends on the system, but most clients land in the $200–$500/month range.",
  },
  {
    q: "What's the difference between an AI Command Center and a regular dashboard?",
    a: "A dashboard shows you what happened. A command center shows you what's happening right now, what's about to break, and what action to take. Our command centers combine Smartsheet (or your existing systems) with AI that reads, summarizes, and proposes — so leadership stops digging through spreadsheets to find answers.",
  },
  {
    q: "Do I have to use Smartsheet?",
    a: "No. We're Smartsheet-first because it's where most of our clients already live, but we work with whatever system you're on — Airtable, Monday, Asana, custom databases, or net-new builds. The principle is the same: pull every layer of an operation onto one source of truth.",
  },
  {
    q: "What if I already have systems in place?",
    a: "Even better. We usually start by understanding what's working and what isn't, then build around your existing tools rather than asking you to rip-and-replace. The goal is operational clarity, not platform lock-in.",
  },
  {
    q: "Do you work with businesses outside construction and field operations?",
    a: "Yes. Our background is in construction, telecom, and infrastructure, but the operational problems we solve — scattered data, manual handoffs, broken approval chains — exist in every operations-heavy business. We've worked with real estate investment, wellness practices, and contractor management. If your team runs on spreadsheets and email chains, we can probably help.",
  },
  {
    q: "How does \"AI proposes, you decide\" actually work?",
    a: "Every Claude-powered workflow we build follows one rule: AI drafts, humans approve. Claude can suggest the right crew, draft the schedule update, or compile the executive summary — but nothing commits without your team reviewing and approving. AI is leverage, not autopilot. The boundary between propose and act is defined explicitly during the build.",
  },
  {
    q: "What does an engagement typically cost?",
    a: "Website packages are fixed price: $149 Starter, $399 Classic, $699 Professional and $999 E-Commerce, each with hosting and management at $29/month after a free first 30 days. A custom marketing website, where the design and the words are original rather than proven, is $1,500–$3,000. Smartsheet command centers and custom AI workflows generally range from $5,000–$15,000. Full custom business operating platforms are scoped around the modules, users, integrations, and operating requirements involved. Ongoing partnership pricing starts at $200/month. We give you a clear, all-in number before work begins.",
  },
];

export default function FAQPage() {
  // JSON-LD FAQPage schema for rich snippets in Google search results
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● Frequently asked questions</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          Questions, answered.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          What we get asked most often. Anything not covered here, just{" "}
          <Link href="/contact" className="text-[color:var(--color-cyan)] hover:underline">
            ask
          </Link>
          .
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="space-y-4">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="card group [&[open]_.faq-icon]:rotate-45 transition-all"
            >
              <summary className="flex items-start justify-between gap-4 cursor-pointer list-none">
                <h3 className="text-lg font-medium pr-4">{f.q}</h3>
                <span className="faq-icon font-mono text-[color:var(--color-cyan)] text-xl leading-none mt-0.5 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-4 text-[color:var(--color-text-secondary)] leading-relaxed">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card card-accent p-10">
          <div className="eyebrow mb-3">● Still have questions?</div>
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            Get them answered on a discovery call.
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl">
            30 minutes. No pitch, just notes. We&apos;ll walk through your
            operations and tell you whether what we do is a fit.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
