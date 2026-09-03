"use client";

import { useTransition } from "react";
import { IconArrowRight } from "../Icons";

/**
 * Start Meeting.
 *
 * One click: the tab opens and the meeting moves to In Progress.
 *
 * The window is opened FIRST, synchronously, before anything is awaited.
 * Opening it after a server round-trip is what every popup blocker exists to
 * stop, and the person would be left clicking a button that appears to do
 * nothing. Marking the status is the part that is allowed to be slow.
 */
export default function StartMeetingButton({
  url,
  meetingId,
  markInProgress,
  label = "Start meeting",
  compact = false,
}: {
  url: string;
  meetingId: string;
  markInProgress: (formData: FormData) => void | Promise<void>;
  label?: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={compact ? "cc-btn primary is-sm" : "cc-btn primary"}
      onClick={() => {
        window.open(url, "_blank", "noopener,noreferrer");
        const data = new FormData();
        data.set("meeting_id", meetingId);
        data.set("status", "in_progress");
        startTransition(() => { void markInProgress(data); });
      }}
    >
      <IconArrowRight size={14} /> {pending ? "Starting…" : label}
    </button>
  );
}
