import Link from "next/link";
import { posts } from "@/content/posts";

const signatureSystems = [
  {
    n: "01",
    title: "Command Centers",
    body: "Custom business visibility hubs that unify reporting, metrics, accountability, and leadership oversight. One place to see what's moving, what's stuck, and what needs attention.",
  },
  {
    n: "02",
    title: "Workflow Packages",
    body: "Forms, approvals, reporting flows, and automation systems designed around how your business actually operates. Cleanly move information from one stage to the next.",
  },
  {
    n: "03",
    title: "AI Business Units · Nexus One",
    body: "Private AI-ready business systems built for smarter decisions, better internal tools, and faster execution. Designed for business use, not just public chatbot tooling.",
  },
];

export default function Home() {
  const latestPosts = posts.slice(0, 3);

  return (
    <>
      <section className="relative grid-overlay overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative z-10">
          <div className="eyebrow mb-6">● Intelligent systems for modern business</div>
          <h1 className="text-5xl md:text-6xl font-medium leading-[1.05] tracking-tight max-w-4xl">
            We build intelligent systems for{" "}
            <span className="text-[color:var(--color-cyan)]">modern business.</span>
          </h1>
          <p className="text-xl text-[color:var(--color-text-secondary)] mt-6 max-w-2xl leading-relaxed">
            Command centers, workflow systems, and private AI business units that bring operations, automation, and data into one clear command environment. Built around how your business actually runs.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact" className="btn-primary">
              Book a discovery call →
            </Link>
            <Link href="/services" className="btn-secondary">
              See what we build
            </Link>
          </div>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <Stat label="Years in operations" value="18" />
            <Stat label="Signature systems" value="3" />
            <Stat label="On-prem AI ready" value="Yes" />
            <Stat label="Propose, never act" value="Always" />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="eyebrow-muted mb-3">Signature Systems</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3 max-w-2xl">
          The core of the Tomorrowstek ecosystem.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed max-w-2xl mb-12">
          Three productized systems built around how operations-heavy businesses actually run. Plus on-premises AI infrastructure when privacy and control matter.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {signatureSystems.map((s) => (
            <div key={s.n} className="card">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">{s.n}</span>
                <h3 className="text-lg font-medium">{s.title}</h3>
              </div>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Link href="/services" className="card card-accent flex items-center justify-between gap-6 hover:border-[color:var(--color-cyan)]">
            <div>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="font-mono text-[color:var(--color-cyan)] text-sm tracking-widest">04</span>
                <span className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-amber)]">Hardware Offering</span>
              </div>
              <h3 className="text-lg font-medium mb-1">Private On-Site AI Infrastructure</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                Dedicated AI hardware delivered to your business. On-premises, your data never trains someone else&apos;s models.
              </p>
            </div>
            <span className="text-[color:var(--color-cyan)] font-mono text-sm whitespace-nowrap">View specs →</span>
          </Link>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">Who we work with</div>
          <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            Operations-heavy businesses that need clarity.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <IndustryItem name="Construction" />
            <IndustryItem name="Telecom & infrastructure" />
            <IndustryItem name="Field operations" />
            <IndustryItem name="Contractor management" />
            <IndustryItem name="Real estate investment" />
            <IndustryItem name="Operations-heavy SMBs" />
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="eyebrow-muted mb-3">Latest insights</div>
            <h2 className="text-3xl font-medium tracking-tight">From the field.</h2>
          </div>
          <Link href="/blog" className="text-sm text-[color:var(--color-cyan)] hover:underline">
            All posts →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {latestPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="card hover:border-[color:var(--color-cyan-deep)] block"
            >
              <div className="eyebrow-muted mb-3">{post.date}</div>
              <h3 className="text-lg font-medium leading-snug mb-2">{post.title}</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="card card-accent text-center md:text-left md:flex md:items-center md:justify-between gap-10 p-10">
          <div>
            <div className="eyebrow mb-3">● Open for new engagements</div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight max-w-xl">
              Running operations on spreadsheets and email chains?
            </h3>
            <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-lg">
              That&apos;s exactly where we work. Let&apos;s compare notes.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-mono text-[color:var(--color-cyan)]">{value}</div>
      <div className="text-xs text-[color:var(--color-text-muted)] uppercase tracking-widest mt-1">
        {label}
      </div>
    </div>
  );
}

function IndustryItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[color:var(--color-border-subtle)]">
      <div className="w-1.5 h-1.5 bg-[color:var(--color-cyan)]" />
      <span className="text-[color:var(--color-text)]">{name}</span>
    </div>
  );
}
