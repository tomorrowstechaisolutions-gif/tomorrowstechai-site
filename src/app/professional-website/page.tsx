import Link from "next/link";
import type { Metadata } from "next";
import { LeadForm } from "@/components/business-launch/LeadForm";
import { CampaignTracking } from "@/components/business-launch/CampaignTracking";
import { ContactAction } from "@/components/business-launch/ContactAction";
import { PROFESSIONAL_OFFER } from "@/lib/campaign/offers";
import {
  PRO_FAQ,
  PRO_FOR_YOU,
  PRO_HOSTING,
  PRO_HOSTING_DISCLOSURE,
  PRO_INCLUDED,
  PRO_NOT_FOR_YOU,
  PRO_NOT_INCLUDED,
  PRO_PRICE,
  PRO_STEPS,
  PRO_WHY_UPGRADE,
} from "@/lib/campaign/professional";

export const metadata: Metadata = {
  title: "Build More Than a Website — $699 Professional Website",
  description:
    "A premium ten-page website plus the workflows behind it: multiple lead forms, quote requests, inquiry handling, analytics and conversion tracking. $699 one time, plus $29/month hosting.",
  alternates: { canonical: "/professional-website" },
  openGraph: {
    title: "Build More Than a Website · Tomorrow’s Tech AI",
    description:
      "Not just a website — a website designed to generate and organize business. $699 one time, plus $29/month hosting.",
    url: "https://tomorrowstechai.com/professional-website",
    type: "website",
  },
};

export default function ProfessionalWebsitePage() {
  return (
    <div className="bl-page">
      <CampaignTracking offer={PROFESSIONAL_OFFER} />

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
            ● Premium website + business-ready workflows
          </p>
          <h1 className="bl-h1">
            Build More Than a Website for{" "}
            <span className="bl-price-inline">${PRO_PRICE}</span>
          </h1>
          <p className="bl-sub">
            Up to ten custom pages, designed around your brand — plus the lead
            forms, quote requests, inquiry handling and tracking that turn a
            website into something that generates and organizes business.
          </p>

          <div className="bl-pricebox">
            <div className="bl-pricebox-main">
              <span className="bl-pricebox-amount">${PRO_PRICE}</span>
              <span className="bl-pricebox-unit">one-time build</span>
            </div>
            <div className="bl-pricebox-note">
              Then hosting at{" "}
              <strong>${PRO_HOSTING}/month</strong>, free for the first 30 days.
              Cancel any time.
            </div>
          </div>

          <div className="bl-cta-row">
            <a href="#get-started" className="bl-cta">
              Get My ${PRO_PRICE} Website
            </a>
            <a href="#included" className="bl-cta-secondary">
              See What&rsquo;s Included
            </a>
          </div>

          <ul className="bl-trust">
            <li>Premium custom design</li>
            <li>Lead ready &amp; CRM ready</li>
            <li>You own the site</li>
          </ul>
        </div>
      </section>

      {/* ── 2. Why upgrade ──────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Why step up from a five-page site</h2>
          <p className="bl-lede">
            Not just a website — a website designed to generate and organize
            business. That difference is what the extra buys.
          </p>
          <div className="bl-upgrades">
            {PRO_WHY_UPGRADE.map((u) => (
              <div key={u.title} className="bl-upgrade">
                <h3>{u.title}</h3>
                <p>{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. What's included ──────────────────────────────────────────── */}
      <section id="included" className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">Everything in the ${PRO_PRICE} package</h2>
          <p className="bl-lede">
            Seventeen things, all built and connected before you go live. The
            pages are the visible half; the workflows behind them are the reason
            this tier exists.
          </p>
          <ul className="bl-included">
            {PRO_INCLUDED.map((item) => (
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
          <p className="bl-disclosure">{PRO_HOSTING_DISCLOSURE}</p>
        </div>
      </section>

      {/* ── 4. What it looks like ───────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">The site, and what sits behind it</h2>
          <p className="bl-lede">
            Customers see a premium site. You see every inquiry arriving
            organized, attributed and already routed to the right place.
          </p>

          <div className="bl-showcase">
            <figure className="bl-phone-wrap">
              <div
                className="bl-phone"
                role="img"
                aria-label="Example of a mobile-optimized professional website with multiple lead forms"
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
                  <div className="bl-mock-form">
                    <div className="bl-mock-input" />
                    <div className="bl-mock-input" />
                    <div className="bl-mock-btn sm">Request quote</div>
                  </div>
                </div>
              </div>
              <figcaption>Your website — premium, and built to convert.</figcaption>
            </figure>

            <figure className="bl-dash-wrap">
              <div
                className="bl-dash"
                role="img"
                aria-label="Example of organized inquiries and quote requests"
              >
                <div className="bl-dash-head">
                  <span className="bl-dash-dot" />
                  <span>Your inquiries</span>
                </div>
                <div className="bl-dash-kpis">
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">New</span>
                    <span className="bl-dash-kpi-value">12</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">Contacted</span>
                    <span className="bl-dash-kpi-value">8</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">Quoted</span>
                    <span className="bl-dash-kpi-value">5</span>
                  </div>
                </div>
                <div className="bl-dash-rows">
                  {[
                    ["Kitchen remodel", "New inquiry", "New"],
                    ["Commercial build", "Quote request", "New"],
                    ["Home addition", "New inquiry", "Contacted"],
                    ["Deck project", "New inquiry", "New"],
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
              <figcaption>
                Every inquiry organized, routed and counted.
              </figcaption>
            </figure>
          </div>

          <p className="bl-illustrative">
            Illustrative example. Your build is designed around your business,
            your brand and your services.
          </p>
        </div>
      </section>

      {/* ── 5. How it works ─────────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">How it works</h2>
          <ol className="bl-steps">
            {PRO_STEPS.map((s) => (
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

      {/* ── 6. Who this is for ──────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Who this is for</h2>
          <div className="bl-two-col">
            <div className="bl-col">
              <h3 className="bl-col-head good">This is for you if</h3>
              <ul className="bl-bullets">
                {PRO_FOR_YOU.map((t) => (
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
                {PRO_NOT_FOR_YOU.map((t) => (
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
            We&rsquo;d rather tell you now than after you&rsquo;ve paid. This
            tier organizes your leads; it is not the full command center. These
            are separate builds:
          </p>
          <ul className="bl-not">
            {PRO_NOT_INCLUDED.map((t) => (
              <li key={t}>
                <span className="bl-x" aria-hidden="true">
                  ×
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="bl-disclosure">
            Selling products online? That&rsquo;s the $999 E-Commerce package.
            All four packages are compared on our{" "}
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
            {PRO_FAQ.map((item) => (
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
              If we scope it together and the ${PRO_PRICE} Professional
              isn&rsquo;t the right fit, we say so before you pay anything —
              including when the honest answer is a cheaper package.
            </p>
            <p>
              You own your domain, your content and your site. Stop the
              ${PRO_HOSTING}/month whenever you like and we&rsquo;ll hand over
              the files and help you move.
            </p>
          </div>
        </div>
      </section>

      {/* ── 10. Final CTA + form ────────────────────────────────────────── */}
      <section id="get-started" className="bl-section bl-final">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Get My ${PRO_PRICE} Website</h2>
          <p className="bl-lede">
            Two minutes. No payment now — we scope the pages with you first.
          </p>
          <LeadForm
            offer={PROFESSIONAL_OFFER}
            hostingDisclosure={PRO_HOSTING_DISCLOSURE}
          />
          <p className="bl-callnote">
            Would rather talk first?{" "}
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
