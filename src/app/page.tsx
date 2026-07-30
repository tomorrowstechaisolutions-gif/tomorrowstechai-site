import Link from "next/link";
import Image from "next/image";
import { posts } from "@/content/posts";
import { NewsletterForm } from "@/components/NewsletterForm";
import { LazyYouTube } from "@/components/LazyYouTube";

export default function Home() {
  const latestPosts = posts.slice(0, 3);

  return (
    <>
      <section className="relative grid-overlay overflow-hidden border-b border-[color:var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-16 lg:pt-24 lg:pb-20 relative z-10">
          <div className="grid lg:grid-cols-[1.02fr_0.98fr] gap-14 lg:gap-16 items-center">
            <div>
              <div className="eyebrow mb-6">● AI for construction · field ops · contractors</div>
              <h1 className="text-5xl md:text-6xl lg:text-[68px] font-medium leading-[1.02] tracking-[-0.045em] max-w-3xl">
                We build the systems your{" "}
                <span className="text-[color:var(--color-cyan)]">PMs wish existed.</span>
              </h1>
              <p className="text-lg md:text-xl text-[color:var(--color-text-secondary)] mt-7 max-w-2xl leading-relaxed">
                AI command centers, Smartsheet workflows, and custom AI systems
                for operations-heavy businesses. Built by operators who&apos;ve
                lived inside the chaos.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/contact" className="btn-primary">
                  Book a discovery call →
                </Link>
                <Link href="/work" className="btn-secondary">
                  See proven work
                </Link>
              </div>
              <div className="mt-7 flex items-center gap-3 text-sm text-[color:var(--color-text-muted)]">
                <span className="inline-flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-success)] shadow-[0_0_12px_rgba(0,214,143,0.7)]" />
                  Open for select engagements
                </span>
                <span aria-hidden="true">·</span>
                <span>30-minute working session</span>
              </div>
            </div>

            <OperatorConsole />
          </div>
        </div>

        <div className="relative z-10 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)]/70 backdrop-blur">
          <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-y-7">
            <Stat label="Years in operations" value="18" />
            <Stat label="Programs delivered" value="100s" />
            <Stat label="Client rating" value="5.0" />
            <Stat label="Human approval" value="Always" />
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="md:flex md:items-start md:gap-10">
            <div className="md:w-1/2 mb-8 md:mb-0">
              <div className="eyebrow mb-3">● Just shipped</div>
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mb-3">
                Aegis Fleet AI.
              </h2>
              <p className="text-xl text-[color:var(--color-cyan)] font-medium leading-tight mb-5">
                The all-in-one AI operating system built for EMS &amp; medical fleets.
              </p>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
                Tracking. Dispatch. Readiness. Oversight. AI agents handle PM scheduling, compliance tracking, and dispatch readiness so crews focus on the call instead of the paperwork.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
                <div className="border-l-2 border-[color:var(--color-cyan)] pl-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">Mission</div>
                  <div className="text-sm font-medium">Safety</div>
                </div>
                <div className="border-l-2 border-[color:var(--color-cyan)] pl-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">Standard</div>
                  <div className="text-sm font-medium">Compliance</div>
                </div>
                <div className="border-l-2 border-[color:var(--color-cyan)] pl-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">Outcome</div>
                  <div className="text-sm font-medium">Protection</div>
                </div>
                <div className="border-l-2 border-[color:var(--color-cyan)] pl-3">
                  <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">Status</div>
                  <div className="text-sm font-medium text-[color:var(--color-cyan)]">Live</div>
                </div>
              </div>
              <a
                href="https://aegisfleetai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Enter the command center →
              </a>
            </div>
            <div className="md:w-1/2">
              <div className="card overflow-hidden p-0">
                <div className="relative w-full aspect-video bg-black">
                  <LazyYouTube id="0ltnbI04vLY" title="Aegis Fleet AI — Trailer" />
                </div>
                <div className="p-4">
                  <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)] mb-1">
                    Trailer · 10:02
                  </div>
                  <div className="text-sm text-[color:var(--color-text-secondary)]">
                    Watch the Aegis Fleet AI command intelligence walkthrough.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="eyebrow-muted mb-3">What we build</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-12 max-w-2xl">
          Operational clarity, powered by AI.
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          <BuildCard
            tag="Service"
            title="AI Command Centers"
            body="Smartsheet workflows, crew/fleet/compliance dashboards, real-time visibility across departments. One source of truth your executives can actually trust."
          />
          <BuildCard
            tag="Product"
            title="Held"
            body="AI-powered coordination app for busy households, now on iOS. Built around one principle: AI proposes, you decide. Nothing changes without approval."
            href="https://myheldapp.com"
          />
          <BuildCard
            tag="Product"
            title="NexaFlow AI"
            body="Local AI operating system that runs on your machine. Online or offline, your data stays private. Your data isn't training someone else's models."
          />
          <BuildCard
            tag="Service"
            title="Custom AI Workflows"
            body="Built around how your business actually works, not how generic tools think it should. Field-tested, Smartsheet-first, AI-enabled."
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="eyebrow-muted mb-3">● Watch us build</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-2xl">
              See it in action.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-3 max-w-2xl">
              Short walkthroughs of the dashboards and AI systems we&apos;re shipping. Real screens. Real business operations.
            </p>
          </div>
          <a
            href="https://www.youtube.com/@TomorrowsTechAISolution"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[color:var(--color-cyan)] hover:underline whitespace-nowrap py-2 -my-2 inline-block"
          >
            Full channel →
          </a>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <VideoCard
            id="WhoYhmM7YAo"
            title="AI Business Dashboard Preview"
            subtitle="My Smart Business Operating System"
            duration="4:01"
          />
          <VideoCard
            id="vzZxRRrRoH0"
            title="Private AI Business Assistant"
            subtitle="For Real Company Operations"
            duration="1:28"
          />
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="eyebrow-muted mb-3">Who we work with</div>
          <h2 className="text-3xl font-medium tracking-tight mb-10 max-w-2xl">
            Industries drowning in spreadsheets and email chains.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <IndustryItem name="Construction" />
            <IndustryItem name="Telecom & infrastructure" />
            <IndustryItem name="Field operations" />
            <IndustryItem name="Contractor management" />
            <IndustryItem name="Service businesses" />
            <IndustryItem name="Operations-heavy SMBs" />
          </div>
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="md:flex md:items-start md:justify-between gap-10">
            <div className="md:max-w-xl mb-6 md:mb-0">
              <div className="eyebrow-muted mb-3">● Free download</div>
              <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">
                12 questions to ask before adding AI to your operation.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-5">
                Most AI integrations fail before they start. Not because the AI isn&apos;t smart enough — because the underlying operations aren&apos;t ready for it. This 3-page checklist is the one we walk through with every new client.
              </p>
              <ul className="space-y-1.5 text-sm text-[color:var(--color-text-secondary)] mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-cyan)] mt-0.5">→</span>
                  <span>The 12 questions — organized by foundation area</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-cyan)] mt-0.5">→</span>
                  <span>Score yourself in 5 minutes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[color:var(--color-cyan)] mt-0.5">→</span>
                  <span>3-tier action plan based on your score</span>
                </li>
              </ul>
              <Link href="/operations-audit" className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline py-2 -my-2 inline-block">
                Get the checklist →
              </Link>
            </div>
            <div className="md:w-80 shrink-0">
              <div className="card border-2 border-[color:var(--color-cyan-deep)]/40 p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-[color:var(--color-cyan)]" />
                <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-2">
                  ● PDF · 3 pages
                </div>
                <div className="text-lg font-medium leading-tight mb-1">
                  The Operations Audit Checklist
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)] font-mono uppercase tracking-widest mb-4">
                  By John Hockinson
                </div>
                <div className="space-y-1.5 text-xs text-[color:var(--color-text-secondary)] leading-relaxed mb-4">
                  <div className="border-b border-[color:var(--color-border-subtle)] pb-1.5">
                    <span className="font-mono text-[color:var(--color-cyan)] mr-2">01.</span>
                    Where does each piece of operational data live today?
                  </div>
                  <div className="border-b border-[color:var(--color-border-subtle)] pb-1.5">
                    <span className="font-mono text-[color:var(--color-cyan)] mr-2">02.</span>
                    Is there a single source of truth — or three?
                  </div>
                  <div className="border-b border-[color:var(--color-border-subtle)] pb-1.5">
                    <span className="font-mono text-[color:var(--color-cyan)] mr-2">03.</span>
                    What questions take more than 5 minutes to answer?
                  </div>
                  <div className="text-[color:var(--color-text-muted)] italic pt-1">
                    + 9 more in the full PDF
                  </div>
                </div>
                <Link href="/operations-audit" className="btn-primary text-xs w-full justify-center">
                  Download free →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="eyebrow-muted mb-6 text-center">● From a client</div>
        <blockquote className="text-center">
          <p className="text-2xl md:text-3xl font-medium tracking-tight leading-snug text-[color:var(--color-text)] mb-6">
            &ldquo;John did an amazing job building what I described, he really understood The Field House, my brand, and it really showed thru his work.&rdquo;
          </p>
          <footer className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-text-muted)]">
            <span className="text-[color:var(--color-cyan)]">Christina Bills</span>
            {" · "}
            Owner, The Field House Gym
          </footer>
        </blockquote>
        <div className="mt-8 text-center">
          <Link
            href="/work"
            className="text-sm text-[color:var(--color-cyan)] hover:underline font-mono uppercase tracking-widest py-2 -my-2 inline-block"
          >
            See the work →
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-baseline justify-between mb-10">
          <div>
            <div className="eyebrow-muted mb-3">Latest insights</div>
            <h2 className="text-3xl font-medium tracking-tight">From the field.</h2>
          </div>
          <Link href="/blog" className="text-sm text-[color:var(--color-cyan)] hover:underline py-2 -my-2 inline-block">
            All posts →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {latestPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="card hover:border-[color:var(--color-cyan-deep)] block group overflow-hidden"
            >
              {post.image && (
                <div className="relative w-full aspect-[16/9] -mx-6 -mt-6 mb-4 overflow-hidden border-b border-[color:var(--color-border)]">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 360px"
                    className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                </div>
              )}
              <div className="eyebrow-muted mb-3">{post.date}</div>
              <h3 className="text-lg font-medium leading-snug mb-2">{post.title}</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface)]/40">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="md:flex md:items-start md:justify-between gap-10">
            <div className="md:max-w-md mb-6 md:mb-0">
              <div className="eyebrow-muted mb-3">● Field notes by email</div>
              <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">
                Get the next post in your inbox.
              </h2>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed">
                Short notes on AI, operations, Smartsheet, and the systems we&apos;re shipping. No spam. No fluff. Unsubscribe any time.
              </p>
            </div>
            <div className="flex-1 md:pt-2">
              <NewsletterForm />
            </div>
          </div>
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
    <div className="border-l border-[color:var(--color-border)] pl-5 first:border-l-0 first:pl-0 lg:first:border-l lg:first:pl-5">
      <div className="text-2xl md:text-3xl font-medium tracking-tight text-[color:var(--color-text)]">{value}</div>
      <div className="text-[11px] text-[color:var(--color-text-muted)] uppercase tracking-[0.16em] mt-1.5">
        {label}
      </div>
    </div>
  );
}

