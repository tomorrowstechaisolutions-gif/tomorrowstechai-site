import Image from "next/image";
import Link from "next/link";
import { LazyYouTube } from "@/components/LazyYouTube";

export const metadata = {
  title: "Work",
  description:
    "Selected business operating platforms, command centers, storefronts, contractor automation, websites, and client systems built by Tomorrow’s Tech AI.",
  alternates: { canonical: "/work" },
  openGraph: {
    title: "Work · Tomorrow’s Tech AI",
    description:
      "Storefronts, business operating platforms, command centers, Job Catcher, and client systems built around the way real companies operate.",
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

// The four builds that lead the portfolio, in the order they should be read.
// Each one carries whatever proof it actually has — a client quote where a
// client gave one, a stack list where the build itself is the argument.
type TopProject = {
  title: string;
  category: string;
  image: string;
  alt: string;
  body: string;
  points?: string[];
  quote?: string;
  quoteBy?: string;
  href: string;
  hrefLabel: string;
};

const topWork: TopProject[] = [
  {
    title: "Atomic 29 Mint",
    category: "Client · Storefront · Brand",
    image: "/work/atomic29.webp",
    alt: "Atomic 29 Mint hand-cast copper storefront",
    body:
      "A dark-forge storefront for a hand-cast copper mint. Bars, vials and numbered collector relics, each poured and finished by hand — so the store is built around limited pours and batch numbering rather than open stock.",
    points: ["Next.js storefront", "Limited-run inventory", "Stripe checkout", "Brand and art direction"],
    href: "https://atomic29mint-98mvfk4tw-personal-team-4917.vercel.app/",
    hrefLabel: "View Atomic 29 Mint",
  },
  {
    title: "TomorrowsTek",
    category: "Studio brand · Membership · Support",
    image: "/work/tomorrowstek.webp",
    alt: "TomorrowsTek private Porsche technical garage website",
    body:
      "A private Porsche technical garage: diagnostic help, DIY repair guidance, written guides, a members’ area, a shop, and a YouTube channel feeding all of it. Gated content, memberships and commerce running on one platform.",
    points: ["Membership access", "Gated guide library", "Commerce", "Video content system"],
    href: "https://tomorrowstek.com",
    hrefLabel: "Visit TomorrowsTek",
  },
  {
    title: "Mintline Wellness",
    category: "Client · Wellness · Website",
    image: "/work/mintline.webp",
    alt: "Mintline Wellness website",
    body:
      "A calm, medically credible presence for a Texas wellness practice — built around evidence-informed education, a member academy, community, and a focused path into membership.",
    quote:
      "John's attention to detail was amazing. He asked all the right questions.",
    quoteBy: "— Dr. Marlow Griggs, MD, Founder",
    href: "https://mintlinewellness.com",
    hrefLabel: "Visit Mintline Wellness",
  },
  {
    title: "Proudly Texan",
    category: "Studio brand · Storefront · Admin",
    image: "/work/proudlytexan.webp",
    alt: "Proudly Texan apparel storefront",
    body:
      "A Texas apparel brand built end to end: custom storefront, a private admin center for orders, products and customers, print-on-demand fulfillment, and a checkout pipeline designed so a paid order is never lost.",
    points: ["Supabase data layer", "Stripe checkout", "Printful fulfillment", "Admin order pipeline"],
    href: "https://proudlytexan.com",
    hrefLabel: "Visit Proudly Texan",
  },
];

const supportingWork = [
  {
    title: "Pool Business AI",
    category: "Studio product · Vertical platform",
    body: "The operating platform behind the pool vertical: website, office command center, technician workflow, customer portal and store, all working from the same records under one company’s brand.",
    image: "/work/poolbusinessai.webp",
    href: "https://poolbusinessai.com",
    hrefLabel: "See the platform",
    tags: ["Command center", "Field app", "Customer portal", "Store"],
  },
  {
    title: "Clearwater Pool Service",
    // Labelled as an industry build rather than a client engagement — it is a
    // reference site for the pool-service vertical, not work commissioned by a
    // customer, and saying so keeps the portfolio honest.
    category: "Industry build · Pool service",
    body: "The customer-facing half of that platform, shown as a working company: weekly photo reporting, water-chemistry records, before-and-after documentation, service-area checking, tiered plans and a customer portal.",
    image: "/work/clearwater.webp",
    href: "https://clearwater-pool-service.vercel.app/",
    hrefLabel: "View the build",
    tags: ["Website", "Service reporting", "Customer portal", "Lead capture"],
  },
  {
    title: "AEGIS Fleet AI",
    category: "Studio product · EMS & medical fleets",
    body: "Fleet command intelligence built for EMS and medical fleets — every vehicle, repair, maintenance schedule, compliance document and driver on one screen, so nothing expires and the service stays audit-ready.",
    image: "/work/aegisfleet.webp",
    href: "https://aegisfleetai.com",
    hrefLabel: "Visit AEGIS Fleet AI",
    tags: ["Dashboards", "Compliance", "Dispatch readiness", "AI agents"],
  },
  {
    title: "PurrFrequency",
    category: "Client · 3D web · Commerce",
    body: "An immersive relaxation platform built around a founder’s own recordings: long-form 4K purr worlds, a sleep timer, an audio player that keeps running, a shop, and a brand with real warmth to it.",
    image: "/work/purrfrequency.webp",
    href: "https://purrfrequency.com",
    hrefLabel: "Visit PurrFrequency",
    tags: ["3D & motion", "Hi-fi audio", "E-commerce", "Brand"],
  },
  {
    title: "Held",
    category: "Product studio",
    body: "An AI-assisted coordination product for busy households, built around shared calendars, tasks, time-blocking, and a deliberate human-approval model.",
    image: "/work/held.webp",
    href: "https://myheldapp.com",
    hrefLabel: "Visit Held",
    tags: ["iOS", "Web app", "AI", "Workflow design"],
  },
  {
    title: "Tomorrow’s Tech AI",
    category: "Company platform",
    body: "A custom Next.js marketing system with lead capture, field notes, downloadable resources, an AI assistant, SEO infrastructure, and connected inquiry workflows.",
    image: "/work/tomorrowstechai.webp",
    href: "https://tomorrowstechai.com",
    hrefLabel: "You’re here",
    tags: ["Next.js", "Vercel", "Lead systems", "AI assistant"],
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
          Here is the work that best represents where Tomorrow’s Tech AI is going.
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

      {/* ══ Highlighted build ═══════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Highlighted build</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl mb-9">
          When the story is the storefront.
        </h2>

        <article className="work-hero-feature">
          <div className="work-hero-feature-media">
            <Image
              src="/work/darktides.webp"
              alt="Dark Tides Supply Co Blackbeard legend page"
              fill
              priority
              sizes="(max-width: 1152px) 100vw, 1100px"
              className="object-cover object-top"
            />
          </div>
          <div className="work-hero-feature-body">
            <div>
              <div className="eyebrow mb-4">● Studio brand · Editorial commerce</div>
              <h3 className="text-3xl md:text-4xl font-medium tracking-tight">
                Dark Tides Supply Co
              </h3>
              <p className="text-lg text-[color:var(--color-text-secondary)] leading-relaxed mt-5">
                A pirate-history brand where the reading is the reason people
                buy. Long-form legend pages, a digital vault, maps and books sit
                beside a print-on-demand apparel line—one codebase running the
                editorial experience, the catalogue and the checkout, with
                ambient audio and motion carrying the atmosphere.
              </p>
              <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
                It is the clearest example of what the studio does best: content,
                brand and commerce built as a single system instead of a
                storefront with a blog bolted onto it.
              </p>
              <a
                href="https://darktidessupply.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-7 text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
              >
                Visit Dark Tides Supply →
              </a>
            </div>
            <div>
              <div className="eyebrow-muted mb-4">What it runs on</div>
              <div className="work-stack-points work-stack-points-single">
                <span>Next.js on Vercel</span>
                <span>Long-form editorial system</span>
                <span>Digital vault downloads</span>
                <span>Print-on-demand fulfillment</span>
                <span>Stripe checkout</span>
                <span>Ambient audio and motion</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* ══ Top four ════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Leading work</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl mb-4">
          Four builds that show the range.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed max-w-2xl mb-10">
          A collector’s mint, a members-only technical garage, a wellness
          practice, and an apparel brand with its own admin center. Different
          industries, the same approach underneath.
        </p>

        <div className="work-top-grid">
          {topWork.map((project) => (
            <article className="work-top-card" key={project.title}>
              <div className="work-top-media">
                <Image
                  src={project.image}
                  alt={project.alt}
                  fill
                  sizes="(max-width: 780px) 100vw, 50vw"
                  className="object-cover object-top"
                />
              </div>
              <div className="work-top-body">
                <div className="eyebrow-muted mb-2">{project.category}</div>
                <h3 className="text-2xl font-medium tracking-tight">{project.title}</h3>
                <p className="text-[color:var(--color-text-secondary)] leading-relaxed mt-4">
                  {project.body}
                </p>

                {project.quote && (
                  <blockquote className="work-quote">
                    {project.quote}
                    <footer>{project.quoteBy}</footer>
                  </blockquote>
                )}

                {project.points && (
                  <div className="work-stack-points">
                    {project.points.map((point) => (
                      <span key={point}>{point}</span>
                    ))}
                  </div>
                )}

                <div className="work-top-link">
                  <a
                    href={project.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
                  >
                    {project.hrefLabel} →
                  </a>
                </div>
              </div>
            </article>
          ))}
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
              A managed missed-call response service built for contractors. We
              connect the business line, write responses around the company,
              and help keep the customer engaged until the contractor can take
              over.
            </p>
            <div className="job-work-points">
              <span>Connected business line</span>
              <span>Custom response writing</span>
              <span>Lead alerts and follow-up</span>
              <span>$350/month managed</span>
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
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="eyebrow-muted mb-3">Products, platforms & brands</div>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight max-w-3xl mb-4">
          The rest of the shelf.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed max-w-2xl mb-10">
          Vertical platforms, separate products, client sites and industry
          builds that demonstrate product thinking, technical range, content
          systems, and the ability to build well beyond a standard marketing
          site.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {supportingWork.map((project) => (
            <article className="work-support-card" key={project.title}>
              <div className="work-support-image">
                <Image
                  src={project.image}
                  alt={`${project.title} website`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover object-top"
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
