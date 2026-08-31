import Link from "next/link";
import type { Metadata } from "next";
import { LeadForm } from "@/components/business-launch/LeadForm";
import { CampaignTracking } from "@/components/business-launch/CampaignTracking";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { STARTER_OFFER } from "@/lib/campaign/offers";
import {
  STARTER_FAQ,
  STARTER_FOR_YOU,
  STARTER_HOSTING,
  STARTER_HOSTING_DISCLOSURE,
  STARTER_INCLUDED,
  STARTER_NOT_FOR_YOU,
  STARTER_NOT_INCLUDED,
  STARTER_PRICE,
  STARTER_STEPS,
  STARTER_TURNAROUND_DAYS,
  STARTER_YOU_PROVIDE,
} from "@/lib/campaign/starter";

export const metadata: Metadata = {
  title: "Get Your Business Online for $149",
  description:
    "A professional 3-page website — home, services and contact — live in 2–3 business days. $149 one time, plus $29/month hosting.",
  alternates: { canonical: "/starter-website" },
  openGraph: {
    title: "Get Your Business Online for $149 · Tomorrow’s Tech AI",
    description:
      "Fast and affordable. A professional 3-page website live in 2–3 business days. $149 one time, plus $29/month hosting.",
    url: "https://tomorrowstechai.com/starter-website",
    type: "website",
  },
};

