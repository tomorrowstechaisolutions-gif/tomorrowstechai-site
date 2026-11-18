"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that locks while the form is sending, so a second click
 * (or a stray Enter) can never send the same email twice.
 */
export default function SendButton({ label, busy, className }: { label: string; busy: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? busy : label}
    </button>
  );
}
