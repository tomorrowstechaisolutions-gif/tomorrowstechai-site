import Link from "next/link";
import type { Metadata } from "next";
import { LeadForm } from "@/components/business-launch/LeadForm";
import { CampaignTracking } from "@/components/business-launch/CampaignTracking";
import { ContactAction } from "@/components/business-launch/ContactAction";
import {
  FAQ,
  HOSTING_FROM,
  INCLUDED,
  NOT_INCLUDED,
  OFFER_PRICE,
  UPGRADES,
} from "@/lib/campaign/config";

export const metadata: Metadata = {
  title: "Launch Your Business Online for $399",
  description:
    "A professional 5-page website plus the tools to capture leads, book customers and take payments — $399 one-time. Hosting and management from $29/month.",
  alternates: { canonical: "/business-launch" },
  openGraph: {
    title: "Launch Your Business Online for $399 · Tomorrow’s Tech AI",
    description:
      "More than a website. It's your business command center. $399 one-time, hosting from $29/month.",
    url: "https://tomorrowstechai.com/business-launch",
    type: "website",
  },
};

const STEPS = [
  {
    n: "01",
    title: "Tell us about your business",
    body: "Two minutes on the form below. Name, trade, what you need. No call required to get started.",
  },
  {
    n: "02",
    title: "We confirm the plan",
    body: "A short call or email thread to lock down your five pages, your services and what your customers need to be able to do.",
  },
  {
    n: "03",
    title: "We build it",
    body: "Design, copy, mobile, forms, dashboard, payments, SEO setup. Usually 7–14 days once we have your content.",
  },
  {
    n: "04",
    title: "You review, then it goes live",
    body: "One revision round included. Then we connect your domain, turn on SSL and hand you the keys.",
  },
];

const FOR_YOU = [
  "You run a real business and you're the one answering the phone.",
  "You have no website, or one you're embarrassed to send people to.",
  "You're losing work because customers can't find you or can't book you.",
  "You're tracking leads in your head, your texts, or a notebook.",
  "You want to start small and add the smart stuff when it earns its place.",
];

const NOT_FOR_YOU = [
  "You need a custom application or a full AI command center on day one.",
  "You want a marketing agency to run your ads and content.",
  "You want the cheapest possible page and nothing behind it.",
];

