import Link from "next/link";
import type { Metadata } from "next";
import { ScheduleCta } from "@/components/business-launch/ScheduleCta";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { PROFESSIONAL_OFFER } from "@/lib/campaign/offers";
import { PRO_HOSTING, PRO_PRICE } from "@/lib/campaign/professional";

export const metadata: Metadata = {
  title: "Request received",
  description: "Your $699 Professional Website request is in.",
  robots: { index: false, follow: false },
};

export default function ProfessionalThankYouPage() {
  return (
    <div className="bl-page">
      <header className="bl-topbar">
        <Link href="/" className="bl-brand">
          Tomorrow&rsquo;s Tech AI
        </Link>
      </header>

      <section className="bl-section bl-thanks">
        <div className="bl-wrap bl-wrap-narrow">
          <div className="bl-thanks-mark" aria-hidden="true">
            ✓
          </div>
          <h1 className="bl-h1 sm">Your request is in.</h1>
          <p className="bl-sub">
            We&rsquo;ll look at what you sent and contact you shortly. A
            confirmation is on its way to your inbox — check spam if it
            hasn&rsquo;t landed in a few minutes.
          </p>

          <div className="bl-thanks-next">
            <h2 className="bl-h3">Want to skip the wait?</h2>
            <p>
              Book a 30-minute call and we&rsquo;ll scope your ten pages on the
              spot — and give you a real delivery date.
            </p>
            <ScheduleCta
              href="https://cal.com/tomorrowstechai/discovery"
              offer={PROFESSIONAL_OFFER}
              className="bl-cta"
            >
              Book my 30-minute call
            </ScheduleCta>
            <p className="bl-fineprint">
              Optional. We&rsquo;ll reach out either way, usually within one
              business day.
            </p>
          </div>

          <div className="bl-thanks-meta">
            <h2 className="bl-h3">What happens next</h2>
            <ol className="bl-steps compact">
              <li className="bl-step">
                <span className="bl-step-n">01</span>
                <div>
                  <h3>We scope the pages together</h3>
                  <p>
                    Your services, your customers and what the site has to make
                    happen. This is where the delivery date comes from.
                  </p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">02</span>
                <div>
                  <h3>You send your content</h3>
                  <p>
                    A short online form collects your logo, photos, services and
                    hours in one go — no email tennis.
                  </p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">03</span>
                <div>
                  <h3>We design, build and hand it over</h3>
                  <p>
                    ${PRO_PRICE} one time, then ${PRO_HOSTING}/month hosting
                    after the first 30 days. Three revision rounds and 30 days
                    of launch support are part of it.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <p className="bl-callnote">
            Need us sooner?{" "}
            <ContactAction
              href="tel:+12545632130"
              method="phone"
              offer={PROFESSIONAL_OFFER}
              className="bl-link"
            >
              Call (254) 563-2130
            </ContactAction>{" "}
            or{" "}
            <ContactAction
              href="mailto:john@tomorrowstechai.com"
              method="email"
              offer={PROFESSIONAL_OFFER}
              className="bl-link"
            >
              email John
            </ContactAction>
            .
          </p>
        </div>
      </section>

      <footer className="bl-footer">
        <p>
          © {new Date().getFullYear()} Tomorrow&rsquo;s Tech AI · Tomorrowstek
          LLC
        </p>
        <p className="bl-footer-links">
          <Link href="/privacy">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Terms</Link>
          <span aria-hidden="true">·</span>
          <Link href="/">Main site</Link>
        </p>
      </footer>
    </div>
  );
}
