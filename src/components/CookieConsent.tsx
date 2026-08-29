"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "tomorrowstechai_cookie_consent";

/** MetaPixel.tsx listens for this so the pixel mounts the moment consent is
 *  granted, without a page reload. */
export const CONSENT_EVENT = "ttai:consent-change";

type Consent = "accepted" | "declined" | null;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Consent Mode v2. The root layout defaults every storage type to denied;
 * this only ever loosens that after an explicit click.
 *
 * Accepting now also grants ad_storage — the site runs paid Meta campaigns
 * and the pixel is gated on this value. Declining leaves the visitor with no
 * analytics and no pixel at all.
 */
function applyConsent(consent: Consent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const granted = consent === "accepted";
  window.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
  });
}

function persist(consent: Exclude<Consent, null>) {
  try {
    localStorage.setItem(STORAGE_KEY, consent);
  } catch {
    // ignore
  }
  applyConsent(consent);
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stored: Consent = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "accepted" || raw === "declined") {
        stored = raw;
      }
    } catch {
      // localStorage unavailable; treat as no consent yet
    }

    applyConsent(stored);

    if (stored === null) {
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  function handleAccept() {
    persist("accepted");
    setVisible(false);
  }

  function handleDecline() {
    persist("declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 md:left-6 md:right-6 z-[60] max-w-3xl md:mx-auto"
    >
      <div className="bg-[color:var(--color-bg)] border border-[color:var(--color-cyan-deep)] rounded-lg shadow-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="flex-1 mb-4 md:mb-0">
            <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-2">
              ● Privacy notice
            </div>
            <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
              We use Google Analytics to measure site traffic, and the Meta
              Pixel to measure the results of our own ads. Decline and neither
              one runs. See our{" "}
              <Link
                href="/privacy"
                className="text-[color:var(--color-cyan)] hover:underline"
              >
                privacy policy
              </Link>{" "}
              for the full picture.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={handleDecline}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              className="btn-primary text-sm whitespace-nowrap"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
