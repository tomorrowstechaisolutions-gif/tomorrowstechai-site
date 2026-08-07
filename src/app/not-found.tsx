import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
  description:
    "The page you're looking for doesn't exist on the Tomorrow’s Tech AI command center.",
  robots: {
    index: false,
    follow: false,
  },
};

const helpfulLinks = [
  {
    href: "/",
    title: "Home",
    body: "Start at the top — what we build, who we work with, latest field notes.",
  },
  {
    href: "/services",
    title: "Services",
    body: "Business operating platforms, command centers, workflow automation, and custom AI.",
  },
  {
    href: "/work",
    title: "Work",
    body: "Real client builds with embedded video and testimonials.",
  },
  {
    href: "/blog",
    title: "Blog",
    body: "Field notes on operations, AI, and the systems we wish existed.",
  },
  {
    href: "/faq",
    title: "FAQ",
    body: "Common questions about timelines, pricing, and how we work.",
  },
  {
    href: "/contact",
    title: "Contact",
    body: "30-minute discovery call. No pitch, just notes.",
  },
];

export default function NotFound() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="font-mono text-xs tracking-widest text-[color:var(--color-text-muted)] uppercase mb-6">
          STATUS · 404 · ROUTE NOT FOUND · CONNECTION OPEN
        </div>
        <h1 className="text-5xl md:text-7xl font-medium tracking-tight leading-[1.05] mb-6">
          <span className="text-[color:var(--color-cyan)]">404.</span> Page not found.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          This route doesn&apos;t exist on our command center. Could be a typo,
          a stale link, or a page we&apos;ve since moved. Pick a direction
          below — the rest of the system is still online.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="eyebrow-muted mb-3">Try one of these</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-10 max-w-2xl">
          Useful destinations.
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          {helpfulLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card hover:border-[color:var(--color-cyan-deep)] block group"
            >
              <h3 className="text-lg font-medium mb-2 group-hover:text-[color:var(--color-cyan)] transition-colors">
                {link.title}
              </h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
                {link.body}
              </p>
              <div className="text-xs font-mono uppercase tracking-widest text-[color:var(--color-cyan)] mt-4">
                Go →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="card card-accent p-10 text-center md:text-left">
          <div className="eyebrow mb-3">● Still stuck?</div>
          <h3 className="text-2xl font-medium tracking-tight mb-3">
            If you got here from a broken link, let us know.
          </h3>
          <p className="text-[color:var(--color-text-secondary)] mb-6 max-w-xl mx-auto md:mx-0">
            Send a quick note via the contact form and we&apos;ll get it fixed.
            Or hit our AI assistant in the corner — it might know where you
            were trying to go.
          </p>
          <Link href="/contact" className="btn-primary">
            Send a note →
          </Link>
        </div>
      </section>
    </>
  );
}
