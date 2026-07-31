import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "Meet John Hockinson, founder of TomorrowsTech AI—an operations veteran with 18 years inside telecom, construction, and infrastructure programs, now building the systems he wished existed.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About · TomorrowsTech AI",
    description:
      "Meet John Hockinson—18 years inside operations, now building custom business platforms, command centers, dashboards, and AI systems.",
    url: "https://tomorrowstechai.com/about",
    type: "website",
  },
};

const journey = [
  {
    step: "01",
    title: "Inside the operation",
    body: "Telecom, construction, and infrastructure programs where crews, vendors, schedules, compliance, and customer commitments all had to move together.",
  },
  {
    step: "02",
    title: "The pattern",
    body: "Scattered documents, duplicate spreadsheets, tribal knowledge, and teams spending more time finding the truth than acting on it.",
  },
  {
    step: "03",
    title: "The shift",
    body: "Building command centers, workflows, dashboards, and private tools that give the operation one reliable place to work.",
  },
  {
    step: "04",
    title: "TomorrowsTech AI",
    body: "Custom business operating platforms shaped around the company—not generic software that forces the company to reshape itself.",
  },
];

const principles = [
  {
    number: "01",
    title: "Operations before AI",
    body: "AI cannot rescue a broken foundation. First clean up the data, ownership, handoffs, and source of truth. Then add intelligence.",
  },
  {
    number: "02",
    title: "Field reality over theory",
    body: "The system has to work for the person in the truck, on the job, in the office, and making the final decision—not just look good in a demo.",
  },
  {
    number: "03",
    title: "Propose, never act",
    body: "AI drafts, identifies, summarizes, and recommends. People approve the decisions that affect customers, crews, schedules, and money.",
  },
];

const platformModules = [
  ["Public", "Modern website and lead experience"],
  ["Private", "Admin system and role-based access"],
  ["CRM", "Customers, opportunities, and follow-up"],
  ["Control", "Command centers and dashboards"],
  ["Flow", "Apps, forms, approvals, and automation"],
  ["AI", "Human-approved intelligence"],
];

export default function AboutPage() {
  return (
    <>
      <section className="about-hero border-b border-[color:var(--color-border)]">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-12 lg:gap-16 items-center">
            <div>
              <div className="eyebrow mb-6">● Founder · Operator · Systems builder</div>
              <h1 className="text-4xl md:text-6xl font-medium tracking-[-0.04em] leading-[1.04] max-w-3xl">
                18 years inside operations. Now building the systems I wished
                existed.
              </h1>
              <p className="text-lg md:text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-7 max-w-2xl">
                I&apos;m John Hockinson, founder of TomorrowsTech AI. I spent
                nearly two decades inside telecom, construction, and
                infrastructure programs—where the work is complicated, the
                deadlines are real, and disconnected systems cost more than
                time.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/work" className="btn-primary">
                  See what we build →
                </Link>
                <Link href="/contact" className="btn-secondary">
                  Compare notes
                </Link>
              </div>
            </div>

            <figure className="about-portrait">
              <div className="about-portrait-frame">
                <Image
                  src="/about/john-hockinson-portrait.png"
                  alt="John Hockinson, founder of TomorrowsTech AI"
                  fill
                  priority
                  sizes="(max-width: 1024px) 90vw, 440px"
                  className="object-cover"
                />
                <div className="about-portrait-scan" aria-hidden="true" />
              </div>
              <figcaption className="about-portrait-caption">
                <div>
                  <span>John Hockinson</span>
                  <strong>Founder · TomorrowsTech AI</strong>
                </div>
                <div className="about-portrait-location">
                  Belton, Texas
                </div>
              </figcaption>
            </figure>
          </div>

          <div className="about-proof-strip">
            <AboutProof label="Operating experience" value="18 years" />
            <AboutProof label="Background" value="Telecom & infrastructure" />
            <AboutProof label="Build focus" value="Business operating systems" />
            <AboutProof label="AI boundary" value="Human approval" />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 lg:py-24">
        <div className="grid lg:grid-cols-[0.72fr_1.28fr] gap-12 lg:gap-20 items-start">
          <div className="lg:sticky lg:top-28">
            <div className="eyebrow-muted mb-4">From operator to builder</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
              The work came first. The technology followed.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5">
              TomorrowsTech AI exists because I kept seeing the same operational
              problems repeat at every level—and because most software was built
              around features instead of the people doing the work.
            </p>
          </div>

          <div className="about-journey">
            {journey.map((item) => (
              <article className="about-journey-step" key={item.step}>
                <span>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/35">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="eyebrow-muted mb-3">How we think</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl">
            Three principles behind every system.
          </h2>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {principles.map((principle) => (
              <article className="about-principle" key={principle.number}>
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 lg:py-24">
        <div className="about-build">
          <div className="about-build-copy">
            <div className="eyebrow mb-4">● Our flagship build</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight">
              One platform around the way the business actually runs.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5">
              Customers see a polished modern website. The team signs into a
              private operating environment behind it. CRM, dashboards, apps,
              forms, approvals, reporting, social workflows, and AI stay
              connected instead of becoming another pile of tools.
            </p>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
              We also build focused command centers, Smartsheet workflows,
              financial dashboards, crew and fleet systems, and private AI
              tools for operations-heavy companies.
            </p>
            <Link
              href="/services#business-platforms"
              className="inline-block mt-7 text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
            >
              Explore the flagship service →
            </Link>
          </div>
          <div className="about-module-grid" aria-label="Business operating platform modules">
            {platformModules.map(([label, description]) => (
              <div className="about-module" key={label}>
                <span>{label}</span>
                <strong>{description}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Products & brands</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl">
          We prove the principle in our own work.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-2xl">
          Alongside client systems, we build and operate our own focused
          products. That keeps the work grounded in real customers, real
          workflows, and real consequences.
        </p>
        <div className="grid md:grid-cols-3 gap-5 mt-10">
          <ProductCard
            tag="Contractor service"
            title="Job Catcher"
            body="A managed missed-call response service that connects a contractor’s business line, sends custom responses, and keeps opportunities alive until the contractor can take over."
            href="/job-catcher"
            linkLabel="See Job Catcher"
          />
          <ProductCard
            tag="Product studio"
            title="Held"
            body="An AI-assisted coordination product for busy households, built around shared calendars, tasks, protected time, and deliberate human approval."
            href="https://myheldapp.com"
            linkLabel="Visit Held"
          />
          <ProductCard
            tag="Technical media"
            title="TomorrowsTek"
            body="A private Porsche technical garage offering support, DIY repair guidance, advanced diagnostics, and practical content for owners."
            href="https://tomorrowstek.com"
            linkLabel="Visit TomorrowsTek"
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="about-final-cta">
          <div>
            <div className="eyebrow mb-3">● Operator to operator</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-2xl">
              If the operation is held together by memory, spreadsheets, and
              workarounds, let&apos;s compare notes.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] mt-4 max-w-xl">
              Thirty minutes. No canned pitch. We&apos;ll map what is slowing the
              business down and whether a custom system is the right answer.
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

function AboutProof({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProductCard({
  tag,
  title,
  body,
  href,
  linkLabel,
}: {
  tag: string;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}) {
  const content = (
    <>
      <div className="eyebrow-muted mb-4">{tag}</div>
      <h3 className="text-xl font-medium">{title}</h3>
      <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mt-3">
        {body}
      </p>
      <span className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)]">
        {linkLabel} →
      </span>
    </>
  );

  if (href.startsWith("/")) {
    return (
      <Link href={href} className="about-product-card">
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="about-product-card"
    >
      {content}
    </a>
  );
}
