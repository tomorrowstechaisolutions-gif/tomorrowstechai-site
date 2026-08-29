"use client";

/**
 * Captures where a visitor came from on their FIRST page of the session and
 * keeps it for the whole visit, so a lead submitted three clicks later still
 * carries the ad that paid for it.
 */

const KEY = "ttai_attribution_v1";

export type Attribution = {
  source: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  placement?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  fbp?: string;
  fbc?: string;
  landing_page?: string;
  referrer?: string;
};

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[2]) : undefined;
}

function clean(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim().slice(0, 300);
  return trimmed.length ? trimmed : undefined;
}

/**
 * Meta's click id cookie. If the pixel hasn't set _fbc yet (first paint, or
 * the visitor declined ad cookies) we still reconstruct it from ?fbclid so
 * the Conversions API gets a match key.
 */
function deriveFbc(fbclid?: string): string | undefined {
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return { source: "website" };

  const params = new URLSearchParams(window.location.search);
  const fbclid = clean(params.get("fbclid"));

  const fresh: Attribution = {
    source: clean(params.get("utm_source")) === "ig" ? "instagram" : fbclid ? "facebook" : "website",
    campaign: clean(params.get("campaign")) ?? clean(params.get("utm_campaign")),
    adset: clean(params.get("adset")) ?? clean(params.get("utm_content")),
    ad: clean(params.get("ad")) ?? clean(params.get("utm_term")),
    placement: clean(params.get("placement")),
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
    utm_content: clean(params.get("utm_content")),
    utm_term: clean(params.get("utm_term")),
    fbclid,
    gclid: clean(params.get("gclid")),
    landing_page: window.location.pathname + window.location.search,
    referrer: clean(document.referrer),
  };

  const hasFreshSignal = Boolean(
    fresh.utm_source || fresh.utm_campaign || fresh.fbclid || fresh.gclid
  );

  let stored: Attribution | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Attribution;
  } catch {
    // sessionStorage unavailable — fall through with what we have.
  }

  // First touch wins. A visitor who arrives from an ad and then navigates
  // around the site keeps the ad attribution, not the internal referrer.
  const result: Attribution = stored && !hasFreshSignal ? stored : { ...(stored ?? {}), ...fresh };

  // Cookie-derived ids are always refreshed — the pixel may have set them
  // after the first page view.
  result.fbp = readCookie("_fbp");
  result.fbc = deriveFbc(result.fbclid);

  try {
    sessionStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // ignore
  }

  return result;
}

export function getAttribution(): Attribution {
  if (typeof window === "undefined") return { source: "website" };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Attribution;
      stored.fbp = readCookie("_fbp") ?? stored.fbp;
      stored.fbc = deriveFbc(stored.fbclid) ?? stored.fbc;
      return stored;
    }
  } catch {
    // ignore
  }
  return captureAttribution();
}
