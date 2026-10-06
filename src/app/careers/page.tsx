import Link from "next/link";

export const metadata = {
  title: "Careers",
  description:
    "Join Tomorrow’s Tech AI. Explore openings in sales and customer service or full-stack development.",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers · Tomorrow’s Tech AI",
    description:
      "Help build and support the systems modern businesses run on. See current openings at Tomorrow’s Tech AI.",
    url: "https://tomorrowstechai.com/careers",
    type: "website",
  },
};

const roles = [
  {
    code: "01",
    group: "Customer growth",
    title: "Sales & Customer Service Representative",
    summary:
      "Be the clear, responsive connection between prospective customers, current customers, and the team building their systems.",
    responsibilities: [
      "Respond clearly and promptly to new inquiries and customer questions.",
      "Qualify opportunities, schedule next steps, and keep CRM notes accurate.",
      "Follow up consistently so conversations and handoffs do not stall.",
      "Learn our services and products well enough to guide people to the right next step.",
    ],
    fit: [
      "A confident, thoughtful communicator in writing and conversation.",
      "Organized enough to manage follow-up without losing the human side of service.",
      "Comfortable with both sales conversations and customer problem-solving.",
      "Ready to work closely with a small team as the role takes shape.",
    ],
    subject: "Application: Sales & Customer Service Representative",
  },
  {
    code: "02",
    group: "Product & engineering",
    title: "Full-Stack Developer",
    summary:
      "Build customer-facing products and the operational systems behind them—from the interface to the database and integrations.",
    responsibilities: [
      "Build and maintain web apps, admin systems, dashboards, and automations.",
      "Work across Next.js, React, TypeScript, APIs, Supabase, and Vercel.",
      "Translate real operating workflows into reliable interfaces and server logic.",
      "Test, document, review, and ship production work with care.",
    ],
    fit: [
      "Production experience building full-stack JavaScript or TypeScript applications.",
      "Sound judgment around data modeling, APIs, security, and maintainability.",
      "Able to own a feature from an operational problem through deployment.",
      "A portfolio, code samples, or shipped products that show how you think.",
    ],
    subject: "Application: Full-Stack Developer",
  },
];

export default function CareersPage() {
  return (
    <>
      <section className="careers-hero border-b border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
          <div className="eyebrow mb-6">● We&apos;re building the team</div>
          <h1 className="text-4xl md:text-6xl font-medium tracking-[-0.04em] leading-[1.04] max-w-4xl">
            Build the systems modern businesses run on.
          </h1>
          <p className="text-lg md:text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-7 max-w-3xl">
            Tomorrow’s Tech AI connects product thinking, customer experience,
            operations, and engineering. We&apos;re opening two early roles for
            people who want to help shape the work—not just inherit a job
            description.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <a href="#open-roles" className="btn-primary">
              See open roles →
            </a>
            <a
              href="mailto:john@tomorrowstechai.com?subject=Careers%20at%20Tomorrow%27s%20Tech%20AI"
              className="btn-secondary"
            >
              Introduce yourself
            </a>
          </div>

          <div className="careers-proof-strip">
            <CareerProof label="Open roles" value="02" />
            <CareerProof label="Company base" value="Belton, Texas" />
            <CareerProof label="The work" value="Product · Customers · Operations" />
          </div>
        </div>
      </section>

      <section id="open-roles" className="max-w-6xl mx-auto px-6 py-20 lg:py-24 scroll-mt-24">
        <div className="eyebrow-muted mb-3">Current openings</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl">
          Two starting roles. Real ownership from day one.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
          These positions are intentionally described around the work. Scope,
          working arrangement, and compensation will be discussed directly
          with qualified applicants before the interview process moves forward.
        </p>

        <div className="careers-role-list mt-12">
          {roles.map((role) => (
            <article className="careers-role" key={role.title}>
              <div className="careers-role-heading">
                <span>{role.code}</span>
                <div>
                  <div className="eyebrow-muted mb-3">{role.group}</div>
                  <h3 className="text-2xl md:text-3xl font-medium tracking-tight">
                    {role.title}
                  </h3>
                  <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
                    {role.summary}
                  </p>
                </div>
              </div>

              <div className="careers-role-details">
                <RoleList title="What you’ll do" items={role.responsibilities} />
                <RoleList title="What will help you succeed" items={role.fit} />
              </div>

              <div className="careers-role-action">
                <a
                  href={`mailto:john@tomorrowstechai.com?subject=${encodeURIComponent(role.subject)}`}
                  className="btn-primary"
                >
                  Apply for this role →
                </a>
                <span>Applications go directly to the founder.</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="careers-apply">
          <div>
            <div className="eyebrow mb-3">● How to apply</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-2xl">
              Show us the work behind the résumé.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
              Send a short introduction, the role you&apos;re interested in, and
              the experience most relevant to it. Include a résumé or LinkedIn
              profile; developer applicants should also include a portfolio,
              code samples, or links to products they helped ship.
            </p>
          </div>
          <a
            href="mailto:john@tomorrowstechai.com?subject=Careers%20at%20Tomorrow%27s%20Tech%20AI"
            className="btn-primary whitespace-nowrap"
          >
            Email your application →
          </a>
        </div>
        <p className="text-sm text-[color:var(--color-text-muted)] leading-relaxed mt-6 max-w-3xl">
          Don&apos;t match every line? Tell us what you&apos;ve built, supported, or
          learned that makes you a strong fit for the work.
        </p>
        <Link
          href="/about"
          className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
        >
          Learn more about Tomorrow’s Tech AI →
        </Link>
      </section>
    </>
  );
}

function CareerProof({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RoleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
