"use client";

import { useState } from "react";
import { IconSpark, IconX } from "../Icons";

type Ranked = { id: string; title: string; reason: string; href: string };

/**
 * AI Prioritize My Day.
 *
 * The button asks the server; the server builds the whole picture from the
 * database and asks the model. Nothing about the business is sent from here —
 * a request can pick who is asking and nothing else.
 *
 * When no model is configured this says so plainly rather than showing a
 * made-up list, because a fake ranking is worse than no ranking.
 */
export default function PrioritizeButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [headline, setHeadline] = useState<string | null>(null);
  const [items, setItems] = useState<Ranked[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    setItems([]);
    setHeadline(null);
    try {
      const response = await fetch("/api/admin/tasks/prioritize", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string; headline?: string; items?: Ranked[];
      };
      if (!response.ok) {
        setError(body.error ?? "That did not come back. Try again in a moment.");
      } else {
        setHeadline(body.headline ?? null);
        setItems(body.items ?? []);
      }
    } catch {
      setError("Could not reach the prioritiser. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="tk-ai" onClick={run} disabled={busy}>
        <IconSpark size={14} />
        {busy ? "Reading your board…" : "AI Prioritize My Day"}
      </button>

      {open ? (
        <div className="tk-ai-panel" role="dialog" aria-label="Today's priorities">
          <div className="tk-ai-head">
            <IconSpark size={14} />
            <b>Top priorities today</b>
            <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              <IconX size={13} />
            </button>
          </div>

          {busy ? <p className="cc-note">Working through your open tasks…</p> : null}
          {error ? <p className="tk-ai-error">{error}</p> : null}
          {headline ? <p className="tk-ai-headline">{headline}</p> : null}

          {items.length > 0 ? (
            <ol className="tk-ai-list">
              {items.map((item, index) => (
                <li key={item.id}>
                  <span className="tk-ai-rank">{index + 1}</span>
                  <div>
                    <a href={item.href}>{item.title}</a>
                    <span>{item.reason}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {!busy && !error && items.length === 0 && headline ? (
            <p className="cc-note">Nothing is pressing enough to rank right now.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
