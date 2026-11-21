"use client";

import { useActionState } from "react";
import { recordGuideAction, type GuideRecordState } from "@/app/admin/guide-actions";

/** The one button that spends speech credit: it records the lines that have no recording. */
export default function GuideRecorder({ canRecord, voiceReady, missing, batch }: { canRecord: boolean; voiceReady: boolean; missing: number; batch: number }) {
  const [state, action, pending] = useActionState<GuideRecordState, FormData>(recordGuideAction, null);
  if (!canRecord) return <p className="sv-muted">Only an owner or admin can record.</p>;
  if (!voiceReady) return <p className="sv-muted">No voice is set up, so lines cannot be recorded yet.</p>;
  return (
    <form action={action}>
      <button className="cc-btn primary" disabled={pending || missing === 0}>{pending ? "Recording, this takes a minute" : missing === 0 ? "Nothing to record" : `Record ${Math.min(missing, batch)} of ${missing} line${missing === 1 ? "" : "s"}`}</button>
      {state ? <p role="status" style={{ marginTop: 8 }} className={state.ok ? "" : "cc-error"}>{state.message}</p> : null}
    </form>
  );
}
