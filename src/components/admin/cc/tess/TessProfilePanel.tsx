"use client";

import Link from "next/link";
import type { TessProfile } from "@/lib/crew/profile";
import { DIAL_KEYS, DIALS, MODE_IDS, MODES, type Note, type NoteList, type TessSettings } from "@/lib/crew/tess-modes";
import styles from "./tess.module.css";

/**
 * Tess's profile, on the Tess tab: the mode she is in, her three dials, what
 * she has learned about John and the ideas she parked for him. Every line she
 * saved can be read and removed here.
 */

function Notes({ title, empty, list, items, busy, onRemove }: { title: string; empty: string; list: NoteList; items: Note[]; busy: boolean; onRemove: (list: NoteList, id: string) => void }) {
  return (
    <section className={styles.panel}>
      <h2>
        {title} <span>{items.length || ""}</span>
      </h2>
      {items.length ? (
        [...items].reverse().map((n) => (
          <div key={n.id} className={styles.noteRow}>
            <span>{n.text}</span>
            <button type="button" className={styles.botBtn} onClick={() => onRemove(list, n.id)} disabled={busy} aria-label={`Remove: ${n.text}`}>
              Remove
            </button>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export default function TessProfilePanel({
  profile,
  busy,
  problem,
  onSettings,
  onRemove,
}: {
  profile: TessProfile;
  busy: boolean;
  problem: string | null;
  onSettings: (next: TessSettings) => void;
  onRemove: (list: NoteList, id: string) => void;
}) {
  const settings: TessSettings = { mode: profile.mode, length: profile.length, bluntness: profile.bluntness, pushback: profile.pushback };
  const locked = busy || !profile.ready;

  return (
    <>
      <section className={styles.panel}>
        <h2>
          Mode <span>changes with your next message</span>
        </h2>
        {!profile.ready ? <p className={styles.note}>Her profile table is not in the database yet, so nothing here can be saved. Run 20261120020000_tess_profile.sql in Supabase.</p> : null}
        <div className={styles.modeList} role="radiogroup" aria-label="Mode">
          {MODE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={profile.mode === id}
              className={`${styles.modeBtn} ${profile.mode === id ? styles.modeOn : ""}`}
              disabled={locked}
              onClick={() => (profile.mode === id ? undefined : onSettings({ ...settings, mode: id }))}
            >
              <b>{MODES[id].label}</b>
              <small>{MODES[id].blurb}</small>
            </button>
          ))}
        </div>
        {problem ? <p className={styles.note}>{problem}</p> : null}
      </section>

      <section className={styles.panel}>
        <h2>How she answers</h2>
        {DIAL_KEYS.map((key) => (
          <div key={key} className={styles.dial}>
            <span>{DIALS[key].label}</span>
            <span className={styles.seg} role="radiogroup" aria-label={DIALS[key].label}>
              {DIALS[key].options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={settings[key] === o.id}
                  disabled={locked}
                  title={o.instructions}
                  onClick={() => (settings[key] === o.id ? undefined : onSettings({ ...settings, [key]: o.id }))}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <h2>Your master profile</h2>
        <p>{profile.about.trim() ? `She reads what you wrote about yourself (${profile.about.trim().length.toLocaleString()} characters) at the start of every conversation.` : "You have not written anything about yourself yet. She only knows what she has picked up."}</p>
        <p>{profile.businesses.trim() ? `Your notes on your businesses: ${profile.businesses.trim().length.toLocaleString()} characters.` : "No notes on your businesses yet."}</p>
        <Link className={styles.openFloor} href="/admin/settings#me">
          Edit in Settings
        </Link>
      </section>

      <Notes title="What she has learned" empty="Nothing yet. In Chat mode she saves what you tell her about yourself." list="learned" items={profile.learned} busy={locked} onRemove={onRemove} />
      <Notes title="Parked ideas" empty="Nothing parked. In Focus mode she parks side ideas here instead of chasing them." list="parked" items={profile.parked} busy={locked} onRemove={onRemove} />
    </>
  );
}
