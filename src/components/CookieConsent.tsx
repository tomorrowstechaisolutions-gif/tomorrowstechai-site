"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "tomorrowstechai_cookie_consent";

type Consent = "accepted" | "declined" | null;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function applyConsentToGA(consent: Consent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (consent === "accepted") {
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } else if (consent === "declined") {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
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

    // Apply previously stored consent to GA (or default deny if first visit)
    applyConsentToGA(stored);

    if (stored === null) {
      // Show banner after a tiny delay so it doesn't compete with first paint
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  function handleAccept() {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // ignore
    }
    applyConsentToGA("accepted");
    setVisible(false);
  }

  function handleDecline() {
    try {
      localStorage.setItem(STORAGE_KEY, "declined");
    } catch {
      // ignore
    }
    applyConsentToGA("declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 md:left-6 md:right-6 z-40 max-w-3xl md:mx-auto"
    >
      <div className="bg-[color:var(--color-bg)] border border-[color:var(--color-cyan-deep)] rounded-lg shadow-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="flex-1 mb-4 md:mb-0">
            <div className="font-mono text-xs tracking-widest text-[color:var(--color-cyan)] uppercase mb-2">
              ● Privacy notice
            </div>
            <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
              We use Google Analytics to measure aggregate site traffic. No
              advertising cookies, no cross-site tracking. See our{" "}
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
