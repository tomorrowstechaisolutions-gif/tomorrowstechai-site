import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Mostly here so Android/Chrome have a proper icon and name to work with when
 * the site is saved to a home screen or shown in Chrome's UI. The favicon that
 * Google Search displays comes from the `<link rel="icon">` tags Next generates
 * from `app/icon.png`, `app/icon.svg` and `app/favicon.ico` — not from here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tomorrow’s Tech AI",
    short_name: "Tomorrow’s Tech AI",
    description:
      "We build modern businesses — brand, website, commerce, operations, software and AI, in one connected system.",
    start_url: "/",
    display: "standalone",
    background_color: "#04070D",
    theme_color: "#04070D",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
