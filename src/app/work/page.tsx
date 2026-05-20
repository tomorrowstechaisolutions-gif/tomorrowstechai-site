import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Work",
  description:
    "Selected work from TomorrowsTech AI — websites, apps, and brands we've shipped. Mintline Wellness, Held, TomorrowsTek, and more.",
  alternates: { canonical: "/work" },
  openGraph: {
    title: "Work · TomorrowsTech AI",
    description:
      "Websites, apps, and brands we've shipped. Wellness practices, productivity apps, and media businesses.",
    url: "https://tomorrowstechai.com/work",
    type: "website",
  },
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
};

const ownWork: Project[] = [
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
    slug: "mintline-wellness",
    title: "Mintline Wellness",
    tagline: "Evidence-based wellness education for sustainable weight loss.",
    body: "Custom site for a Texas-based wellness practice serving the Belton and Temple area. A calmer, more supportive approach to weight and metabolic health — built around medical credibility, not weight-loss hype. Waitlist-driven launch.",
    image: "/work/mintline.png",
    tags: ["Client build", "Wellness", "Lead capture"],
    href: "https://mintlinewellness.com",
    hrefLabel: "Visit Mintline",
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
          Websites, apps, and brands we ship — for our own businesses and for clients.
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
  return (
    <div className="card group overflow-hidden">
      <div className="relative w-full aspect-[16/10] -mx-6 -mt-6 mb-5 overflow-hidden border-b border-[color:var(--color-border)]">
        <Image
          src={project.image}
          alt={project.title}
          fill
          sizes="(max-width: 768px) 100vw, 580px"
          className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
        />
      </div>
      <h3 className="text-2xl font-medium mb-1">{project.title}</h3>
      <div className="eyebrow-muted mb-4">{project.tagline}</div>
      <p className="text-[color:var(--color-text-secondary)] leading-relaxed text-[15px] mb-5">
        {project.body}
      </p>
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
