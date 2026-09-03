import { BUSINESS_TZ } from "@/lib/time/chicago";

/**
 * How a meeting's time is printed, everywhere.
 *
 * One module so the drawer, the table, the agenda and the panels cannot end
 * up formatting the same instant three different ways — which is exactly how
 * a person ends up unsure which of two times is the real one.
 */

export function timeOf(iso: string, timezone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: timezone || BUSINESS_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dayOf(iso: string, timezone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: timezone || BUSINESS_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function dateInputValue(iso: string, timezone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: timezone || BUSINESS_TZ });
}

export function timeInputValue(iso: string, timezone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: timezone || BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function longWhen(iso: string, timezone = BUSINESS_TZ): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone || BUSINESS_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "in 20 minutes", "2 hours ago" — only where it is genuinely useful. */
export function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  const abs = Math.abs(minutes);
  const unit = abs < 60
    ? `${abs} minute${abs === 1 ? "" : "s"}`
    : abs < 60 * 24
      ? `${Math.round(abs / 60)} hour${Math.round(abs / 60) === 1 ? "" : "s"}`
      : `${Math.round(abs / (60 * 24))} day${Math.round(abs / (60 * 24)) === 1 ? "" : "s"}`;
  return minutes >= 0 ? `in ${unit}` : `${unit} ago`;
}
