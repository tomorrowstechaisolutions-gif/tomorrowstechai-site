"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/campaign/attribution";
import { analyticsConsented, gaEvent } from "@/lib/analytics";
import { CONSENT_EVENT } from "@/components/CookieConsent";

/**
 * Field Notes measurement.
 *
 * 1. Session attribution: remembers the first page and UTM tags of the visit
 *    in sessionStorage (no cookie, nothing sent anywhere). The contact form
 *    reads it only if the visitor chooses to submit an inquiry.
 * 2. GA4 events (article_view, article_progress, cta_click, share_click),
 *    sent ONLY after the visitor accepted analytics cookies. No personal data.
 *
 * Nothing here creates a CRM record.
 */
export function FieldNotesTracking({ slug, category }: { slug?: string; category?: string }) {
  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    if (!slug) return;

    let viewed = false;
    const sentProgress = new Set<number>();

    const sendView = () => {
      if (viewed || !analyticsConsented()) return;
      viewed = true;
      gaEvent("article_view", { slug, category });
    };
    sendView();
    // Visitor accepts cookies while reading: count the view from then on.
    window.addEventListener(CONSENT_EVENT, sendView);

    const body = document.querySelector(".fn-prose");
    const onScroll = () => {
      // While navigating away the body is detached and measures 0 tall;
      // dividing by that would report a 100% read that never happened.
      if (!body || !body.isConnected || !analyticsConsented()) return;
      const rect = body.getBoundingClientRect();
      if (rect.height <= 0) return;
      const read = (window.innerHeight - rect.top) / rect.height;
      for (const mark of [50, 90]) {
        if (read * 100 >= mark && !sentProgress.has(mark)) {
          sentProgress.add(mark);
          gaEvent("article_progress", { slug, percent: mark });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onClick = (e: MouseEvent) => {
      if (!analyticsConsented()) return;
      const link = (e.target as HTMLElement | null)?.closest("a, button") as HTMLElement | null;
      if (!link) return;
      const share = link.getAttribute("data-fn-share");
      if (share) {
        gaEvent("share_click", { slug, network: share });
        return;
      }
      const href = link.getAttribute("href");
      if (href?.startsWith("/contact")) {
        const q = new URLSearchParams(href.split("?")[1] ?? "");
        gaEvent("cta_click", { slug, cta: q.get("cta") ?? "other", service: q.get("service") ?? null });
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      window.removeEventListener(CONSENT_EVENT, sendView);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
    };
  }, [slug, category]);

  return null;
}
