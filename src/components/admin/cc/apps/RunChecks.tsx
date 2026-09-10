"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { runChecksAction, type AppActionState } from "@/app/admin/app-actions";
import { IconPulse } from "../Icons";

const INITIAL: AppActionState = {};

/**
 * The only control in the module that can turn a health badge green.
 *
 * It runs real probes — HTTP requests, TLS handshakes, provider calls — and
 * writes what came back. If it has nothing to look at it says so rather
 * than reporting success over an empty run.
 */
export default function RunChecks({
  appId,
  label = "Run health checks",
  canManage,
}: {
  appId?: string;
  label?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, action, running] = useActionState(runChecksAction, INITIAL);

  useEffect(() => {
    if (state.completedAt) router.refresh();
  }, [state.completedAt, router]);

  if (!canManage) return null;

  return (
    <>
      <form action={action}>
        {appId ? <input type="hidden" name="app_id" value={appId} /> : null}
        <button type="submit" className="cc-btn" disabled={running}>
          <IconPulse size={15} />
          <span>{running ? "Checking…" : label}</span>
        </button>
      </form>
      {state.success ? <span className="cc-chip t-ok" role="status">{state.success}</span> : null}
      {state.error ? <span className="cc-chip t-risk" role="alert">{state.error}</span> : null}
    </>
  );
}
