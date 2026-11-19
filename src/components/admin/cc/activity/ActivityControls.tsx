"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * The two Activity Center controls that need a browser: the custom date range
 * and "Load older".
 *
 * Both only rewrite the URL — the server reads it, so a filtered view is a
 * link you can bookmark. They are client components for one reason: so the
 * button says it is working while the server answers.
 */

export function DateRangeForm({
  module,
  from,
  to,
  maxDay,
}: {
  /** The module filter to keep, or "all". */
  module: string;
  from: string | null;
  to: string | null;
  /** Today in Chicago, so the picker cannot ask for the future. */
  maxDay: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fromValue, setFromValue] = useState(from ?? "");
  const [toValue, setToValue] = useState(to ?? "");

  const ready = Boolean(fromValue || toValue);

  return (
    <form
      className="cc-act-dates"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        const qs = new URLSearchParams();
        if (module !== "all") qs.set("module", module);
        qs.set("range", "custom");
        if (fromValue) qs.set("from", fromValue);
        if (toValue) qs.set("to", toValue);
        startTransition(() => router.push(`/admin/activity?${qs.toString()}`));
      }}
    >
      <label htmlFor="activity-from">From</label>
      <input
        id="activity-from"
        type="date"
        value={fromValue}
        max={toValue || maxDay}
        onChange={(event) => setFromValue(event.target.value)}
      />
      <label htmlFor="activity-to">to</label>
      <input
        id="activity-to"
        type="date"
        value={toValue}
        min={fromValue || undefined}
        max={maxDay}
        onChange={(event) => setToValue(event.target.value)}
      />
      <button type="submit" className="cc-btn" disabled={!ready || pending} aria-busy={pending}>
        {pending ? "Loading…" : "Apply dates"}
      </button>
    </form>
  );
}

export function LoadOlderButton({ href }: { href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="cc-btn"
      disabled={pending}
      aria-busy={pending}
      // scroll: false keeps your place; the older rows appear underneath.
      onClick={() => startTransition(() => router.push(href, { scroll: false }))}
    >
      {pending ? "Loading older…" : "Load older"}
    </button>
  );
}
