"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  archiveCampaignAction,
  duplicateCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  unscheduleCampaignAction,
} from "@/app/admin/email-actions";
import { IconMenu } from "../Icons";
import type { CampaignStatus } from "@/lib/email-marketing/types";

/**
 * The per-row action menu.
 *
 * Items that would not apply are not rendered. "Unschedule" only exists on a
 * scheduled campaign, "Resume" only on a paused one. A menu of greyed-out
 * items teaches people to stop opening the menu.
 *
 * Sending is deliberately ABSENT from here. Mailing eighteen hundred people
 * is not a row-menu action — it happens on the campaign's own page, behind
 * the pre-send checks, where the audience size is on screen.
 */
export default function CampaignRowActions({
  campaignId,
  status,
  canSend,
}: {
  campaignId: string;
  status: CampaignStatus;
  canSend: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const base = `/admin/marketing/email/campaigns/${campaignId}`;

  const run = (action: (fd: FormData) => Promise<void>, confirmText?: string) => (fd: FormData) =>
    startTransition(async () => {
      setError(null);
      if (confirmText && !window.confirm(confirmText)) return;
      try {
        await action(fd);
        setOpen(false);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        setError(err instanceof Error ? err.message : "That did not work.");
      }
    });

  return (
    <div className="cc-menu-wrap" ref={wrap}>
      <button
        type="button"
        className="cc-icon-btn"
        style={{ width: 28, height: 28 }}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Campaign actions"
      >
        <IconMenu size={14} />
      </button>

      {open ? (
        <div className="cc-pop" role="menu">
          <Link className="cc-pop-item" role="menuitem" href={base}>View</Link>
          {status !== "sent" && status !== "sending" ? (
            <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=content`}>Edit content</Link>
          ) : null}
          <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=audience`}>Audience</Link>
          <Link className="cc-pop-item" role="menuitem" href={`${base}?tab=performance`}>Analytics</Link>

          <div className="cc-pop-sep" />
          <form action={run(duplicateCampaignAction)}>
            <input type="hidden" name="campaign_id" value={campaignId} />
            <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
              Duplicate
            </button>
          </form>

          {canSend && status === "scheduled" ? (
            <form action={run(unscheduleCampaignAction, "Clear the schedule and move this back to draft?")}>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                Unschedule
              </button>
            </form>
          ) : null}

          {canSend && (status === "scheduled" || status === "sending") ? (
            <form
              action={run(
                pauseCampaignAction,
                "Pause this campaign?\n\nAnything already sent has gone — pausing holds the rest of the queue, it does not recall mail."
              )}
            >
              <input type="hidden" name="campaign_id" value={campaignId} />
              <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                Pause
              </button>
            </form>
          ) : null}

          {canSend && status === "paused" ? (
            <form action={run(resumeCampaignAction)}>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
                Resume
              </button>
            </form>
          ) : null}

          <div className="cc-pop-sep" />
          <form action={run(archiveCampaignAction, "Archive this campaign?")}>
            <input type="hidden" name="campaign_id" value={campaignId} />
            <button type="submit" className="cc-pop-item" role="menuitem" disabled={pending}>
              Archive
            </button>
          </form>

          {error ? (
            <p className="cc-note" style={{ margin: "4px 10px 8px", maxWidth: 260 }}>{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
