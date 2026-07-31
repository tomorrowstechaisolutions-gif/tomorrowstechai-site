import Image from "next/image";
import Link from "next/link";
import { LazyYouTube } from "@/components/LazyYouTube";

export const metadata = {
  title: "Work",
  description:
    "Selected business operating platforms, command centers, contractor automation, websites, and client systems built by TomorrowsTech AI.",
  alternates: { canonical: "/work" },
  openGraph: {
    title: "Work · TomorrowsTech AI",
    description:
      "Business operating platforms, command centers, Job Catcher, and client systems built around the way real companies operate.",
    url: "https://tomorrowstechai.com/work",
    type: "website",
  },
};

const platformLayers = [
  { code: "01", title: "Public experience", body: "Website, services, lead capture, booking, and content" },
  { code: "02", title: "Private operations", body: "Admin tools, CRM, customer records, forms, and approvals" },
  { code: "03", title: "Command center", body: "Live dashboards, reporting, exceptions, and executive visibility" },
  { code: "04", title: "Connected intelligence", body: "Automations, integrations, social workflows, and human-approved AI" },
];

const supportingWork = [
  {
    title: "TomorrowsTech AI",
    category: "Company platform",
    body: "A custom Next.js marketing system with lead capture, field notes, downloadable resources, an AI assistant, SEO infrastructure, and connected inquiry workflows.",
    image: "/work/tomorrowstechai.png",
    href: "https://tomorrowstechai.com",
    hrefLabel: "You’re here",
    tags: ["Next.js", "Vercel", "Lead systems", "AI assistant"],
  },
  {
    title: "Held",
    category: "Product studio",
    body: "An AI-assisted coordination product for busy households, built around shared calendars, tasks, time-blocking, and a deliberate human-approval model.",
    image: "/work/held.png",
    href: "https://myheldapp.com",
    hrefLabel: "Visit Held",
    tags: ["iOS", "Web app", "AI", "Workflow design"],
  },
  {
    title: "TomorrowsTek",
    category: "Media brand",
    body: "A separate content and field-media brand spanning practical how-to content, local reviews, drone services, and audience development.",
    image: "/work/tomorrowstek-garage.png",
    href: "https://tomorrowstek.com",
    hrefLabel: "Visit TomorrowsTek",
    tags: ["Content systems", "Media", "Drone services"],
  },
];

