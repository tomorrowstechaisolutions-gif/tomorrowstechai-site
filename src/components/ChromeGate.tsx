"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the site header/footer on routes that should be distraction-free:
 * the paid campaign landing page and the admin center.
 *
 * Children are passed in from the server layout, so Footer stays a server
 * component — only the show/hide decision runs on the client.
 */
const BARE_PREFIXES = ["/business-launch", "/starter-website", "/admin", "/intake"];

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <>{children}</>;
}

/** Inverse of ChromeGate — renders only on the bare routes. */
export function BareOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }
  return null;
}
