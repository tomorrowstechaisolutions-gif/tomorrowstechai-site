import Link from "next/link";
import type { Metadata } from "next";
import { LeadForm } from "@/components/business-launch/LeadForm";
import { CampaignTracking } from "@/components/business-launch/CampaignTracking";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { ECOMMERCE_OFFER } from "@/lib/campaign/offers";
import {
  ECOM_FAQ,
  ECOM_FOR_YOU,
  ECOM_HIGHLIGHTS,
  ECOM_HOSTING,
  ECOM_HOSTING_DISCLOSURE,
  ECOM_INCLUDED,
  ECOM_NOT_FOR_YOU,
  ECOM_NOT_INCLUDED,
  ECOM_PRICE,
  ECOM_PRODUCTS_INCLUDED,
  ECOM_PRODUCTS_SUPPORTED,
  ECOM_STEPS,
} from "@/lib/campaign/ecommerce";

export const metadata: Metadata = {
  title: "Launch Your Online Store — $999 E-Commerce Website",
  description:
    "A custom online store with cart, secure checkout, payments, shipping and tax configured — and your first 20 products entered for you. $999 one time, plus $29/month hosting.",
  alternates: { canonical: "/ecommerce-website" },
  openGraph: {
    title: "Launch Your Online Store · Tomorrow’s Tech AI",
    description:
      "Your store. Our technology. Your success. A custom e-commerce website for $999 one time, plus $29/month hosting.",
    url: "https://tomorrowstechai.com/ecommerce-website",
    type: "website",
  },
};