export default function WorkPage() {
  return (
    <>
      <section className="work-hero max-w-6xl mx-auto px-6 pt-20 pb-14">
        <div className="eyebrow mb-6">● Selected work</div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight leading-[1.04] max-w-5xl">
          Work built to run the business—not just represent it.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-7 max-w-3xl">
          Public websites, private admin systems, CRM, command centers,
          dashboards, apps, and automation designed as one connected operation.
          Here is the work that best represents where TomorrowsTech AI is going.
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/services#business-platforms" className="btn-primary">
            Explore the flagship build →
          </Link>
          <Link href="/contact" className="btn-secondary">
            Discuss your operation
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="work-proof-strip">
          <ProofItem label="Flagship" value="Business operating platforms" />
          <ProofItem label="Core specialty" value="Command centers & dashboards" />
          <ProofItem label="Featured product" value="Job Catcher for contractors" />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">The flagship delivery model</div>
        <div className="work-platform">
          <div className="work-platform-copy">
            <div className="eyebrow mb-5">● One connected system</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight max-w-xl">
              A modern website in front. The entire operation behind it.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-5 max-w-xl">
              The strongest work is not a collection of disconnected tools.
              It is a business-specific platform where customers get a polished
              experience and the team gets one secure place to run the work.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              {["Website", "Admin backend", "CRM", "Dashboards", "Custom apps", "Social systems", "AI"].map(
                (tag) => (
                  <span key={tag} className="work-tag">
                    {tag}
                  </span>
                ),
              )}
            </div>
            <Link
              href="/services#business-platforms"
              className="inline-block mt-7 text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
            >
              See how the platform is built →
            </Link>
          </div>

          <div className="work-platform-map" aria-label="Four connected layers of a business operating platform">
            {platformLayers.map((layer, index) => (
              <div className="work-platform-layer" key={layer.code}>
                <span>{layer.code}</span>
                <div>
                  <strong>{layer.title}</strong>
                  <p>{layer.body}</p>
                </div>
                {index < platformLayers.length - 1 && <i aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Featured live product</div>
        <div className="job-work-feature">
          <div className="job-work-copy">
            <div className="job-work-mark">JC</div>
            <div className="eyebrow mb-4">● Built for contractors</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight">
              Job Catcher
            </h2>
            <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed mt-4 max-w-xl">
              A missed-call recovery and lead follow-up system that texts
              prospects back in seconds, keeps the opportunity visible, and
              helps contractors turn completed work into more Google reviews.
            </p>
            <div className="job-work-points">
              <span>Missed-call text back</span>
              <span>Lead alerts and follow-up</span>
              <span>Review automation</span>
              <span>Contractor-first setup</span>
            </div>
            <Link href="/job-catcher" className="btn-primary mt-7">
              See Job Catcher →
            </Link>
          </div>

          <div className="job-work-demo" aria-label="Representative Job Catcher lead recovery flow">
            <div className="job-work-status">
              <span>Incoming lead</span>
              <strong>Missed call detected</strong>
              <i>00:04 ago</i>
            </div>
            <div className="job-work-line"><span>Automatic response</span></div>
            <div className="job-work-message">
              <span>Job Catcher</span>
              <p>
                Sorry we missed you—we may be on a job. What can we help you
                with?
              </p>
              <i>Sent in seconds</i>
            </div>
            <div className="job-work-outcome">
              <span>✓</span>
              <div>
                <strong>Opportunity preserved</strong>
                <p>The contractor can call back without losing the lead.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Client work</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl mb-10">
          Real businesses. Clearer customer journeys.
        </h2>

        <article className="work-client-feature">
          <div className="work-client-media">
            <Image
              src="/work/fieldhouse.png"
              alt="The Field House Gym website"
              fill
              sizes="(max-width: 900px) 100vw, 55vw"
              className="object-cover"
            />
          </div>
          <div className="work-client-copy">
            <div className="eyebrow mb-4">● Website · Brand · Video · Lead capture</div>
            <h3 className="text-3xl font-medium tracking-tight">The Field House Gym</h3>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
              A complete digital presence for a major 24/7 lifting facility:
              positioning, website, member proof, onboarding, FAQs, lead
              capture, and promotional video for both Texas locations.
            </p>
            <blockquote className="work-quote">
              “John did an amazing job building what I described. He really
              understood The Field House, my brand, and it really showed through
              his work.”
              <footer>— Christina Bills, Owner</footer>
            </blockquote>
            <a
              href="https://www.thefieldhousegym.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
            >
              Visit The Field House →
            </a>
          </div>
        </article>

        <div className="work-video-panel">
          <div>
            <div className="eyebrow-muted mb-3">Campaign media</div>
            <h3 className="text-2xl font-medium tracking-tight">
              Brand footage made for the same customer journey.
            </h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <VideoCard id="MD0BQ-uaKG0" title="The Field House Gym · Harker Heights / Killeen" />
            <VideoCard id="poCVNcen-2o" title="The Field House Gym · Temple" />
          </div>
        </div>

        <article className="work-client-compact">
          <div className="work-client-compact-image">
            <Image
              src="/work/mintline.png"
              alt="Mintline Wellness website"
              fill
              sizes="(max-width: 768px) 100vw, 42vw"
              className="object-cover"
            />
          </div>
          <div>
            <div className="eyebrow mb-4">● Wellness · Website · Lead capture</div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight">
              Mintline Wellness
            </h3>
            <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
              A calm, medically credible launch presence for a Texas wellness
              practice—built around sustainable care, clear education, and a
              focused waitlist path.
            </p>
            <blockquote className="work-quote">
              “John&apos;s attention to detail was amazing. He asked all the
              right questions.”
              <footer>— Dr. Marlow Griggs, MD, Founder</footer>
            </blockquote>
            <a
              href="https://mintlinewellness.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
            >
              Visit Mintline Wellness →
            </a>
          </div>
        </article>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Products & brands</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl mb-4">
          Supporting work from the studio.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed max-w-2xl mb-10">
          Separate products and brands that demonstrate product thinking,
          technical range, content systems, and the ability to build beyond a
          standard marketing site.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {supportingWork.map((project) => (
            <article className="work-support-card" key={project.title}>
              <div className="work-support-image">
                <Image
                  src={project.image}
                  alt={`${project.title} website`}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="eyebrow-muted mt-5 mb-2">{project.category}</div>
              <h3 className="text-xl font-medium">{project.title}</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mt-3">
                {project.body}
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                {project.tags.map((tag) => (
                  <span className="work-tag" key={tag}>{tag}</span>
                ))}
              </div>
              <a
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-5 text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
              >
                {project.hrefLabel} →
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="work-final-cta">
          <div>
            <div className="eyebrow mb-3">● Build the next one</div>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-2xl">
              Your business should not have to operate around disconnected tools.
            </h2>
            <p className="text-[color:var(--color-text-secondary)] mt-4 max-w-xl">
              Bring the website, CRM, dashboards, apps, workflows, social
              systems, and AI into one platform built around the way your team
              actually works.
            </p>
          </div>
          <Link href="/contact" className="btn-primary whitespace-nowrap">
            Start the conversation →
          </Link>
        </div>
      </section>
    </>
  );
}

function ProofItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VideoCard({ id, title }: { id: string; title: string }) {
  return (
    <div>
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-[color:var(--color-border)]">
        <LazyYouTube id={id} title={title} />
      </div>
      <div className="text-xs text-[color:var(--color-text-muted)] font-mono mt-2 tracking-wider">
        {title}
      </div>
    </div>
  );
}
