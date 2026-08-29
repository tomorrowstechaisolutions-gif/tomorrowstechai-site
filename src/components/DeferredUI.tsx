"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/**
 * Defers loading of non-critical UI (chat widget + cookie consent).
 *
 * Both components are interactive overlays that don't need to render
 * during initial paint. By dynamically importing with ssr: false,
 * we keep them out of the initial JS bundle and out of hydration —
 * they mount client-side after the rest of the page is interactive.
 *
 * The chat widget is suppressed on the paid campaign landing page and in
 * the admin center: on /business-launch it competes with the single CTA,
 * and in /admin it has no business being there at all. The cookie banner
 * still renders everywhere — it gates the Meta Pixel, so it has to.
 */

const ChatWidget = dynamic(
  () => import("./ChatWidget").then((m) => ({ default: m.ChatWidget })),
  { ssr: false }
);

const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => ({ default: m.CookieConsent })),
  { ssr: false }
);

const NO_CHAT_PREFIXES = ["/business-launch", "/admin"];

export function DeferredUI() {
  const pathname = usePathname() ?? "";
  const hideChat = NO_CHAT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  return (
    <>
      {!hideChat && <ChatWidget />}
      <CookieConsent />
    </>
  );
}
