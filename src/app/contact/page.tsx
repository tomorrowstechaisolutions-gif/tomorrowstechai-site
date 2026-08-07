import { ContactForm } from "@/components/ContactForm";
import { CalEmbed } from "@/components/CalEmbed";

export const metadata = {
  title: "Contact",
  description:
    "Book a discovery call with Tomorrow’s Tech AI for a custom business operating platform, command center, workflow system, or AI solution.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · Tomorrow’s Tech AI",
    description:
      "Book a discovery call. 30 minutes, no pitch, just notes.",
    url: "https://tomorrowstechai.com/contact",
    type: "website",
  },
};

export default function ContactPage() {
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
          runs today. Pick a time below, or send a message and we&apos;ll get
          back to you within one business day.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-12">
        <div className="eyebrow-muted mb-3">● Book directly</div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight mb-3">
          Pick a time.
        </h2>
        <p className="text-[color:var(--color-text-secondary)] leading-relaxed mb-8 max-w-2xl">
          30 minutes. No pitch, just notes. Pick a slot that works and
          you&apos;ll get a calendar invite with a video link instantly.
        </p>
        <CalEmbed />
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
        <ContactForm />
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
      <div className="eyebrow-muted mb-2">{label}</div>
      <div className="text-[color:var(--color-cyan)] text-[15px]">{value}</div>
    </a>
  );
}
