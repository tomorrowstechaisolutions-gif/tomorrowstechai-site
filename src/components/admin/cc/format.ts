/**
 * Display helpers for the command centre.
 *
 * The one rule that matters: an unknown value formats as "—", never as 0 and
 * never as 0%. A dashboard that renders "0% conversion" when nothing has been
 * measured yet is telling the operator something false about their business.
 */

const TZ = "America/Chicago";

export const DASH = "—";

export function money(cents: number | null | undefined, opts?: { cents?: boolean }): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return DASH;
  const showCents = opts?.cents ?? false;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/** $124,850 → $124.9k once the number stops fitting a KPI card. */
export function moneyCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return DASH;
  const dollars = cents / 100;
  if (Math.abs(dollars) < 100_000) return money(cents);
  return `$${(dollars / 1000).toFixed(1)}k`;
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US");
}

/** Follower-style numbers: 22400 → 22.4K. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function pct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return DASH;
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function multiple(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return `${n.toFixed(2)}×`;
}

export type DeltaTone = "up" | "down" | "flat";

export function deltaParts(delta: number | null): { tone: DeltaTone; text: string } | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  const rounded = Math.round(delta * 1000) / 10;
  if (Math.abs(rounded) < 0.1) return { tone: "flat", text: "no change" };
  return {
    tone: rounded > 0 ? "up" : "down",
    text: `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`,
  };
}

/** "9:00 AM" in the business timezone. */
export function clockTime(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortDate(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  });
}

/** "4 min ago", "3 days ago". Past only — this is used on event feeds. */
export function ago(iso: string | null): string {
  if (!iso) return DASH;
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(iso);
}

/** "in 2 days", "3 days ago" — used for due dates, which run both ways. */
export function due(iso: string | null): string {
  if (!iso) return "No date";
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86400_000);
  if (Math.abs(ms) < 12 * 3600_000) return clockTime(iso);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function todayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
