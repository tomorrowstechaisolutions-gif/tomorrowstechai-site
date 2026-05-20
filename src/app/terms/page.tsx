import Link from "next/link";

export const metadata = {
  title: "Terms of Service",
  description:
    "The terms under which you may use the TomorrowsTech AI website and our services.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service · TomorrowsTech AI",
    description:
      "The terms under which you may use the TomorrowsTech AI website and our services.",
    url: "https://tomorrowstechai.com/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
        <div className="eyebrow mb-6">● Terms of Service</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          Terms of Service.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          Last updated: May 20, 2026. These terms govern your use of this website.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>Who we are</h2>
          <p>
            This website (<strong>tomorrowstechai.com</strong>) is operated by
            Tomorrowstek LLC, doing business as TomorrowsTech AI. References
            to &quot;we,&quot; &quot;us,&quot; or &quot;our&quot; in these
            terms mean Tomorrowstek LLC.
          </p>

          <h2>Using this website</h2>
          <p>
            By accessing or using this website, you agree to these terms. If
            you don&apos;t agree, please don&apos;t use the site.
          </p>
          <p>You agree not to:</p>
          <ul>
            <li>Scrape, mirror, or republish content from this site</li>
            <li>Use the contact form or chat widget to send spam, threats, or unlawful content</li>
            <li>Attempt to access non-public areas of the site or its infrastructure</li>
            <li>Use the site to test, probe, or scan for vulnerabilities</li>
            <li>Interfere with the operation of the site through bots, scripts, or denial-of-service activity</li>
          </ul>

          <h2>Our content</h2>
          <p>
            All content on this site — including text, code samples,
            illustrations, blog posts, and brand marks — is owned by
            Tomorrowstek LLC unless explicitly attributed otherwise. You may
            link to our pages and quote short excerpts with attribution, but
            you may not reproduce substantial portions without our written
            permission.
          </p>

          <h2>Our services</h2>
          <p>
            This site describes consulting and development services we offer.
            Any actual engagement we enter into is governed by a separate
            written agreement (statement of work, master services agreement,
            or similar). Nothing on this site constitutes an offer, contract,
            or commitment to provide services.
          </p>

          <h2>AI chat disclaimer</h2>
          <p>
            Our chat widget is powered by Anthropic&apos;s Claude. Responses are
            generated automatically. While we&apos;ve worked to keep replies
            accurate and useful, AI-generated content can be wrong. Don&apos;t
            rely on chat responses for legal, financial, medical, or
            business-critical decisions. For anything that matters, contact us
            directly.
          </p>

          <h2>External links</h2>
          <p>
            We link to third-party sites (LinkedIn, YouTube, Held, TomorrowsTek,
            client sites, etc.). We don&apos;t control those sites and
            aren&apos;t responsible for their content or practices. Visit them
            at your own discretion.
          </p>

          <h2>No warranty</h2>
          <p>
            This website is provided &quot;as is.&quot; We make reasonable
            efforts to keep it accurate, secure, and available, but we
            can&apos;t guarantee that it will be free of errors, bugs, or
            interruptions.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Tomorrowstek LLC is not
            liable for any indirect, incidental, special, consequential, or
            punitive damages arising from your use of this website. Our
            maximum aggregate liability for any claim arising from your use of
            the site is limited to USD $100.
          </p>

          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the State of Texas, USA.
            Any disputes will be resolved in the courts located in Bell or
            Travis County, Texas.
          </p>

          <h2>Changes to these terms</h2>
          <p>
            We may update these terms as our site and services evolve.
            Material changes will be reflected here with an updated &quot;Last
            updated&quot; date. Continued use of the site after changes means
            you accept the updated terms.
          </p>

          <h2>Contact us</h2>
          <p>
            Questions about these terms? Email{" "}
            <strong>tomorrowstechaisolutions@gmail.com</strong> or use the{" "}
            <Link href="/contact">contact form</Link>.
          </p>

          <hr />

          <p>
            <em>
              These terms are provided in plain language for clarity. They are
              not a substitute for legal advice. If you have specific legal
              questions about your business situation, consult an attorney.
            </em>
          </p>
        </div>
      </section>
    </>
  );
}
