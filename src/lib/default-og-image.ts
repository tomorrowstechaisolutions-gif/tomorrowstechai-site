/**
 * The site-wide share image (src/app/opengraph-image.tsx).
 *
 * Next.js replaces the whole openGraph object when a page defines its own,
 * so a page that sets openGraph without `images` ends up with no share image
 * at all. Pages without a page-specific image should include this one.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Tomorrow’s Tech AI — We build modern businesses",
};