export default function EcommerceWebsitePage() {
  return (
    <div className="bl-page">
      <CampaignTracking offer={ECOMMERCE_OFFER} />

      <header className="bl-topbar">
        <Link href="/" className="bl-brand">
          Tomorrow&rsquo;s Tech AI
        </Link>
        <a href="#get-started" className="bl-topbar-cta">
          Get Started
        </a>
      </header>

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <section className="bl-hero">
        <div className="bl-wrap">
          <p className="bl-eyebrow">
            ● Launch your online store and start selling
          </p>
          <h1 className="bl-h1">
            Your Online Store for{" "}
            <span className="bl-price-inline">${ECOM_PRICE}</span>
          </h1>
          <p className="bl-sub">
            A powerful online store built to sell: catalog, cart, secure
            checkout, payments, shipping and tax — with your first{" "}
            {ECOM_PRODUCTS_INCLUDED} products entered for you.
          </p>

          <div className="bl-pricebox">
            <div className="bl-pricebox-main">
              <span className="bl-pricebox-amount">${ECOM_PRICE}</span>
              <span className="bl-pricebox-unit">one-time build</span>
            </div>
            <div className="bl-pricebox-note">
              Plus hosting at <strong>${ECOM_HOSTING}/month</strong>, free for
              the first 30 days. Cancel any time.
            </div>
          </div>

          <div className="bl-cta-row">
            <a href="#get-started" className="bl-cta">
              Get My ${ECOM_PRICE} Store
            </a>
            <a href="#included" className="bl-cta-secondary">
              See What&rsquo;s Included
            </a>
          </div>

          <ul className="bl-trust">
            <li>Secure checkout</li>
            <li>Stripe &amp; PayPal</li>
            <li>You own the store</li>
          </ul>
        </div>
      </section>

      {/* ── 2. The number people misread ────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap bl-wrap-narrow">
          <div className="bl-guarantee">
            <h2 className="bl-h2 tight">
              {ECOM_PRODUCTS_INCLUDED} products entered — {ECOM_PRODUCTS_SUPPORTED}{" "}
              supported
            </h2>
            <p>
              These are two different numbers and it is worth being clear about
              them before you buy. Your store is built to carry{" "}
              {ECOM_PRODUCTS_SUPPORTED} products. The{" "}
              {ECOM_PRODUCTS_INCLUDED} refers to how many we enter for you as
              part of the ${ECOM_PRICE} — images, descriptions, prices and
              options, done properly.
            </p>
            <p>
              You can add the rest yourself whenever you like, or we can quote
              entering them. Either way it is not a limit on the store, and we
              would rather you knew that now than found out later.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Highlights ───────────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">Built to sell, not just to browse</h2>
          <div className="bl-upgrades">
            {ECOM_HIGHLIGHTS.map((h) => (
              <div key={h.title} className="bl-upgrade">
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. What's included ──────────────────────────────────────────── */}
      <section id="included" className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Everything in the ${ECOM_PRICE} package</h2>
          <p className="bl-lede">
            Twenty things, all built, configured and tested with real test
            orders before you ever see it.
          </p>
          <ul className="bl-included">
            {ECOM_INCLUDED.map((item) => (
              <li key={item.title} className="bl-included-item">
                <span className="bl-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="bl-disclosure">{ECOM_HOSTING_DISCLOSURE}</p>
        </div>
      </section>

      {/* ── 5. What it looks like ───────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">The storefront, and the orders behind it</h2>
          <p className="bl-lede">
            Customers browse, add to cart and check out themselves. You get the
            order, the address and the money — without sending an invoice.
          </p>

          <div className="bl-showcase">
            <figure className="bl-phone-wrap">
              <div
                className="bl-phone"
                role="img"
                aria-label="Example of a mobile-optimized online store with product grid and cart"
              >
                <div className="bl-phone-screen">
                  <div className="bl-mock-nav">
                    <span className="bl-mock-logo" />
                    <span className="bl-mock-burger" />
                  </div>
                  <div className="bl-mock-hero">
                    <div className="bl-mock-line w-70" />
                    <div className="bl-mock-line w-90" />
                    <div className="bl-mock-btn">Shop now</div>
                  </div>
                  <div className="bl-mock-cards">
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                  </div>
                  <div className="bl-mock-cards">
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                  </div>
                  <div className="bl-mock-form">
                    <div className="bl-mock-input" />
                    <div className="bl-mock-btn sm">Checkout</div>
                  </div>
                </div>
              </div>
              <figcaption>Your store — built mobile-first.</figcaption>
            </figure>

            <figure className="bl-dash-wrap">
              <div
                className="bl-dash"
                role="img"
                aria-label="Example of incoming orders and order notifications"
              >
                <div className="bl-dash-head">
                  <span className="bl-dash-dot" />
                  <span>Your orders</span>
                </div>
                <div className="bl-dash-kpis">
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">New</span>
                    <span className="bl-dash-kpi-value">6</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">Shipped</span>
                    <span className="bl-dash-kpi-value">14</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">This week</span>
                    <span className="bl-dash-kpi-value">20</span>
                  </div>
                </div>
                <div className="bl-dash-rows">
                  {[
                    ["Order #1041", "2 items", "New"],
                    ["Order #1040", "1 item", "New"],
                    ["Order #1039", "4 items", "Shipped"],
                    ["Order #1038", "1 item", "Shipped"],
                  ].map(([name, note, status]) => (
                    <div key={name} className="bl-dash-row">
                      <span className="bl-dash-name">{name}</span>
                      <span className="bl-dash-note">{note}</span>
                      <span className={`bl-dash-tag t-${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <figcaption>Orders arrive with everything you need to ship.</figcaption>
            </figure>
          </div>

          <p className="bl-illustrative">
            Illustrative example. Your store is designed around your products,
            your brand and how you actually ship.
          </p>
        </div>
      </section>

      {/* ── 6. How it works ─────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">How it works</h2>
          <ol className="bl-steps">
            {ECOM_STEPS.map((s) => (
              <li key={s.n} className="bl-step">
                <span className="bl-step-n">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 7. Who this is for ──────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">Who this is for</h2>
          <div className="bl-two-col">
            <div className="bl-col">
              <h3 className="bl-col-head good">This is for you if</h3>
              <ul className="bl-bullets">
                {ECOM_FOR_YOU.map((t) => (
                  <li key={t}>
                    <span className="bl-check sm" aria-hidden="true">
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bl-col">
              <h3 className="bl-col-head bad">It&rsquo;s not for you if</h3>
              <ul className="bl-bullets">
                {ECOM_NOT_FOR_YOU.map((t) => (
                  <li key={t}>
                    <span className="bl-x sm" aria-hidden="true">
                      ×
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. What's NOT included ──────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">What&rsquo;s not included</h2>
          <p className="bl-lede">
            We&rsquo;d rather tell you now than after you&rsquo;ve paid. These
            are quoted separately and never assumed:
          </p>
          <ul className="bl-not">
            {ECOM_NOT_INCLUDED.map((t) => (
              <li key={t}>
                <span className="bl-x" aria-hidden="true">
                  ×
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="bl-disclosure">
            Not selling products? The $149, $399 and $699 website packages are
            on our{" "}
            <Link href="/services" className="bl-link">
              services page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── 9. FAQ ──────────────────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Questions</h2>
          <div className="bl-faq">
            {ECOM_FAQ.map((item) => (
              <details key={item.q} className="bl-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Guarantee ───────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap bl-wrap-narrow">
          <div className="bl-guarantee">
            <h2 className="bl-h2 tight">Our guarantee</h2>
            <p>
              If we scope it together and a store isn&rsquo;t the right answer
              for your business yet, we say so before you pay anything — even
              when that means pointing you at a cheaper package.
            </p>
            <p>
              You own your domain, your store, your product data and your
              customer list. Your payment processor is your account, so your
              money never passes through us. Stop the ${ECOM_HOSTING}/month
              whenever you like and we&rsquo;ll hand over the files and help you
              move.
            </p>
          </div>
        </div>
      </section>

      {/* ── 11. Final CTA + form ────────────────────────────────────────── */}
      <section id="get-started" className="bl-section bl-final">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Get My ${ECOM_PRICE} Store</h2>
          <p className="bl-lede">
            Two minutes. No payment now — tell us roughly how many products you
            have and we&rsquo;ll scope it with you first.
          </p>
          <LeadForm
            offer={ECOMMERCE_OFFER}
            hostingDisclosure={ECOM_HOSTING_DISCLOSURE}
          />
          <p className="bl-callnote">
            Would rather talk first?{" "}
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
