"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pullAppReportNow } from "@/app/admin/app-report-actions";
import { IconPulse } from "../Icons";

/**
 * Asks the product for a fresh report right now instead of waiting for the
 * hourly job. Reading a report changes nothing in the product, so there is
 * nothing to confirm. If the pull fails the reason is shown here, beside the
 * numbers, and the last good report stays on screen.
 */
export default function PullNowButton({ appId }: { appId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pull = () => {
    setError(null);
    setDone(false);
    start(async () => {
      try {
        const result = await pullAppReportNow(appId);
        if (result.ok) {
          setDone(true);
          router.refresh();
        } else {
          setError(result.error ?? "The pull did not finish. Try again.");
          router.refresh();
        }
      } catch {
        setError("The pull did not finish. Try again.");
      }
    });
  };

  return (
    <>
      <button type="button" className="cc-btn" onClick={pull} disabled={pending}>
        <IconPulse size={15} />
        <span>{pending ? "Pulling…" : "Pull now"}</span>
      </button>
      {done && !pending ? <span className="cc-chip t-ok" role="status">Fresh report pulled</span> : null}
      {error && !pending ? <span className="cc-chip t-warn" role="alert">{error}</span> : null}
    </>
  );
}
