import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title:
    "Job Catcher — Missed Call Text Back for Contractors | Temple, Belton & Killeen TX",
  description:
    "Job Catcher connects to a contractor's business line and sends custom missed-call responses while the crew is busy. Built and managed for roofers, HVAC, plumbers, fence and concrete crews in Central Texas. $350/month. Free 2-week pilot.",
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
      "Custom missed-call text responses, lead alerts, follow-up, and review workflows for Central Texas contractors. Fully configured and managed for $350/month.",
    url: "https://tomorrowstechai.com/job-catcher",
    type: "website",
  },
};

const steps = [
  {
    tag: "01",
    title: "We connect your business line.",
    body: "We verify the best setup for your current number, carrier, and call flow. Depending on the line, we connect it directly or configure forwarding so missed calls can trigger the workflow.",
  },
  {
    tag: "02",
    title: "We write responses that sound like you.",
    body: "Your trade, services, hours, service area, preferred tone, and callback expectations are built into the response. It feels like your company answering—not a canned bot.",
  },
  {
    tag: "03",
    title: "A missed caller gets an immediate text.",
    body: "When you cannot answer, Job Catcher responds automatically and alerts you. The customer can explain what they need while you finish the job, giving you a better chance to call back before they move on.",
  },
];

const included = [
  {
    title: "Business-line connection",
    body: "We configure the number, forwarding, carrier registration, and missed-call trigger required for your specific phone setup.",
  },
  {
    title: "Custom response writing",
    body: "We write the initial reply and follow-up language around your company, services, schedule, service area, and the way you actually speak to customers.",
  },
  {
    title: "Lead alerts and conversations",
    body: "Replies stay visible in one managed conversation flow, and you are alerted when a customer responds so a real person can take over and close the work.",
  },
  {
    title: "Follow-up and review workflows",
    body: "We can configure polite lead follow-up and post-job review requests, then tune the messages as you learn what gets the best response.",
  },
];

