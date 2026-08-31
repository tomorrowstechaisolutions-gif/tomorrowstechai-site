import Link from "next/link";
import type { Metadata } from "next";
import { ScheduleCta } from "@/components/business-launch/ScheduleCta";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { ECOMMERCE_OFFER } from "@/lib/campaign/offers";
import {
  ECOM_HOSTING,
  ECOM_PRICE,
  ECOM_PRODUCTS_INCLUDED,
} from "@/lib/campaign/ecommerce";

export const metadata: Metadata = {
  title: "Request received",
  description: "Your $999 E-Commerce Website request is in.",
  robots: { index: false, follow: false },
};

export default function EcommerceThankYouPage() {
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
              Book a 30-minute call and we&rsquo;ll scope your catalog,
              shipping and payments on the spot — and give you a real delivery
              date.
            </p>
            <ScheduleCta
              href="https://cal.com/tomorrowstechai/discovery"
              offer={ECOMMERCE_OFFER}
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
                  <h3>We scope the store</h3>
                  <p>
                    Products, categories, shipping, tax and payments — and
                    whether {ECOM_PRODUCTS_INCLUDED} entered products covers
                    your catalog or you want the add-on.
                  </p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">02</span>
                <div>
                  <h3>You send products and content</h3>
                  <p>
                    Images, descriptions, prices and options, plus your logo and
                    pages. A short online form collects it in one go.
                  </p>
                </div>
              </li>
              <li className="bl-step">
                <span className="bl-step-n">03</span>
                <div>
                  <h3>We build it and you start selling</h3>
                  <p>
                    ${ECOM_PRICE} one time, then ${ECOM_HOSTING}/month hosting
                    after the first 30 days. Three revision rounds and launch
                    support through your first real orders.
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
              offer={ECOMMERCE_OFFER}
              className="bl-link"
            >
              Call (254) 563-2130
            </ContactAction>{" "}
            or{" "}
            <ContactAction
              href="mailto:john@tomorrowstechai.com"
              method="email"
              offer={ECOMMERCE_OFFER}
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
