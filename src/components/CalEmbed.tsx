"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

const CAL_LINK = "tomorrowstechai/discovery";

export function CalEmbed() {
  useEffect(() => {
    (async function init() {
      const cal = await getCalApi({ namespace: "discovery" });
      const brandVars = {
        "cal-brand": "#00D9FF",
        "cal-bg-emphasis": "#0F1620",
        "cal-bg": "#07090E",
        "cal-bg-subtle": "#131C28",
        "cal-bg-muted": "#0F1620",
        "cal-bg-inverted": "#E8EEF5",
        "cal-bg-info": "#0E7C95",
        "cal-bg-success": "rgba(0, 214, 143, 0.2)",
        "cal-border": "#1A2533",
        "cal-border-subtle": "#15202B",
        "cal-text": "#E8EEF5",
        "cal-text-emphasis": "#E8EEF5",
        "cal-text-muted": "#4A5868",
        "cal-text-subtle": "#7A8A9A",
      };

      cal("ui", {
        theme: "dark",
        hideEventTypeDetails: false,
        layout: "month_view",
        cssVarsPerTheme: {
          light: brandVars,
          dark: brandVars,
        },
      });
    })();
  }, []);

  return (
    <div className="rounded-lg overflow-hidden border border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
      <Cal
        namespace="discovery"
        calLink={CAL_LINK}
        style={{ width: "100%", height: "700px", overflow: "hidden" }}
        config={{ layout: "month_view", theme: "dark" }}
      />
    </div>
  );
}
