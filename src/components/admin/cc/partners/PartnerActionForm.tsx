"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PartnerResult } from "@/app/admin/partner-actions";

/**
 * A form that calls a Partner Center action and says what came back —
 * the partner API's own words on failure, never a silent no-op.
 */
export default function PartnerActionForm({
  action, children, submitLabel, pendingLabel = "Working…", className = "", resetOnSuccess = false,
  buttonClass = "cc-btn",
}: {
  action: (fd: FormData) => Promise<PartnerResult>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  buttonClass?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PartnerResult | null>(null);

  return (
    <form
      className={`pc-form ${className}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        startTransition(async () => {
          const r = await action(fd);
          setResult(r);
          if (r.ok) {
            if (resetOnSuccess) form.reset();
            router.refresh();
          }
        });
      }}
    >
      {children}
      <div className="pc-form-foot">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {result ? (
          <span className={result.ok ? "pc-ok" : "pc-bad"} role="status">
            {result.ok ? result.message : result.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
