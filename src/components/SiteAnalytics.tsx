"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: cookieless page views for the admin Analytics page.
 *
 * - The admin itself is never counted.
 * - Pages whose URL carries a private client token (intake, proposals,
 *   action requests, invoices) are counted under a generic path, so the
 *   token never reaches the analytics store.
 */
const TOKEN_ROUTES = ["/intake/", "/proposal/", "/action/", "/invoice/", "/pay/"];

function scrub(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return event;
  }
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return null;
  const tokenRoute = TOKEN_ROUTES.find((p) => url.pathname.startsWith(p));
  if (tokenRoute) {
    url.pathname = `${tokenRoute}[token]`;
    url.search = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/token|key|sig|secret|code/i.test(key)) url.searchParams.delete(key);
  }
  return { ...event, url: url.toString() };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={scrub} />;
}
