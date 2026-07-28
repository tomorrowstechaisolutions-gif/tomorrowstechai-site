import Link from "next/link";

export const metadata = {
  title:
    "Job Catcher — Missed Call Text Back for Contractors | Temple, Belton & Killeen TX",
  description:
    "Every missed call is a job your competitor caught. Job Catcher texts your missed calls back in seconds, wins you Google reviews, and follows up on every lead — built for roofers, HVAC, plumbers, fence and concrete crews in Temple, Belton, Killeen and Central Texas. $350/month flat. Free 2-week pilot.",
  keywords: [
    "missed call text back",
    "contractor answering service Temple TX",
    "missed call text back service Belton",
    "HVAC missed calls Killeen",
    "roofing leads Temple TX",
    "contractor automation Central Texas",
    "Google review automation contractors",
  ],
  alternates: { canonical: "/job-catcher" },
  openGraph: {
    title: "Job Catcher — Never Lose Another Job to a Missed Call",
    description:
      "Missed-call text-back + review automation + lead follow-up for Central Texas contractors. $350/month flat. Free 2-week pilot — if it doesn't catch you a job, rip it out.",
    url: "https://tomorrowstechai.com/job-catcher",
    type: "website",
  },
};

const steps = [
  {
    tag: "01",
    title: "A customer calls. You're on a roof.",
    body: "Service businesses miss 25–40% of their inbound calls — you're up a ladder, in an attic, running a crew. The customer doesn't leave a voicemail. They call the next name on Google.",
  },
  {
    tag: "02",
    title: "Seconds later, they get your text.",
    body: "“This is Mike's Roofing — on a job right now. What do you need? I'll call you right back.” Automatic, instant, from your business number. The customer stops dialing your competitors, because you already answered.",
  },
  {
    tag: "03",
    title: "You call back and win the job.",
    body: "You get an instant alert with their number. Call back on your schedule — the job's still yours. After the work's done, Job Catcher automatically asks the happy customer for a Google review, so the next customer finds you first.",
  },
];

const included = [
  {
    title: "24/7 missed-call text-back",
    body: "Every unanswered call gets an instant, personal-sounding text from your business line. Works while you're on a roof, in a crawlspace, or asleep.",
  },
  {
    title: "Google review engine",
    body: "Job done → customer automatically gets a review request text. Five-star work deserves five-star proof. Reviews are how contractors win local search — most great crews around here have fewer than 20.",
  },
  {
    title: "Lead follow-up that never forgets",
    body: "New inquiries get a polite automatic follow-up sequence, so no lead goes cold in your pocket. Any reply comes straight to you — a human closes, the machine just never drops the ball.",
  },
];

