import Link from "next/link";
import Image from "next/image";
import { LazyYouTube } from "@/components/LazyYouTube";

export const metadata = {
  title: "Work",
  description:
    "Selected work from TomorrowsTech AI — websites, apps, brands, and promotional video we've shipped. The Field House Gym, Mintline Wellness, Held, TomorrowsTek, and more.",
  alternates: { canonical: "/work" },
  openGraph: {
    title: "Work · TomorrowsTech AI",
    description:
      "Websites, apps, promotional video, and brands we've shipped. Gyms, wellness practices, productivity apps, and media businesses.",
    url: "https://tomorrowstechai.com/work",
    type: "website",
  },
};

type Video = {
  id: string;
  title: string;
};

type Project = {
  slug: string;
  title: string;
  tagline: string;
  body: string;
  image: string;
  tags: string[];
  href: string;
  hrefLabel: string;
  testimonial?: string;
  testimonialAuthor?: string;
  testimonialRole?: string;
  videos?: Video[];
  featured?: boolean;
};

const ownWork: Project[] = [
  {
    slug: "aegis-fleet-ai",
    title: "Aegis Fleet AI",
    tagline: "The all-in-one AI operating system built for EMS & medical fleets.",
    body: "Our newest product. Aegis Fleet AI gives EMS and medical fleet operators a single command interface for tracking, dispatch, PM scheduling, compliance, and oversight. AI agents handle the work behind the scenes — PM reminders, compliance expirations, vehicle status — so dispatch and field crews focus on the call instead of the paperwork. Real-time visibility into total vehicles, active units, services due, and units in repair. Built around one principle: Safety. Compliance. Protection.",
    image: "/work/aegisfleet.png",
    tags: ["AI product", "EMS & medical fleets", "Fleet command", "Compliance automation", "Just shipped"],
    href: "https://aegisfleetai.com",
    hrefLabel: "Visit Aegis Fleet AI",
    videos: [
      { id: "0ltnbI04vLY", title: "Aegis Fleet AI — Trailer" },
      { id: "rJsPQ4nar50", title: "Aegis Fleet AI — Inside the command center" },
    ],
    featured: true,
  },
  {
    slug: "tomorrowstechai",
    title: "TomorrowsTech AI",
    tagline: "The site you're reading.",
    body: "Custom-coded marketing site on Next.js + Vercel. Cyan-on-black operator aesthetic, full SEO foundation (sitemap, JSON-LD, canonical URLs), built-in blog with featured images, working contact form, and an under-one-second load time. The same stack we ship for clients.",
    image: "/work/tomorrowstechai.png",
    tags: ["Marketing site", "Next.js", "Vercel", "Resend", "SEO"],
    href: "https://tomorrowstechai.com",
    hrefLabel: "You're here",
  },
  {
    slug: "held",
    title: "Held",
    tagline: "For the one carrying it all.",
    body: "AI-powered coordination app for busy households, available on iOS with a web companion. Built around one philosophy: AI proposes, you decide. Nothing changes without approval. Calendar, tasks, shared Circle, and intelligent time-blocking to protect quiet windows.",
    image: "/work/held.png",
    tags: ["iOS app", "Web app", "AI", "Family ops"],
    href: "https://myheldapp.com",
    hrefLabel: "Visit Held",
  },
  {
    slug: "tomorrowstek",
    title: "TomorrowsTek",
    tagline: "How-to videos, reviews, drone services, and media.",
    body: "Our content and media business — automotive repair walkthroughs, town travel reviews, drone services, and giveaways. A separate brand under the same parent LLC, built around field knowledge and the kind of media most local audiences actually want.",
    image: "/work/tomorrowstek.png",
    tags: ["Media business", "Content", "Drone services"],
    href: "https://tomorrowstek.com",
    hrefLabel: "Visit TomorrowsTek",
  },
];

const clientWork: Project[] = [
  {
    slug: "field-house-gym",
    title: "The Field House Gym",
    tagline: "The best 24/7 gym in Harker Heights.",
    body: "Full brand presence for a 20-30k sq ft hardcore lifting facility in Harker Heights, Texas. We built the marketing site, the hero design, problem-solution framing, member reviews block, three-step onboarding flow, and full FAQ. We also produced the promotional video content used on the site and in ad campaigns for both locations. One brand, top to bottom.",
    image: "/work/fieldhouse.png",
    tags: ["Client build", "Fitness", "Video production", "Lead capture", "Harker Heights, TX"],
    href: "https://www.thefieldhousegym.com",
    hrefLabel: "Visit Field House",
    testimonial:
      "John did an amazing job building what I described, he really understood The Field House, my brand, and it really showed thru his work.",
    testimonialAuthor: "Christina Bills",
    testimonialRole: "Owner, The Field House Gym",
    videos: [
      { id: "MD0BQ-uaKG0", title: "The Field House Gym — Harker Heights / Killeen" },
      { id: "poCVNcen-2o", title: "The Field House Gym — Temple location" },
    ],
    featured: true,
  },
  {
    slug: "mintline-wellness",
    title: "Mintline Wellness",
    tagline: "Evidence-based wellness education for sustainable weight loss.",
    body: "Custom site for a Texas-based wellness practice serving the Belton and Temple area. A calmer, more supportive approach to weight and metabolic health — built around medical credibility, not weight-loss hype. Waitlist-driven launch.",
    image: "/work/mintline.png",
    tags: ["Client build", "Wellness", "Lead capture"],
    href: "https://mintlinewellness.com",
    hrefLabel: "Visit Mintline",
    testimonial:
      "John's attention to detail was amazing. He asked all the right questions. Our location is still in its early stages, but will be using TomorrowsTech AI again.",
    testimonialAuthor: "Dr. Marlow Griggs, MD",
    testimonialRole: "Founder, Mintline Wellness",
  },
];

