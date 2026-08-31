"use client";

import { useTransition } from "react";
import { setTargetAction } from "@/app/admin/pipeline-actions";

/**
 * Setting this month's sales target.
 *
 * Deliberately a small inline form rather than a dialog: it exists because
 * the forecast refuses to invent a target, and the fix should take five
 * seconds from the panel that is complaining.
 */
export default function SetTarget() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="cc-inline-form"
      action={(fd) => startTransition(async () => { await setTargetAction(fd); })}
    >
      <input
        className="cc-input"
        name="target"
        inputMode="decimal"
        placeholder="Monthly target, e.g. 25000"
        aria-label="Monthly sales target in dollars"
        required
      />
      <button type="submit" className="cc-btn primary" disabled={pending}>
        {pending ? "Saving…" : "Set target"}
      </button>
    </form>
  );
}
