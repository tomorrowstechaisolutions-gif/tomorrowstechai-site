import Link from "next/link";
import type { Metadata } from "next";
import { ScheduleCta } from "@/components/business-launch/ScheduleCta";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { HOSTING_FROM, OFFER_PRICE } from "@/lib/campaign/config";

export const metadata: Metadata = {
  title: "Request received",
  description: "Your $399 Business Launch request is in.",
  // Never index a confirmation page — it would rank for the campaign and
  // hand people the thank-you instead of the offer.
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
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
            We&rsquo;ll review your business and contact you shortly. A
            confirmation is on its way to your inbox — check spam if it
            hasn&rsquo;t landed in a few minutes.
          </p>

          <div className="bl-thanks-next">
            <h2 className="bl-h3">Want to skip the wait?</h2>
            <p>
              Book a 30-minute call now and we&rsquo;ll plan your ${OFFER_PRICE}{" "}
              build on the spot.
            </p>
            <ScheduleCta
              href="https://cal.com/tomorrowstechai/discovery"
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
                  <h3>We review what you sent</h3>
                  <p>Your trade, what you need and how fast you want to move.</p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">02</span>
                <div>
                  <h3>We reach out</h3>
                  <p>
                    Email or a call, whichever you prefer — usually within one
                    business day.
                  </p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">03</span>
                <div>
                  <h3>We confirm the plan and start</h3>
                  <p>
                    ${OFFER_PRICE} one-time, then hosting from{" "}
                    ${HOSTING_FROM}/month once you&rsquo;re live. Nothing is
                    charged before you approve the plan.
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
              className="bl-link"
            >
              Call (254) 563-2130
            </ContactAction>{" "}
            or{" "}
            <ContactAction
              href="mailto:john@tomorrowstechai.com"
              method="email"
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
          © {new Date().getFullYear()}{" "}
          Tomorrow&rsquo;s Tech AI · Tomorrowstek LLC
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