const faqs = [
  {
    q: "How fast can this be running on my line?",
    a: "We can build the workflow quickly, but activation depends on connecting the number and completing required carrier and A2P registration. We give you a realistic activation date after checking your current phone setup.",
  },
  {
    q: "Can I keep my existing business number?",
    a: "In most cases we can connect your existing business line or use call forwarding so customers keep calling the number they already know. The exact setup depends on your carrier and number type, and we verify that before changing anything.",
  },
  {
    q: "Are the responses generic?",
    a: "No. We write them around your company, trade, services, hours, service area, preferred tone, and callback process. You approve the language before it goes live, and we can adjust it as you learn what customers respond to.",
  },
  {
    q: "Is this an answering service or an AI receptionist?",
    a: "No. Job Catcher does not pretend to estimate, diagnose, or close the job for you. It acknowledges the missed call, asks what the customer needs, keeps the conversation open, and alerts you. You or your team take over when you are available.",
  },
  {
    q: "What does it cost?",
    a: "$350 per month for the managed Job Catcher service. That covers configuration, custom response writing, workflow management, testing, and ongoing adjustments. There is no long-term contract.",
  },
  {
    q: "What's the free pilot?",
    a: "Once the line is approved and connected, we run Job Catcher on your real call flow for two weeks. You can see the conversations it catches before deciding whether to continue at $350 per month.",
  },
  {
    q: "Do I have to learn or manage another app?",
    a: "No. Job Catcher is a fully managed service. TomorrowsTech AI handles the phone workflow, custom responses, testing, monitoring, and ongoing tuning behind the scenes.",
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
  serviceType:
    "Managed missed-call text responses, contractor lead follow-up, and review automation",
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
    description:
      "$350/month managed service with custom responses and a free 2-week pilot",
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
        <div className="md:grid md:grid-cols-[1fr_320px] md:items-center md:gap-12">
          <div>
            <div className="eyebrow mb-6">⚡ Job Catcher · For Contractors · Temple – Belton – Killeen</div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1]">
              When you can&apos;t answer the call,{" "}
              <span className="text-[color:var(--color-cyan)]">your business still does.</span>
            </h1>
            <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6">
              We connect your business line and build custom text responses
              around your company. When you&apos;re on a roof, under a sink, or
              running a crew, the customer gets an immediate answer instead of
              another reason to call the next contractor.
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
              Call that number after hours and watch the managed response flow
              work. That is the product your customers will experience.
            </p>
          </div>

          {/* Phone mockup — the product, happening */}
          <div className="relative mx-auto mt-12 w-[300px] shrink-0 md:mt-0">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[3rem] bg-[color:var(--color-cyan)]/10 blur-2xl"
            />
            <div className="relative rounded-[2.2rem] border border-[color:var(--color-border)] bg-black p-3 shadow-2xl">
              <div className="rounded-[1.7rem] bg-[#0a0f14] px-4 pb-6 pt-4">
                <div className="mb-4 text-center font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-text-secondary)]">
                  Tuesday · 2:47 PM
                </div>
                <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[color:var(--color-text-secondary)]">
                  📵 Missed call · Mike&apos;s Roofing
                </div>
                <div className="ml-auto mb-1 max-w-[88%] rounded-2xl rounded-br-sm bg-[color:var(--color-cyan)] px-3 py-2 text-[13px] leading-snug text-black">
                  This is Mike&apos;s Roofing — on a job right now. What do you need?
                  I&apos;ll call you right back.
                </div>
                <div className="mb-4 text-right text-[10px] text-[color:var(--color-text-secondary)]">
                  sent automatically · 8 seconds later
                </div>
                <div className="mr-auto mb-1 max-w-[88%] rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-[13px] leading-snug">
                  Oh perfect — yes, hail damage on my roof. Can y&apos;all come look
                  this week? 🙏
                </div>
                <div className="text-[10px] text-[color:var(--color-text-secondary)]">
                  2:49 PM · customer stays yours
                </div>
                <div className="mt-4 rounded-lg border border-[color:var(--color-cyan)]/30 bg-[color:var(--color-cyan)]/10 px-3 py-2 text-center font-mono text-[11px] tracking-wide text-[color:var(--color-cyan)]">
                  ✓ JOB CAUGHT
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Offer row */}
        <div className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <div className="font-mono text-2xl text-[color:var(--color-cyan)]">Seconds</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-text-secondary)]">to the first response</div>
          </div>
          <div>
            <div className="font-mono text-2xl text-[color:var(--color-cyan)]">Custom</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-text-secondary)]">to your company and trade</div>
          </div>
          <div>
            <div className="font-mono text-2xl text-[color:var(--color-cyan)]">$350</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-text-secondary)]">managed service per month</div>
          </div>
          <div>
            <div className="font-mono text-2xl text-[color:var(--color-cyan)]">2 wks</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-text-secondary)]">free pilot after activation</div>
          </div>
        </div>
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

      {/* Response playbook */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card card-accent p-8">
          <div className="grid lg:grid-cols-[0.7fr_1.3fr] gap-8 lg:gap-12">
            <div>
              <div className="eyebrow-muted mb-3">Your response playbook</div>
              <h2 className="text-2xl md:text-3xl font-medium tracking-tight">
                Built around your business before it answers for you.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
                You approve the language. We configure the workflow and keep it
                current as your business changes.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ["Company voice", "Straightforward, friendly, urgent, or professional"],
                ["Services", "What you handle—and what you do not"],
                ["Service area", "The cities and radius your crew covers"],
                ["Business hours", "Different replies for busy, closed, and after-hours"],
                ["Customer questions", "The details you need before calling back"],
                ["Callback process", "What the customer should expect next"],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]/60 p-4"
                >
                  <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-cyan)]">
                    {title}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The value */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card card-accent p-8">
          <div className="md:flex md:items-start md:gap-10">
            <div className="md:w-1/3 mb-4 md:mb-0">
              <div className="eyebrow-muted mb-2">Why it matters</div>
              <h3 className="text-xl font-medium">
                The first useful response often wins the conversation.
              </h3>
            </div>
            <div className="md:w-2/3 text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] space-y-3">
              <p>
                A homeowner with a leak, a dead air conditioner, or a damaged
                fence is not looking for voicemail. They are looking for a
                contractor who acknowledges the problem and gives them a clear
                next step.
              </p>
              <p>
                Job Catcher gives them that response while your hands are full.
                You still handle the estimate and close the job; the system
                simply helps keep the opportunity alive long enough for you to
                take over.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="eyebrow mb-6">● What&apos;s included</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
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
              <h3 className="text-xl font-medium">$350/month. Managed. Month to month.</h3>
            </div>
            <div className="md:w-2/3 text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] space-y-3">
              <p>
                This is a managed service, not a login we hand you. We connect
                the line, write the responses, configure the workflow, test it,
                monitor the setup, and adjust the messages with you. There is no
                long-term contract.
              </p>
              <p>
                <strong className="text-[color:var(--color-text)]">The pilot:</strong>{" "}
                after your number is approved and connected, we run the workflow
                free for two weeks on your real call flow.{" "}
                <strong className="text-[color:var(--color-cyan)]">
                  See the conversations it catches, then decide whether the
                  $350/month service earns its place.
                </strong>{" "}
                If it does not fit, you do not continue.
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
          <div className="mt-5 flex flex-wrap gap-2">
            {["ROOFING", "HVAC", "PLUMBING", "ELECTRICAL", "FENCE", "CONCRETE", "LANDSCAPING", "GUTTERS", "REMODEL"].map((t) => (
              <span
                key={t}
                className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 font-mono text-[11px] tracking-widest text-[color:var(--color-text-secondary)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The operator */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="card md:flex md:items-center md:gap-10">
          <div className="mb-6 shrink-0 md:mb-0">
            <Image
              src="/lead-magnets/ai-field-guide/john-hockinson.png"
              alt="John Hockinson — founder, TomorrowsTech AI, Belton TX"
              width={180}
              height={180}
              className="rounded-2xl border border-[color:var(--color-border)] object-cover"
            />
          </div>
          <div>
            <div className="eyebrow-muted mb-2">The guy behind it</div>
            <h3 className="text-xl font-medium">
              You&apos;ll deal with me — not a call center.
            </h3>
            <p className="mt-3 text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">
              I&apos;m John Hockinson. I spent 18 years running telecom and
              construction programs — towers, crews, deadlines, the phone ringing
              while my hands were full — before I started building automation
              systems. Job Catcher exists because I&apos;ve <em>been</em> the guy
              who missed the call that mattered. I install it, I test it on your
              real line, and if something ever breaks, you text me and I fix it.
              That&apos;s the whole customer-service department.
            </p>
            <p className="mt-3 text-sm text-[color:var(--color-text-secondary)]">
              John Hockinson · Founder, Tomorrows Tech AI LLC · Belton, TX ·{" "}
              <a href="tel:+12542723313" className="text-[color:var(--color-cyan)] hover:underline">
                (254) 272-3313
              </a>
            </p>
          </div>
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
            We connect your line, write your responses, and let you see the
            workflow operate on real missed calls for two weeks. Continue only
            if the $350/month service proves useful to your business.
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