export default function WorkPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● Work</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] max-w-4xl">
          Things we&apos;ve built.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed mt-6 max-w-3xl">
          Websites, apps, brands, and promotional video — for our own businesses and for clients.
          Operations-heavy and built to last, not built to demo.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="eyebrow-muted mb-3">Brands & products we ship</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-10 max-w-2xl">
          Our own work.
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          {ownWork.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="eyebrow-muted mb-3">Built for clients</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-10 max-w-2xl">
          Client builds.
        </h2>
        <div className="grid md:grid-cols-2 gap-5">
          {clientWork.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
          <div className="card border-dashed flex items-center justify-center text-center min-h-[260px]">
            <div>
              <div className="eyebrow-muted mb-3">Open slot</div>
              <h3 className="text-lg font-medium mb-2">Your project here.</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed max-w-sm">
                We&apos;re taking on a small number of website builds this quarter.{" "}
                <Link href="/contact" className="text-[color:var(--color-cyan)] hover:underline">
                  Book a discovery call →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="card card-accent text-center md:text-left md:flex md:items-center md:justify-between gap-10 p-10">
          <div>
            <div className="eyebrow mb-3">● Open for new engagements</div>
            <h3 className="text-2xl md:text-3xl font-medium tracking-tight max-w-xl">
              Want something like this for your business?
            </h3>
            <p className="text-[color:var(--color-text-secondary)] mt-3 max-w-lg">
              Custom-coded websites and apps, built to last. Book a discovery call. 30 minutes, no pitch, just notes.
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

function ProjectCard({ project }: { project: Project }) {
  const featuredClass = project.featured ? " md:col-span-2" : "";
  return (
    <div className={`card group overflow-hidden${featuredClass}`}>
      <div className="relative w-full aspect-[16/10] -mx-6 -mt-6 mb-5 overflow-hidden border-b border-[color:var(--color-border)]">
        <Image
          src={project.image}
          alt={project.title}
          fill
          sizes={
            project.featured
              ? "(max-width: 768px) 100vw, 1200px"
              : "(max-width: 768px) 100vw, 580px"
          }
          className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
        />
      </div>
      <h3 className="text-2xl font-medium mb-1">{project.title}</h3>
      <div className="eyebrow-muted mb-4">{project.tagline}</div>
      <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] mb-5">
        {project.body}
      </p>

      {project.videos && project.videos.length > 0 && (
        <div className="mb-5">
          <div className="eyebrow-muted mb-3">Promotional video we produced</div>
          <div className="grid md:grid-cols-2 gap-3">
            {project.videos.map((v) => (
              <div key={v.id}>
                <div className="relative w-full aspect-video bg-black rounded overflow-hidden border border-[color:var(--color-border)]">
                  <LazyYouTube id={v.id} title={v.title} />
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)] font-mono mt-2 tracking-wider">
                  {v.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.testimonial && (
        <blockquote className="border-l-2 border-[color:var(--color-cyan)] pl-4 mb-5">
          <p className="text-[color:var(--color-text)] italic leading-relaxed text-[15px] mb-2">
            &ldquo;{project.testimonial}&rdquo;
          </p>
          {(project.testimonialAuthor || project.testimonialRole) && (
            <footer className="text-xs font-mono tracking-wider text-[color:var(--color-text-muted)] uppercase">
              — {project.testimonialAuthor}
              {project.testimonialRole && (
                <span className="text-[color:var(--color-text-muted)]">
                  {" · "}
                  {project.testimonialRole}
                </span>
              )}
            </footer>
          )}
        </blockquote>
      )}
      <div className="flex flex-wrap gap-2 mb-5">
        {project.tags.map((t) => (
          <span
            key={t}
            className="text-xs font-mono tracking-wider text-[color:var(--color-text-muted)] border border-[color:var(--color-border)] px-2 py-0.5 rounded"
          >
            {t}
          </span>
        ))}
      </div>
      <a
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-mono uppercase tracking-widest text-[color:var(--color-cyan)] hover:underline"
      >
        {project.hrefLabel} →
      </a>
    </div>
  );
}