function OperatorConsole() {
  const workflows = [
    { name: "Fleet readiness", meta: "42 of 46 units ready", status: "92%", tone: "good" },
    { name: "Compliance watch", meta: "4 items need attention", status: "Review", tone: "warn" },
    { name: "Job closeouts", meta: "18 completed this week", status: "+12%", tone: "good" },
  ];

  return (
    <div className="operator-console" aria-label="Representative AI command center interface">
      <div className="operator-console-glow" />
      <div className="relative">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--color-border)]">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
              Representative operator view
            </div>
            <div className="text-sm font-medium mt-1">Live operating picture</div>
          </div>
          <div className="live-pill">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-success)]" />
            Live
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[color:var(--color-border)] border-b border-[color:var(--color-border)]">
          <div className="bg-[color:var(--color-surface)] px-5 py-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
              Operational readiness
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-medium tracking-tight">92%</span>
              <span className="text-xs text-[color:var(--color-success)] mb-1">+4.8%</span>
            </div>
          </div>
          <div className="bg-[color:var(--color-surface)] px-5 py-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
              AI recommendations
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-medium tracking-tight">03</span>
              <span className="text-xs text-[color:var(--color-amber)] mb-1">awaiting approval</span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-2">
          {workflows.map((workflow) => (
            <div key={workflow.name} className="workflow-row">
              <span className={`workflow-dot workflow-dot-${workflow.tone}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{workflow.name}</div>
                <div className="text-xs text-[color:var(--color-text-muted)] mt-0.5">{workflow.meta}</div>
              </div>
              <span className={`workflow-status workflow-status-${workflow.tone}`}>{workflow.status}</span>
            </div>
          ))}
        </div>

        <div className="mx-5 mb-5 rounded-lg border border-[color:var(--color-cyan-deep)]/50 bg-[color:var(--color-cyan)]/[0.045] p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[color:var(--color-cyan)]">
              AI recommendation
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-amber)]">
              Approval required
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[color:var(--color-text-secondary)] mt-2">
            Move Unit 214 into tomorrow&apos;s PM window to avoid a compliance conflict on Friday.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider">
            <span className="rounded border border-[color:var(--color-cyan-deep)] px-2.5 py-1 text-[color:var(--color-cyan)]">
              Review proposal
            </span>
            <span className="text-[color:var(--color-text-muted)]">No changes made</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildCard({
  tag,
  title,
  body,
  href,
}: {
  tag: string;
  title: string;
  body: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="eyebrow-muted mb-3">{tag}</div>
      <h3 className="text-xl font-medium mb-3">{title}</h3>
      <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px]">{body}</p>
    </>
  );
  if (href) {
    return <a href={href} className="card block group">{content}</a>;
  }
  return <div className="card">{content}</div>;
}

function IndustryItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[color:var(--color-border-subtle)]">
      <div className="w-1.5 h-1.5 bg-[color:var(--color-cyan)]" />
      <span className="text-[color:var(--color-text)]">{name}</span>
    </div>
  );
}

function VideoCard({
  id,
  title,
  subtitle,
  duration,
}: {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
}) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="relative w-full aspect-video bg-black">
        <LazyYouTube id={id} title={title} />
      </div>
      <div className="p-5">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="font-mono text-xs text-[color:var(--color-cyan)] tracking-widest">
            {duration}
          </span>
        </div>
        <h3 className="text-lg font-medium mb-1">{title}</h3>
        <div className="text-sm text-[color:var(--color-text-secondary)]">
          {subtitle}
        </div>
      </div>
    </div>
  );
}
