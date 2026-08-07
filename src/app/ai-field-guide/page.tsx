import Link from "next/link";
import Image from "next/image";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";

export const metadata = {
  title: "Your Best Next Hire Is AI · Free Field Guide",
  description:
    "Free 6-page field guide for business owners — a plain-English playbook for using AI to grow your business. What to hand off first, how to start in a week, and the prompts that actually move the needle. No hype. No code.",
  alternates: { canonical: "/ai-field-guide" },
  openGraph: {
    title: "Your Best Next Hire Is AI · Tomorrow’s Tech AI",
    description:
      "Free 6-page field guide. Plain English. No code. By Friday you can have a real AI workflow running for your business.",
    url: "https://tomorrowstechai.com/ai-field-guide",
    type: "article",
  },
};

const fiveRoles = [
  {
    n: "01",
    title: "The Marketing Assistant",
    body: "Turn one idea into a week of content. Emails, posts, blog outlines, ad copy — in your voice.",
    panel: "head",
  },
  {
    n: "02",
    title: "The Customer Support Rep",
    body: "Draft replies, summarize threads, build a polished FAQ from past tickets. You approve before anything sends.",
    panel: "handshake",
  },
  {
    n: "03",
    title: "The Sales Helper",
    body: "Research prospects, personalize outreach, draft proposals, tidy meeting notes into next steps.",
    panel: "icons",
  },
  {
    n: "04",
    title: "The Operations Analyst",
    body: "Clean messy spreadsheets, summarize reports, write SOPs, draft the docs you keep meaning to create.",
    panel: "growth",
  },
  {
    n: "05",
    title: "The Thinking Partner",
    body: "Pressure-test decisions, brainstorm names, role-play tough conversations, get a second opinion at 11pm.",
    panel: "check",
  },
];

const weekSteps = [
  "Pick one task that drains you.",
  "Brief it like a new hire.",
  "Run it, then coach it.",
  "Save your winning prompt.",
  "Add a second task. Teach a teammate.",
];

export default function AIFieldGuidePage() {
  return (
    <>
      {/* Hero with cover image + form */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-12">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="eyebrow mb-6">● Free field guide · 6 pages</div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.05] mb-6">
              Your best next hire{" "}
              <span className="text-[color:var(--color-cyan)]">is AI.</span>
            </h1>
            <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mb-6">
              A plain-English playbook for business owners. What to hand off first,
              how to start in a week, and the prompts that actually move the needle.
            </p>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8 max-w-lg">
              No hype. No code required. By Friday you can have a real AI workflow
              running for your business — for the cost of a streaming subscription.
            </p>

            <div className="space-y-2 mb-8">
              <div className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                <span>The 3-part rule that beats clever one-liners every time</span>
              </div>
              <div className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                <span>5 roles to hire AI into today — what pays back fastest</span>
              </div>
              <div className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                <span>A 7-day playbook to a real workflow (not just a login)</span>
              </div>
              <div className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                <span>5 mistakes that waste the win — how to avoid each one</span>
              </div>
              <div className="flex items-start gap-3 text-[color:var(--color-text)] leading-relaxed">
                <span className="text-[color:var(--color-cyan)] font-mono mt-0.5">→</span>
                <span>Copy-paste starter prompts you can use today</span>
              </div>
            </div>
          </div>

          <div>
            <div className="relative w-full aspect-[3/4] max-w-md mx-auto mb-6 rounded-lg overflow-hidden border border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
              <Image
                src="/lead-magnets/ai-field-guide/john-hockinson.png"
                alt="Your Best Next Hire Is AI — by John Hockinson"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover"
              />
            </div>
            <div className="card p-6 max-w-md mx-auto">
              <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-3">
                ● Drop your email
              </div>
              <h2 className="text-xl font-medium mb-2">Free. Instant. No spam.</h2>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
                We&apos;ll email it to you and send a copy straight to your inbox.
              </p>
              <LeadMagnetForm
                magnet="ai-field-guide"
                buttonLabel="Send me the field guide →"
                successMessage="Your AI Field Guide is on its way. Check your inbox in a minute — and start with page 4 if you want the fastest win."
              />
            </div>
          </div>
        </div>
      </section>

      {/* The 5 roles */}
      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">● Inside the guide</div>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3 max-w-2xl">
            5 roles to hire AI into today.
          </h2>
          <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-10 max-w-2xl">
            You don&apos;t need an &ldquo;AI strategy.&rdquo; You need a short list
            of jobs that eat your week. Here are the five that pay back fastest for
            almost any business.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {fiveRoles.map((role) => (
              <div key={role.n} className="card">
                <div className="relative w-full aspect-square -mx-6 -mt-6 mb-4 overflow-hidden border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
                  <Image
                    src={`/lead-magnets/ai-field-guide/panel-${role.panel}.png`}
                    alt={role.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 360px"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">
                    {role.n}
                  </span>
                  <h3 className="text-lg font-medium">{role.title}</h3>
                </div>
                <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                  {role.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The 7-day playbook */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="eyebrow-muted mb-3">● The 7-day playbook</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3 max-w-2xl">
          Up and running in seven days.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-10 max-w-2xl">
          Skip the overwhelm. Pick one tool, give it 20 minutes a day, and follow
          this path. By Friday you&apos;ll have a real workflow, not just a login.
        </p>
        <div className="grid md:grid-cols-5 gap-5">
          {weekSteps.map((step, i) => (
            <div key={i} className="card">
              <div className="font-mono text-sm text-[color:var(--color-cyan)] tracking-widest mb-3">
                DAY {i + 1}
              </div>
              <div className="text-sm text-[color:var(--color-text)] leading-relaxed">
                {step}
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-[color:var(--color-text-muted)] mt-8 max-w-2xl">
          Full instructions, starter prompts, and the &ldquo;avoid these traps&rdquo;
          section all live inside the PDF. Free.
        </p>
      </section>

      {/* Bottom form for scrollers */}
      <section className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="card card-accent p-8 md:p-10">
            <div className="eyebrow mb-3">● Grab the guide</div>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">
              Build smarter. Scale faster.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-6 max-w-lg">
              Drop your email. We&apos;ll send the PDF — and a copy straight to
              your inbox.
            </p>
            <LeadMagnetForm
              magnet="ai-field-guide"
              buttonLabel="Send me the field guide →"
              successMessage="Your AI Field Guide is on its way. Check your inbox in a minute — and start with page 4 if you want the fastest win."
            />
          </div>
        </div>
      </section>

      {/* After you read it CTA */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card p-10">
          <div className="eyebrow-muted mb-3">● Want a guide to walk the path?</div>
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            The guide is the map. We&apos;re the people who walk it with you.
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl">
            If you&apos;d rather have someone help you pick the right tools,
            set up done-with-you workflows, and train your team live — that&apos;s
            exactly what we do at Tomorrow’s Tech AI.
          </p>
          <Link href="/contact" className="btn-primary">
            Book a 30-minute discovery call →
          </Link>
        </div>
      </section>
    </>
  );
}
