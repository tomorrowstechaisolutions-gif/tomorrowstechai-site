import type { NextConfig } from "next";

/**
 * Images served by next/image must come from an allow-listed host.
 *
 * Without this block the optimizer refuses every remote URL with a 400
 * (INVALID_IMAGE_OPTIMIZE_REQUEST) and the browser shows a broken image —
 * even though the underlying file is fine and its signed URL returns 200.
 * That is exactly what happened to the Brand Assets logos.
 *
 * The host is derived from NEXT_PUBLIC_SUPABASE_URL so this keeps working if
 * the project ref ever changes, with the current ref as a fallback in case
 * the variable is missing at build time. Only that one host is listed: a
 * wildcard would turn our optimizer into a fetcher for anybody's bucket.
 */
const supabaseHost = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "nttvnklbevixtqrbtfru.supabase.co";
  try {
    return new URL(raw).hostname;
  } catch {
    return "nttvnklbevixtqrbtfru.supabase.co";
  }
})();

/**
 * Baseline browser-protection headers for every route. Deliberately no
 * Content-Security-Policy yet: the site loads GA, the Meta Pixel, the
 * LeadConnector chat widget, Cal.com and Stripe, and a strict policy needs
 * its own tested pass. Camera and microphone are not restricted because the
 * admin Conference Center may use them.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        // Storage only, and only the read paths. Signed URLs live under
        // /object/sign/, public ones under /object/public/.
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
