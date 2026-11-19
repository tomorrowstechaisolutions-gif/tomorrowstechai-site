"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that says what it is doing and locks while it does it.
 *
 * A server action gives no feedback of its own: the page simply reloads when
 * it finishes. A button that looks idle for those two seconds gets pressed
 * again, and for a button that sends email that is a second email. The lock
 * here is the visible half; the action also refuses a repeat send itself.
 */
export default function PendingButton({
  children,
  busy,
  className,
}: {
  children: ReactNode;
  /** What the button reads while the action runs: "Sending…". */
  busy: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? busy : children}
    </button>
  );
}
