import Image from "next/image";
import { ContactForm } from "@/components/ContactForm";
import { CalEmbed } from "@/components/CalEmbed";
import { getPublicPackage } from "@/lib/catalog/public";
import { catalogPrice } from "@/lib/catalog/types";
import { resolveSourcePage } from "@/lib/blog/lead-attribution";
import "./contact-booking.css";

export const metadata = {
  title: "Contact",
  description:
    "Book a discovery call with Tomorrow’s Tech AI for a custom business operating platform, command center, workflow system, or AI solution.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · Tomorrow’s Tech AI",
    description:
      "Book a discovery call. 30 minutes, no pitch, just notes.",
    url: "https://www.tomorrowstechai.com/contact",
    type: "website",
  },
};

export default async function ContactPage({searchParams}:{searchParams:Promise<{service?:string;plan?:string;from?:string;cta?:string}>}) {
  const query=await searchParams; const pkg=await getPublicPackage(query.plan);
  // A Field Notes article link adds ?from=/blog/<slug>&cta=<position>. Only a
  // valid article path is accepted; anything else keeps the old source page.
  const src=(fallback:string)=>resolveSourcePage({from:query.from,cta:query.cta},fallback);
  const pkgSrc=src(pkg?.publicRoute||"/contact"); const svcSrc=src("/contact");
  const offer=pkg?{id:pkg.id,slug:pkg.slug,name:pkg.name,category:pkg.category,price:catalogPrice(pkg),sourcePage:pkgSrc.sourcePage,cta:pkgSrc.cta}:query.service?{id:null,slug:query.service,name:query.service.replaceAll("-"," "),category:query.service,price:"Custom quote",sourcePage:svcSrc.sourcePage,cta:svcSrc.cta}:null;
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12">
        <div className="eyebrow mb-6">● Get in touch</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          Let&apos;s compare notes.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          Whether you need a complete business operating platform, a command
          center, or one broken workflow fixed, start with the way the company
          runs today. Book a call below, or send a message and we&apos;ll get
          back to you within one business day.
        </p>
      </section>

      <section className="bk-wrap" aria-labelledby="bk-title">
        <div className="bk-panel">
          <div className="bk-side">
            <div className="bk-intro">
            <div className="bk-host">
              <Image
                src="/about/john-hockinson-portrait.png"
                alt=""
                width={56}
                height={56}
                className="bk-avatar"
              />
              <div>
                <p className="bk-host-name">John Hockinson</p>
                <p className="bk-host-role">Founder, Tomorrow&apos;s Tech AI</p>
              </div>
            </div>

            <h2 id="bk-title" className="bk-title">Book a 30-minute discovery call</h2>

            <ul className="bk-facts">
              <li><ClockIcon />30 minutes</li>
              <li><VideoIcon />Video call, link in your invite</li>
              <li><GlobeIcon />Times shown in Central Time</li>
            </ul>
            </div>

            <div className="bk-detail">
            <div className="bk-block">
              <h3 className="bk-h3">What we&apos;ll cover</h3>
              <ul className="bk-list">
                <li>How work moves through your business today: requests, scheduling, tracking, reporting</li>
                <li>Where it breaks down or eats your week</li>
                <li>Whether we&apos;re the right fit, and roughly what it would take</li>
              </ul>
            </div>

            <div className="bk-block">
              <h3 className="bk-h3">You leave with</h3>
              <p className="bk-p">
                A straight answer and practical next steps, even if the answer
                is that you don&apos;t need us.
              </p>
            </div>

            <p className="bk-alt">
              None of these times work?{" "}
              <a href="mailto:john@tomorrowstechai.com?subject=Discovery%20call">Email John</a>{" "}
              and we&apos;ll find one.
            </p>
            </div>
          </div>

          <div className="bk-main">
            <CalEmbed />
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-[color:var(--color-border)]">
        <div className="eyebrow-muted mb-3">● Or send a message</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">
          Prefer email?
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8 max-w-2xl">
          Tell us a bit about what you&apos;re building. We respond within one
          business day.
        </p>
        <ContactForm offer={offer} />
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-5">
          <DirectChannel
            label="Direct email"
            value="john@tomorrowstechai.com"
            href="mailto:john@tomorrowstechai.com"
          />
          <DirectChannel
            label="LinkedIn"
            value="John C. Hockinson"
            href="https://www.linkedin.com/in/johnhockinson/"
            external
          />
          <DirectChannel
            label="YouTube"
            value="@TomorrowsTechAISolution"
            href="https://www.youtube.com/@TomorrowsTechAISolution"
            external
          />
        </div>
      </section>
    </>
  );
}

function DirectChannel({
  label,
  value,
  href,
  external,
}: {
  label: string;
  value: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="card hover:border-[color:var(--color-cyan-deep)] block"
    >
      <div className="eyebrow-muted mb-2 !text-[#7d8ba1]">{label}</div>
      <div className="text-[color:var(--color-cyan)] text-[15px]">{value}</div>
    </a>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4.2l2.8 1.8" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.75" y="5.25" width="10.5" height="9.5" rx="2" />
      <path d="M13.25 8.6 17.25 6.5v7l-4-2.1" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M2.75 10h14.5M10 2.75c2 2.2 2.9 4.6 2.9 7.25S12 15.05 10 17.25C8 15.05 7.1 12.65 7.1 10S8 4.95 10 2.75Z" />
    </svg>
  );
}
