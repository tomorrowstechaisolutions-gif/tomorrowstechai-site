"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CONSENT_KEY = "tomorrowstechai_cookie_consent";
const CONSENT_EVENT = "ttai:consent-change";

/**
 * The one and only Meta Pixel on this site. It is loaded lazily and ONLY
 * after the visitor accepts advertising cookies, so it never fires under the
 * consent-denied default set in the root layout.
 *
 * Do not add a second base pixel snippet anywhere — duplicate PageViews wreck
 * attribution and inflate every rate on the campaign dashboard.
 */
export function MetaPixel() {
  const [allowed, setAllowed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function read() {
      try {
        setAllowed(localStorage.getItem(CONSENT_KEY) === "accepted");
      } catch {
        setAllowed(false);
      }
    }
    read();
    window.addEventListener(CONSENT_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CONSENT_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // SPA navigations don't reload the script, so PageView is sent per route.
  useEffect(() => {
    if (!allowed || !PIXEL_ID) return;
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [pathname, allowed]);

  if (!PIXEL_ID || !allowed) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${PIXEL_ID}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
