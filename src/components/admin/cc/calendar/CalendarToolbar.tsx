"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import {
  BUSINESS_TIMEZONE_LABEL, CALENDAR_VIEWS, type CalendarView,
} from "@/lib/calendar/config";
import { shiftAnchor } from "@/lib/calendar/window";
import { IconArrowRight } from "../Icons";

/**
 * View tabs, date navigation and the timezone label.
 *
 * The view and the anchor date both live in the URL, so a week you are
 * looking at is a link you can send, and the back button walks back through
 * the weeks you visited rather than leaving the page.
 */
export default function CalendarToolbar({
  view,
  anchor,
  label,
  today,
}: {
  view: CalendarView;
  anchor: string;
  label: string;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  /**
   * On a phone, the default view is the agenda.
   *
   * A seven-day grid on a 390px screen is a horizontal scroll nobody uses.
   * This only fires when no view has been chosen — an explicit ?view=week is
   * respected, because somebody who asked for the grid meant it.
   */
  useEffect(() => {
    if (params.get("view")) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 760px)").matches) return;

    const search = new URLSearchParams(params.toString());
    search.set("view", "agenda");
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    // Once, on arrival. Re-running on every param change would trap the user
    // on the agenda every time they filtered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: Record<string, string | null>) => {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") search.delete(key);
      else search.set(key, value);
    }
    search.delete("item");
    startTransition(() =>
      router.replace(`${pathname}?${search.toString()}`, { scroll: false })
    );
  };

  return (
    <div className="cal-toolbar" data-pending={pending ? "1" : undefined}>
      <div className="cal-views" role="group" aria-label="Calendar view">
        {CALENDAR_VIEWS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={view === entry.key ? "is-on" : ""}
            onClick={() =>
              go({
                view: entry.key === "week" ? null : entry.key,
                // Switching to Today means today, not the day you were on.
                anchor: entry.key === "day" ? today : null,
              })
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="cal-nav">
        <button
          type="button"
          className="cc-icon-btn"
          aria-label="Previous"
          onClick={() => go({ anchor: shiftAnchor(view, anchor, -1) })}
        >
          <span className="cal-prev"><IconArrowRight size={14} /></span>
        </button>

        <b>{label}</b>

        <button
          type="button"
          className="cc-icon-btn"
          aria-label="Next"
          onClick={() => go({ anchor: shiftAnchor(view, anchor, 1) })}
        >
          <IconArrowRight size={14} />
        </button>

        <button type="button" className="cc-btn" onClick={() => go({ anchor: null })}>
          Today
        </button>
      </div>

      <span className="cal-tz" title="All times on this page are in the business timezone">
        {BUSINESS_TIMEZONE_LABEL}
      </span>
    </div>
  );
}
