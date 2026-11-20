"use client";

import Link from "next/link";
import { useState } from "react";
import type { TessProfile } from "@/lib/crew/profile";
import { DIAL_KEYS, DIALS, MODE_IDS, MODES, openTopics, TOPICS, type Note, type NoteList, type TessSettings } from "@/lib/crew/tess-modes";
import { BACKGROUNDS, type Background } from "./soundPlan";
import styles from "./tess.module.css";
import { FADE_OPTIONS, TEXT_STYLES, type TextPrefs } from "./textPrefs";

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
  textPrefs,
  onTextPrefs,
  background,
  onBackground,
  soundOn,
  onSettings,
  onRemove,
  onWord,
}: {
  profile: TessProfile;
  busy: boolean;
  problem: string | null;
  textPrefs: TextPrefs;
  onTextPrefs: (next: TextPrefs) => void;
  background: Background;
  onBackground: (next: Background) => void;
  soundOn: boolean;
  onSettings: (next: TessSettings) => void;
  onRemove: (list: NoteList, id: string) => void;
  /** Add a word she listens for, or remove one. */
  onWord: (word: string, remove: boolean) => void;
}) {
  const [word, setWord] = useState("");
  const settings: TessSettings = { mode: profile.mode, length: profile.length, bluntness: profile.bluntness, pushback: profile.pushback };
  const locked = busy || !profile.ready;
  const open = openTopics(profile.learned);

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
        <h2>
          Background sound <span>this browser only</span>
        </h2>
        <div className={styles.dial}>
          <span>While she waits</span>
          <span className={styles.seg} role="radiogroup" aria-label="Background sound">
            {BACKGROUNDS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={background === o.id} title={o.note} onClick={() => onBackground(o.id)}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <p className={styles.topicLead}>
          {BACKGROUNDS.find((o) => o.id === background)?.note}
          {background === "gamma40" || background === "beta15" ? " It keeps playing while you work in another tab, and pauses while she listens or speaks." : ""}
          {soundOn ? "" : " Sound is switched off, so nothing plays until you turn it on."}
        </p>
      </section>

      <section className={styles.panel}>
        <h2>
          Her words on screen <span>this browser only</span>
        </h2>
        <div className={styles.dial}>
          <span>Style</span>
          <span className={styles.seg} role="radiogroup" aria-label="Text style">
            {TEXT_STYLES.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={textPrefs.style === o.id} onClick={() => onTextPrefs({ ...textPrefs, style: o.id })}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <div className={styles.dial}>
          <span>Fade away after</span>
          <span className={styles.seg} role="radiogroup" aria-label="Fade away after">
            {FADE_OPTIONS.map((o) => (
              <button key={o.seconds} type="button" role="radio" aria-checked={textPrefs.fadeSeconds === o.seconds} onClick={() => onTextPrefs({ ...textPrefs, fadeSeconds: o.seconds })}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        <p className={styles.topicLead}>Hidden means you only hear her. Everything said is kept in the archive either way.</p>
      </section>

      <section className={styles.panel}>
        <h2>Your master profile</h2>
        <p>{profile.about.trim() ? `She reads what you wrote about yourself (${profile.about.trim().length.toLocaleString()} characters) at the start of every conversation.` : "You have not written anything about yourself yet. She only knows what she has picked up."}</p>
        <p>{profile.businesses.trim() ? `Your notes on your businesses: ${profile.businesses.trim().length.toLocaleString()} characters.` : "No notes on your businesses yet."}</p>
        <Link className={styles.openFloor} href="/admin/settings#me">
          Edit in Settings
        </Link>
      </section>

      <section className={styles.panel}>
        <h2>
          Getting to know you <span>{TOPICS.length - open.length} of {TOPICS.length} topics</span>
        </h2>
        <div className={styles.bar}>
          <div style={{ width: `${Math.round(((TOPICS.length - open.length) / TOPICS.length) * 100)}%` }} />
        </div>
        {open.length ? (
          <>
            <p className={styles.topicLead}>She will ask about these over time: freely in Chat, at most once a sitting in Brief and Create, never in Focus or Lift.</p>
            <ul className={styles.topics}>
              {open.map((t) => (
                <li key={t.id}>{t.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.topicLead}>Every topic has an answer. She keeps saving what you tell her.</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2>
          Words she listens for <span>{profile.words.length || ""}</span>
        </h2>
        <p className={styles.topicLead}>Names and words she keeps getting wrong: people, pets, businesses, your own terms. They go with every recording of your voice. She adds one herself when you correct her. Lead names and page names are already included.</p>
        {profile.words.length ? (
          <div className={styles.words}>
            {profile.words.map((w) => (
              <button key={w} type="button" className={styles.word} onClick={() => onWord(w, true)} disabled={locked} aria-label={`Remove ${w}`} title="Remove">
                {w} <i aria-hidden>×</i>
              </button>
            ))}
          </div>
        ) : null}
        <form
          className={styles.wordForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!word.trim()) return;
            onWord(word.trim(), false);
            setWord("");
          }}
        >
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a name or word" aria-label="A word for Tess to listen for" maxLength={50} autoComplete="off" />
          <button type="submit" className={styles.botBtn} disabled={locked || !word.trim()}>
            Add
          </button>
        </form>
      </section>

      <Notes title="What she has learned" empty="Nothing yet. In Chat mode she saves what you tell her about yourself." list="learned" items={profile.learned} busy={locked} onRemove={onRemove} />
      <Notes title="Parked ideas" empty="Nothing parked. In Focus mode she parks side ideas here instead of chasing them." list="parked" items={profile.parked} busy={locked} onRemove={onRemove} />
    </>
  );
}