const faqs = [
  {
    q: "How fast can this be running on my line?",
    a: "About an hour of setup, and nothing about your phone or number changes — you keep your number, calls ring exactly like they do today. The automation only wakes up when you can't answer.",
  },
  {
    q: "What does it cost?",
    a: "$350/month flat. No contract, no setup fee, no per-text nickel-and-diming. One recovered service call typically pays for the month; one recovered roof pays for the year.",
  },
  {
    q: "What's the free pilot?",
    a: "We install Job Catcher on your line free for two weeks. If it catches you a job, we start at $350/month. If it doesn't, we rip it out and shake hands. All the risk is ours.",
  },
  {
    q: "Who's behind it?",
    a: "TomorrowsTech AI is a Belton, TX company run by John Hockinson — 18 years in telecom and construction operations before building automation systems. We work in the trades' world, not the other way around.",
  },
];

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Job Catcher — Missed Call Text-Back for Contractors",
  serviceType: "Missed call text-back, review automation, and lead follow-up",
  provider: {
    "@type": "ProfessionalService",
    name: "TomorrowsTech AI",
    legalName: "Tomorrows Tech AI LLC",
    telephone: "+1-254-272-3313",
    email: "john@tomorrowstechai.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "452 Eagle Landing Dr",
      addressLocality: "Belton",
      addressRegion: "TX",
      postalCode: "76513",
      addressCountry: "US",
    },
  },
  areaServed: ["Temple TX", "Belton TX", "Killeen TX", "Harker Heights TX", "Copperas Cove TX", "Salado TX", "Central Texas"],
  audience: {
    "@type": "Audience",
    audienceType:
      "Roofing, HVAC, plumbing, electrical, fence, concrete, and landscaping contractors",
  },
  offers: {
    "@type": "Offer",
    price: "350",
    priceCurrency: "USD",
    description: "$350/month flat — free 2-week pilot, no contract, no setup fee",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function JobCatcherPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">⚡ Job Catcher · For Contractors · Temple – Belton – Killeen</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] max-w-4xl">
          Every missed call is a job your{" "}
          <span className="text-[color:var(--color-cyan)]">competitor caught.</span>
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6 max-w-3xl">
          You can&apos;t answer the phone from a roof. Job Catcher texts your missed
          calls back in seconds, wins you Google reviews after every job, and
          follows up on every lead — automatically, from your own number.
        </p>
        <div className="flex flex-wrap gap-4 mt-8">
          <a
            href="tel:+12542723313"
            className="inline-block rounded-lg bg-[color:var(--color-cyan)] px-6 py-3 font-medium text-black transition-opacity hover:opacity-90"
          >
            Call (254) 272-3313 →
          </a>
          <Link
            href="/contact"
            className="inline-block rounded-lg border border-[color:var(--color-border)] px-6 py-3 font-medium transition-colors hover:border-[color:var(--color-cyan)]"
          >
            Get the free 2-week pilot
          </Link>
        </div>
        <p className="mt-4 text-sm text-[color:var(--color-text-secondary)]">
          Go ahead — call that number after hours. Watch what happens when we
          &quot;miss&quot; your call. That&apos;s the product.
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-5">
          {steps.map((s) => (
            <div key={s.tag} className="card">
              <div className="flex items-baseline gap-4 mb-3">
                <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">
                  {s.tag}
                </span>
                <h2 className="text-lg font-medium">{s.title}</h2>
              </div>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The math */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card card-accent p-8">
          <div className="md:flex md:items-start md:gap-10">
            <div className="md:w-1/3 mb-4 md:mb-0">
              <div className="eyebrow-muted mb-2">The math</div>
              <h3 className="text-xl font-medium">
                One caught job pays for months.
              </h3>
            </div>
            <div className="md:w-2/3 text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] space-y-3">
              <p>
                Service businesses miss{" "}
                <strong className="text-[color:var(--color-text)]">25–40% of inbound calls</strong>,
                and instant text-back recovers{" "}
                <strong className="text-[color:var(--color-text)]">30–60% of those callers</strong>{" "}
                into booked work.
              </p>
              <p>
                For a Central Texas roofer in hail season, one recovered call can be a{" "}
                <strong className="text-[color:var(--color-cyan)]">$12,000+ insurance job</strong>.
                For HVAC in a Texas July, it&apos;s the service call that didn&apos;t go to
                the other guy. Job Catcher costs $350/month — the arithmetic isn&apos;t
                subtle.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="eyebrow mb-6">● What&apos;s included</div>
        <div className="grid md:grid-cols-3 gap-5">
          {included.map((s) => (
            <div key={s.title} className="card">
              <h3 className="text-lg font-medium mb-2">{s.title}</h3>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing + pilot */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card card-accent p-8">
          <div className="md:flex md:items-start md:gap-10">
            <div className="md:w-1/3 mb-4 md:mb-0">
              <div className="eyebrow-muted mb-2">Pricing</div>
              <h3 className="text-xl font-medium">$350/month. Flat. That&apos;s it.</h3>
            </div>
            <div className="md:w-2/3 text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] space-y-3">
              <p>
                No contract. No setup fee. No per-text charges. Cancel any month —
                though nobody cancels the thing that answers their phone.
              </p>
              <p>
                <strong className="text-[color:var(--color-text)]">The pilot:</strong>{" "}
                we install it free for two weeks on your real line.{" "}
                <strong className="text-[color:var(--color-cyan)]">
                  If it catches you a job, we start at $350/month. If it
                  doesn&apos;t, we rip it out and shake hands.
                </strong>{" "}
                All the risk is ours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Local + trades */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card">
          <div className="eyebrow-muted mb-3">Built here, for here</div>
          <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
            Job Catcher is built in <strong className="text-[color:var(--color-text)]">Belton, Texas</strong> and
            serves contractors across{" "}
            <strong className="text-[color:var(--color-text)]">
              Temple, Belton, Killeen, Harker Heights, Copperas Cove, Salado, and
              Central Texas
            </strong>{" "}
            — roofing, HVAC, plumbing, electrical, fence, concrete, landscaping,
            and every trade whose phone rings while their hands are full. We
            answer to the same weather, the same hail season, and the same supply
            house lines you do.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="eyebrow mb-6">● Straight answers</div>
        <div className="grid md:grid-cols-2 gap-5">
          {faqs.map((f) => (
            <div key={f.q} className="card">
              <h3 className="text-lg font-medium mb-2">{f.q}</h3>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="card card-accent p-8 text-center">
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
            How many jobs called someone else this week?
          </h2>
          <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-2xl mx-auto">
            Two weeks free on your real line. If it catches a job, we go from
            there. If it doesn&apos;t, you lose nothing but the jobs you were
            already losing.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <a
              href="tel:+12542723313"
              className="inline-block rounded-lg bg-[color:var(--color-cyan)] px-6 py-3 font-medium text-black transition-opacity hover:opacity-90"
            >
              Call (254) 272-3313
            </a>
            <Link
              href="/contact"
              className="inline-block rounded-lg border border-[color:var(--color-border)] px-6 py-3 font-medium transition-colors hover:border-[color:var(--color-cyan)]"
            >
              Start the free pilot →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
