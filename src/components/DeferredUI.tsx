"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { mascotShows } from "@/lib/guide/invite";

/**
 * Defers loading of non-critical UI (Tess, the site guide, + cookie consent).
 *
 * Both components are interactive overlays that don't need to render
 * during initial paint. By dynamically importing with ssr: false,
 * we keep them out of the initial JS bundle and out of hydration —
 * they mount client-side after the rest of the page is interactive.
 *
 * Tess stays off the paid campaign pages, the admin and the member area
 * (see mascotShows): on an ad page she would compete with its single button.
 * The cookie banner still renders everywhere — it gates the Meta Pixel, so
 * it has to.
 */

const GuideMascot = dynamic(
  () => import("./guide/GuideMascot").then((m) => ({ default: m.GuideMascot })),
  { ssr: false }
);

const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => ({ default: m.CookieConsent })),
  { ssr: false }
);


export function DeferredUI() {
  const pathname = usePathname() ?? "";

  return (
    <>
      {mascotShows(pathname) && <GuideMascot />}
      <CookieConsent />
    </>
  );
}
