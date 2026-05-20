import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How TomorrowsTech AI collects, uses, and protects your information. Plain-English privacy practices.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy · TomorrowsTech AI",
    description:
      "How TomorrowsTech AI collects, uses, and protects your information.",
    url: "https://tomorrowstechai.com/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10">
        <div className="eyebrow mb-6">● Privacy Policy</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] mb-6">
          Plain-English privacy.
        </h1>
        <p className="text-xl text-[color:var(--color-text-secondary)] leading-relaxed">
          Last updated: May 20, 2026. We keep this short, specific, and honest.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16">
        <div className="prose-blog">
          <h2>Who we are</h2>
          <p>
            TomorrowsTech AI is a brand of Tomorrowstek LLC, a Texas-registered
            limited liability company. This Privacy Policy applies to{" "}
            <strong>tomorrowstechai.com</strong> and all related pages.
          </p>

          <h2>What information we collect</h2>
          <p>
            We only collect information you actively give us, plus standard
            information your browser sends automatically.
          </p>
          <ul>
            <li>
              <strong>Contact form data</strong> — your name, email address,
              and the message you send. We use this only to respond to your
              inquiry.
            </li>
            <li>
              <strong>Chat conversations</strong> — when you use our chat
              widget, your messages are sent to Anthropic (the company behind
              Claude) to generate replies. We do not store full conversations
              long-term on our own servers. Anthropic&apos;s data handling is
              governed by their{" "}
              <a
                href="https://www.anthropic.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Newsletter sign-ups</strong> — if you subscribe, we store
              your email address so we can send you periodic field notes. You
              can unsubscribe at any time.
            </li>
            <li>
              <strong>Standard server logs</strong> — IP address, browser type,
              and pages visited. Used for security, rate limiting, and
              understanding how the site is used in aggregate.
            </li>
          </ul>

          <h2>What we don&apos;t do</h2>
          <ul>
            <li>We don&apos;t sell or rent your personal information to anyone, ever.</li>
            <li>
              We don&apos;t use your data to train AI models on your behalf.
            </li>
            <li>
              We don&apos;t use advertising or remarketing cookies. Our analytics
              setup measures aggregate traffic only.
            </li>
            <li>
              We don&apos;t send marketing emails to people who haven&apos;t
              opted in.
            </li>
          </ul>

          <h2>Third-party services we use</h2>
          <p>
            Running a modern site requires some help from specialized providers.
            Here&apos;s exactly who, and what they touch:
          </p>
          <ul>
            <li>
              <strong>Vercel</strong> — hosts the website and handles
              encrypted-in-transit (HTTPS) delivery.
            </li>
            <li>
              <strong>Resend</strong> — delivers email from our contact form
              and newsletter to you and to us.
            </li>
            <li>
              <strong>Anthropic (Claude)</strong> — powers our chat widget.
              Messages you send to the chat are processed by their API to
              generate replies.
            </li>
            <li>
              <strong>YouTube</strong> — videos embedded on our homepage are
              served by YouTube via the privacy-friendly{" "}
              <code>youtube-nocookie.com</code> domain. No tracking cookies are
              set unless you press play.
            </li>
            <li>
              <strong>Google Analytics 4</strong> — measures aggregate site
              traffic so we know which pages are useful and where visitors
              come from. We do not enable Google&apos;s advertising or
              cross-site tracking features. Analytics data is processed by
              Google under{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                their privacy policy
              </a>
              .
            </li>
          </ul>

          <h2>How long we keep your data</h2>
          <p>
            Contact form submissions and newsletter subscriptions are kept as
            long as we&apos;re in active correspondence or you&apos;re
            subscribed. Email us to request deletion at any time.
          </p>

          <h2>Your rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Ask what information we hold about you</li>
            <li>Request correction or deletion of that information</li>
            <li>Unsubscribe from any communications we send you</li>
            <li>Opt out of having your information shared (we already don&apos;t share it, but the option exists)</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{" "}
            <strong>tomorrowstechaisolutions@gmail.com</strong> or use the{" "}
            <Link href="/contact">contact form</Link>.
          </p>

          <h2>Children</h2>
          <p>
            This site is intended for businesses and adults. We do not
            knowingly collect data from anyone under 16.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this policy as the site evolves. Material changes
            will be reflected here with an updated &quot;Last updated&quot;
            date.
          </p>

          <h2>Contact us</h2>
          <p>
            Questions about this policy? Email{" "}
            <strong>tomorrowstechaisolutions@gmail.com</strong> or reach out
            via our <Link href="/contact">contact page</Link>.
          </p>

          <hr />

          <p>
            <em>
              This policy is provided in plain English to help you understand
              how we handle data. It is not legal advice. If you have specific
              legal questions about your situation, consult an attorney.
            </em>
          </p>
        </div>
      </section>
    </>
  );
}
