import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact",
  description:
    "Book a discovery call with TomorrowsTech AI. AI command centers, Smartsheet workflows, and custom AI for construction and field ops.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact · TomorrowsTech AI",
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
          If your team is running operations through Smartsheet, dealing with
          field crews, contractors, fleet, and compliance — that&apos;s exactly
          where we work. Tell us a bit about what you&apos;re building and
          we&apos;ll be in touch within one business day.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
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
          />
          <DirectChannel
            label="YouTube"
            value="@tomorrowstek"
            href="https://www.youtube.com/@tomorrowstek"
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
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a href={href} className="card hover:border-[color:var(--color-cyan-deep)] block">
      <div className="eyebrow-muted mb-2">{label}</div>
      <div className="text-[color:var(--color-cyan)] text-[15px]">{value}</div>
    </a>
  );
}