export default function StarterWebsitePage() {
  return (
    <div className="bl-page">
      <CampaignTracking offer={STARTER_OFFER} />

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
          <p className="bl-eyebrow">● Fast &amp; affordable. One time price.</p>
          <h1 className="bl-h1">
            Get Your Business Online for{" "}
            <span className="bl-price-inline">${STARTER_PRICE}</span>
          </h1>
          <p className="bl-sub">
            A professional three-page website — home, services and contact —
            built on a proven layout and live in {STARTER_TURNAROUND_DAYS}{" "}
            business days.
          </p>

          <div className="bl-pricebox">
            <div className="bl-pricebox-main">
              <span className="bl-pricebox-amount">${STARTER_PRICE}</span>
              <span className="bl-pricebox-unit">one-time build</span>
            </div>
            <div className="bl-pricebox-note">
              Plus hosting at <strong>${STARTER_HOSTING}/month</strong>, free
              for the first 30 days. Required, because the site has to live
              somewhere. Cancel any time.
            </div>
          </div>

          <div className="bl-cta-row">
            <a href="#get-started" className="bl-cta">
              Get My ${STARTER_PRICE} Website
            </a>
            <a href="#included" className="bl-cta-secondary">
              See What&rsquo;s Included
            </a>
          </div>

          <ul className="bl-trust">
            <li>Live in {STARTER_TURNAROUND_DAYS} business days</li>
            <li>You own the site</li>
            <li>No long contract</li>
          </ul>
        </div>
      </section>

      {/* ── 2. What's included ──────────────────────────────────────────── */}
      <section id="included" className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Everything in the ${STARTER_PRICE} package</h2>
          <p className="bl-lede">
            Nine things, all of them done before you go live. Small on purpose,
            and finished properly.
          </p>
          <ul className="bl-included">
            {STARTER_INCLUDED.map((item) => (
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
          <p className="bl-disclosure">{STARTER_HOSTING_DISCLOSURE}</p>
        </div>
      </section>

      {/* ── 3. Example website ──────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">What three pages actually looks like</h2>
          <p className="bl-lede">
            Home tells them who you are, services tells them what you do, and
            contact makes it easy to reach you. For most local businesses that
            is the whole job.
          </p>

          <div className="bl-showcase">
            <figure className="bl-phone-wrap">
              <div
                className="bl-phone"
                role="img"
                aria-label="Example of a mobile-optimized three-page website built in the Starter package"
              >
                <div className="bl-phone-screen">
                  <div className="bl-mock-nav">
                    <span className="bl-mock-logo" />
                    <span className="bl-mock-burger" />
                  </div>
                  <div className="bl-mock-hero">
                    <div className="bl-mock-line w-70" />
                    <div className="bl-mock-line w-90" />
                    <div className="bl-mock-line w-50 dim" />
                    <div className="bl-mock-btn">Get a free quote</div>
                  </div>
                  <div className="bl-mock-cards">
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                    <div className="bl-mock-card" />
                  </div>
                  <div className="bl-mock-hero">
                    <div className="bl-mock-line w-50 dim" />
                    <div className="bl-mock-line w-90 dim" />
                    <div className="bl-mock-line w-70 dim" />
                  </div>
                  <div className="bl-mock-form">
                    <div className="bl-mock-input" />
                    <div className="bl-mock-input" />
                    <div className="bl-mock-btn sm">Send</div>
                  </div>
                </div>
              </div>
              <figcaption>Your website — built mobile-first.</figcaption>
            </figure>
          </div>

          <p className="bl-illustrative">
            Illustrative example. Your build uses your logo, your photos, your
            services and your words.
          </p>
        </div>
      </section>

      {/* ── 4. How it works ─────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">How it works</h2>
          <ol className="bl-steps">
            {STARTER_STEPS.map((s) => (
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

      {/* ── 5. What you provide ─────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">What we need from you</h2>
          <p className="bl-lede">
            {STARTER_TURNAROUND_DAYS} business days is achievable because the
            build starts with everything in hand. Almost every slow website is a
            website waiting on its owner, so here is the whole list up front.
          </p>
          <ul className="bl-included">
            {STARTER_YOU_PROVIDE.map((item) => (
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
          <p className="bl-disclosure">
            Once you&rsquo;re signed up we send a short online form that
            collects all of it in one go — no email tennis.
          </p>
        </div>
      </section>

      {/* ── 6. Who this is for ──────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Who this is for</h2>
          <div className="bl-two-col">
            <div className="bl-col">
              <h3 className="bl-col-head good">This is for you if</h3>
              <ul className="bl-bullets">
                {STARTER_FOR_YOU.map((t) => (
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
                {STARTER_NOT_FOR_YOU.map((t) => (
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

      {/* ── 7. What's NOT included ──────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">What&rsquo;s not included</h2>
          <p className="bl-lede">
            We&rsquo;d rather tell you now than after you&rsquo;ve paid. At
            ${STARTER_PRICE} this is the entry package — three pages and a
            contact form, done well. These are separate builds:
          </p>
          <ul className="bl-not">
            {STARTER_NOT_INCLUDED.map((t) => (
              <li key={t}>
                <span className="bl-x" aria-hidden="true">
                  ×
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="bl-disclosure">
            Need any of it? The $399 Classic, $699 Professional and $999
            E-Commerce packages are on our{" "}
            <Link href="/services" className="bl-link">
              services page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Questions</h2>
          <div className="bl-faq">
            {STARTER_FAQ.map((item) => (
              <details key={item.q} className="bl-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Guarantee ────────────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap bl-wrap-narrow">
          <div className="bl-guarantee">
            <h2 className="bl-h2 tight">Our guarantee</h2>
            <p>
              If we look at what you need and the ${STARTER_PRICE} Starter
              isn&rsquo;t the right fit, we say so before you pay a penny — even
              when that means pointing you at a bigger package or at nothing at
              all.
            </p>
            <p>
              You own your domain, your content and your site. Stop the
              ${STARTER_HOSTING}/month whenever you like and we&rsquo;ll hand
              over the files and help you move.
            </p>
          </div>
        </div>
      </section>

      {/* ── 10. Final CTA + form ────────────────────────────────────────── */}
      <section id="get-started" className="bl-section bl-final">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Get My ${STARTER_PRICE} Website</h2>
          <p className="bl-lede">
            Two minutes. No payment now — we confirm the details with you first.
          </p>
          <LeadForm
            offer={STARTER_OFFER}
            hostingDisclosure={STARTER_HOSTING_DISCLOSURE}
          />
          <p className="bl-callnote">
            Would rather talk first?{" "}
            <ContactAction
              href="tel:+12545632130"
              method="phone"
              offer={STARTER_OFFER}
              className="bl-link"
            >
              Call (254) 563-2130
            </ContactAction>{" "}
            or{" "}
            <ContactAction
              href="mailto:john@tomorrowstechai.com"
              method="email"
              offer={STARTER_OFFER}
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
