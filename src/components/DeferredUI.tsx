"use client";

import dynamic from "next/dynamic";

/**
 * Defers loading of non-critical UI (chat widget + cookie consent).
 *
 * Both components are interactive overlays that don't need to render
 * during initial paint. By dynamically importing with ssr: false,
 * we keep them out of the initial JS bundle and out of hydration —
 * they mount client-side after the rest of the page is interactive.
 *
 * This shrinks initial JS and reduces Total Blocking Time.
 */

const ChatWidget = dynamic(
  () => import("./ChatWidget").then((m) => ({ default: m.ChatWidget })),
  { ssr: false }
);

const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => ({ default: m.CookieConsent })),
  { ssr: false }
);

export function DeferredUI() {
  return (
    <>
      <ChatWidget />
      <CookieConsent />
    </>
  );
}