export default function BusinessLaunchPage() {
  return (
    <div className="bl-page">
      <CampaignTracking />

      {/* Minimal chrome — a wordmark and one anchor. Nothing to click away with. */}
      <header className="bl-topbar">
        <Link href="/" className="bl-brand">
          Tomorrow&rsquo;s Tech AI
        </Link>
        <a href="#get-started" className="bl-topbar-cta">
          Get started
        </a>
      </header>

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <section className="bl-hero">
        <div className="bl-wrap">
          <p className="bl-eyebrow">● More than a website. It&rsquo;s your business command center.</p>
          <h1 className="bl-h1">
            Launch Your Business Online for{" "}
            <span className="bl-price-inline">${OFFER_PRICE}</span>
          </h1>
          <p className="bl-sub">
            Get a professional website plus the tools you need to capture leads,
            book customers and start growing.
          </p>

          <div className="bl-pricebox">
            <div className="bl-pricebox-main">
              <span className="bl-pricebox-amount">${OFFER_PRICE}</span>
              <span className="bl-pricebox-unit">one-time build</span>
            </div>
            <div className="bl-pricebox-note">
              Then hosting &amp; management from{" "}
              <strong>${HOSTING_FROM}/month</strong> once your site is live.
              Cancel any time.
            </div>
          </div>

          <div className="bl-cta-row">
            <a href="#get-started" className="bl-cta">
              Get My ${OFFER_PRICE} Business Launch
            </a>
            <a href="#included" className="bl-cta-secondary">
              See What&rsquo;s Included
            </a>
          </div>

          <ul className="bl-trust">
            <li>Live in 7–14 days</li>
            <li>You own the site</li>
            <li>No long contract</li>
          </ul>
        </div>
      </section>

      {/* ── 2. What's included ──────────────────────────────────────────── */}
      <section id="included" className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">Everything in the ${OFFER_PRICE} package</h2>
          <p className="bl-lede">
            Fifteen things, all of them built and connected before you go live.
            Not a page — a working setup.
          </p>
          <ul className="bl-included">
            {INCLUDED.map((item) => (
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
            ${OFFER_PRICE} one-time. Hosting &amp; management from ${HOSTING_FROM}
            /month after launch — that&rsquo;s the entire price list.
          </p>
        </div>
      </section>

      {/* ── 3. Example website / dashboard ──────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">What you actually get</h2>
          <p className="bl-lede">
            A site your customers use, and a dashboard only you see. Both are
            included at ${OFFER_PRICE}.
          </p>

          <div className="bl-showcase">
            <figure className="bl-phone-wrap">
              <div className="bl-phone" role="img" aria-label="Example of a mobile-optimized contractor website built in the Business Launch package">
                <div className="bl-phone-screen">
                  <div className="bl-mock-nav">
                    <span className="bl-mock-logo" />
                    <span className="bl-mock-burger" />
                  </div>
                  <div className="bl-mock-hero">
                    <div className="bl-mock-line w-70" />
                    <div className="bl-mock-line w-90" />
                    <div className="bl-mock-line w-50 dim" />
                    <div className="bl-mock-btn">Get a free estimate</div>
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
                    <div className="bl-mock-btn sm">Request a time</div>
                  </div>
                </div>
              </div>
              <figcaption>Your website — built mobile-first.</figcaption>
            </figure>

            <figure className="bl-dash-wrap">
              <div className="bl-dash" role="img" aria-label="Example of the basic business dashboard included in the Business Launch package">
                <div className="bl-dash-head">
                  <span className="bl-dash-dot" />
                  <span>Your dashboard</span>
                </div>
                <div className="bl-dash-kpis">
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">New leads</span>
                    <span className="bl-dash-kpi-value">7</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">Requests</span>
                    <span className="bl-dash-kpi-value">3</span>
                  </div>
                  <div className="bl-dash-kpi">
                    <span className="bl-dash-kpi-label">This week</span>
                    <span className="bl-dash-kpi-value">12</span>
                  </div>
                </div>
                <div className="bl-dash-rows">
                  {[
                    ["Marisol T.", "Estimate request", "New"],
                    ["Dale W.", "Called back", "Contacted"],
                    ["Priya N.", "Booked Thursday", "Scheduled"],
                    ["Ray O.", "Deposit paid", "Won"],
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
                Your dashboard — every lead in one place.
              </figcaption>
            </figure>
          </div>
          <p className="bl-illustrative">
            Illustrative example. Your build is designed around your business,
            your brand and your services.
          </p>
        </div>
      </section>

      {/* ── 4. How it works ─────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">How it works</h2>
          <ol className="bl-steps">
            {STEPS.map((s) => (
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

      {/* ── 5. Who this is for ──────────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">Who this is for</h2>
          <div className="bl-two-col">
            <div className="bl-col">
              <h3 className="bl-col-head good">This is for you if</h3>
              <ul className="bl-bullets">
                {FOR_YOU.map((t) => (
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
                {NOT_FOR_YOU.map((t) => (
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

      {/* ── 6. What's NOT included ──────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap">
          <h2 className="bl-h2">What&rsquo;s not included</h2>
          <p className="bl-lede">
            We&rsquo;d rather tell you now than after you&rsquo;ve paid. The
            ${OFFER_PRICE} package is the foundation, not the full custom AI
            Business Command Center. These are separate builds:
          </p>
          <ul className="bl-not">
            {NOT_INCLUDED.map((t) => (
              <li key={t}>
                <span className="bl-x" aria-hidden="true">
                  ×
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 7. Upgrade possibilities ────────────────────────────────────── */}
      <section className="bl-section bl-section-alt">
        <div className="bl-wrap">
          <h2 className="bl-h2">When you&rsquo;re ready for more</h2>
          <p className="bl-lede">
            The ${OFFER_PRICE} build is designed to grow into a full command
            center. Nothing gets thrown away — these bolt straight on, at your
            pace, quoted separately.
          </p>
          <div className="bl-upgrades">
            {UPGRADES.map((u) => (
              <div key={u.title} className="bl-upgrade">
                <h3>{u.title}</h3>
                <p>{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────────────────── */}
      <section className="bl-section">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Questions</h2>
          <div className="bl-faq">
            {FAQ.map((item) => (
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
              If we get on the call and it turns out the ${OFFER_PRICE}{" "}
              package isn&rsquo;t the right fit for your business, we tell you and you
              pay nothing. If we build it and you don&rsquo;t approve the first
              draft, you get your revision round — and if it still isn&rsquo;t
              right, we refund the build in full within 14 days of delivery.
            </p>
            <p>
              You own your domain, your content and your site. Stop the
              ${HOSTING_FROM}/month whenever you like and we&rsquo;ll hand over
              the files and help you move.
            </p>
          </div>
        </div>
      </section>

      {/* ── 10. Final CTA + form ────────────────────────────────────────── */}
      <section id="get-started" className="bl-section bl-final">
        <div className="bl-wrap bl-wrap-narrow">
          <h2 className="bl-h2">Get My ${OFFER_PRICE} Business Launch</h2>
          <p className="bl-lede">
            Two minutes. No payment now — we confirm the details with you first.
          </p>
          <LeadForm />
          <p className="bl-callnote">
            Would rather talk first?{" "}
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
