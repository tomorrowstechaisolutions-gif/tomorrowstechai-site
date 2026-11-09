"use client";

import { useEffect, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

const CAL_LINK = "tomorrowstechai/discovery";

/**
 * Cal.com month view with the event details panel hidden (the page around it
 * says what the call is). The iframe sizes itself to its content, so there is
 * no fixed-height box with empty space above and below the calendar.
 */
export function CalEmbed() {
  const [ready, setReady] = useState(false);
  // Below 1240px a button opens Cal.com's full-screen booker. With its details
  // panel hidden, the inline month view squeezes into a sliver at tablet
  // widths and reserves a tall empty area on phones. null = unknown yet.
  const [narrow, setNarrow] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1239px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async function init() {
      const cal = await getCalApi({ namespace: "discovery" });
      // The site palette (globals.css @theme), so the calendar reads as part
      // of the page rather than a third-party widget.
      const brandVars = {
        "cal-brand": "#3B82F6",
        "cal-brand-emphasis": "#60A5FA",
        "cal-brand-text": "#FFFFFF",
        "cal-bg": "#0A111C",
        "cal-bg-emphasis": "#16233A",
        "cal-bg-subtle": "#101A29",
        "cal-bg-muted": "#0D1522",
        "cal-bg-inverted": "#E9EFF7",
        "cal-bg-info": "#1D4ED8",
        "cal-bg-success": "rgba(34, 197, 94, 0.2)",
        "cal-border": "#1B2739",
        "cal-border-subtle": "#141D2C",
        "cal-border-booker": "#1B2739",
        "cal-text": "#E9EFF7",
        "cal-text-emphasis": "#F4F8FC",
        // Weekday headers and secondary text: readable on the dark panel.
        "cal-text-muted": "#8B9AB0",
        "cal-text-subtle": "#A3B0C2",
      };

      cal("ui", {
        theme: "dark",
        hideEventTypeDetails: true,
        layout: "month_view",
        cssVarsPerTheme: { light: brandVars, dark: brandVars },
      });
      cal("on", {
        action: "linkReady",
        callback: () => {
          if (!cancelled) setReady(true);
        },
      });
    })();
    // Never leave the skeleton up forever if the ready event is missed.
    const fallback = setTimeout(() => !cancelled && setReady(true), 6000);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  // Before the width is known: hold roughly the right space, no layout jump.
  if (narrow === null) return <div className="bk-pending" aria-hidden="true" />;

  if (narrow) {
    return (
      <div className="bk-mobile">
        <button
          type="button"
          className="bk-mobile-btn"
          data-cal-namespace="discovery"
          data-cal-link={CAL_LINK}
          data-cal-config='{"layout":"month_view","theme":"dark"}'
        >
          Choose a time
        </button>
        <p className="bk-mobile-note">Opens the calendar. Pick a day, then a time.</p>
      </div>
    );
  }

  return (
    <div className={`bk-cal${ready ? " is-ready" : ""}`}>
      {!ready ? (
        <div className="bk-cal-skeleton" role="status" aria-live="polite">
          <span className="bk-sr">Loading available times…</span>
          <div className="bk-skel-head" aria-hidden="true" />
          <div className="bk-skel-grid" aria-hidden="true">
            {Array.from({ length: 35 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      ) : null}
      <Cal
        namespace="discovery"
        calLink={CAL_LINK}
        style={{ width: "100%", overflow: "visible" }}
        config={{ layout: "month_view", theme: "dark" }}
      />
    </div>
  );
}
