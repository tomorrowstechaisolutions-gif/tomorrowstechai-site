"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { ORB_EVENT, ORB_KEY, orbLayout, orbShows, pageForPath, parseOrbSpot, type OrbSpot } from "./pages";
import type { TessState } from "./TessCore";
import { useTess } from "./TessProvider";
import styles from "./tessOrb.module.css";

/**
 * Tess as a small ball that follows John around the admin. It shows on
 * every page except her own full screen, pulses with what she is doing, and
 * opens a small panel with her words, a place to type and the talk button.
 * John can drag it out of the way; it stays where he leaves it.
 *
 * It is only a view: the conversation, her voice and her hearing run in
 * TessProvider, which is why she keeps talking while the page changes.
 */

const LABEL: Record<TessState, string> = { idle: "Waiting", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
const DRAG_START = 5;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ORB_EVENT, onChange);
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ORB_EVENT, onChange);
    window.removeEventListener("resize", onChange);
  };
}
/** Where the ball was left and the size of the screen, as one string so React can compare it. */
const snapshot = () => {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(ORB_KEY);
  } catch {
    /* private mode: the ball starts in its corner */
  }
  return `${window.innerWidth}x${window.innerHeight}|${saved ?? ""}`;
};

export default function TessOrb() {
  const tess = useTess();
  const pathname = usePathname();
  const screen = useSyncExternalStore(subscribe, snapshot, () => null);
  const [open, setOpen] = useState(false);
  /** The exchange John closed the panel on. It stays closed until he says something new. */
  const [closedOn, setClosedOn] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** Where the ball is while it is being dragged. */
  const [dragSpot, setDragSpot] = useState<OrbSpot | null>(null);
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const ball = useRef<HTMLButtonElement>(null);

  // The ball swells with her voice. Set straight on the element so sixty changes a second cost no renders.
  const lively = tess.state === "speaking" || tess.busy;
  const getLevel = tess.getLevel;
  useEffect(() => {
    const el = ball.current;
    if (!el || !lively) return;
    let frame = 0;
    const tick = () => {
      el.style.setProperty("--lvl", getLevel().toFixed(3));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      el.style.setProperty("--lvl", "0");
    };
  }, [lively, getLevel, screen]);

  if (!screen || !orbShows(pathname)) return null;

  const [size, saved] = [screen.slice(0, screen.indexOf("|")), screen.slice(screen.indexOf("|") + 1)];
  const [width, height] = size.split("x").map(Number);
  const layout = orbLayout(dragSpot ?? parseOrbSpot(saved), { width, height });

  const hiddenText = tess.textPrefs.style === "hidden";
  const anyProblem = tess.problem || tess.speech.error || tess.voiceProblem || tess.hearingProblem;
  const hasWords = Boolean(tess.exchange.you || tess.exchange.line);
  const active = tess.speech.listening || tess.speech.working || tess.busy || tess.state === "speaking";
  // The panel opens by itself while something is happening and her words are still up, unless John closed it.
  const wantsOpen = !hiddenText && (active || (hasWords && !tess.faded));
  const closed = closedOn === tess.exchange.you && !tess.speech.listening;
  const showPanel = open || ((wantsOpen || Boolean(anyProblem)) && !closed);
  const page = pageForPath(pathname);

  const close = () => {
    setOpen(false);
    setClosedOn(tess.exchange.you);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, right: layout.right, bottom: layout.bottom, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_START) return;
    d.moved = true;
    setDragSpot({ right: d.right - dx, bottom: d.bottom - dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    justDragged.current = true;
    try {
      window.localStorage.setItem(ORB_KEY, JSON.stringify({ right: layout.right, bottom: layout.bottom }));
    } catch {
      /* private mode: it goes back to its corner on the next page */
    }
    window.dispatchEvent(new Event(ORB_EVENT));
    setDragSpot(null);
  };
  const onClick = () => {
    // The click that ends a drag is not a tap on the ball.
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (showPanel) close();
    else {
      setClosedOn(null);
      setOpen(true);
    }
  };

  return (
    <div
      className={`${styles.orb} ${layout.panelBelow ? styles.below : ""} ${layout.panelLeft ? styles.left : ""}`}
      style={{ right: layout.right, bottom: layout.bottom }}
    >
      {showPanel ? (
        <section className={styles.panel} aria-label="Tess">
          <header className={styles.head}>
            <span className={styles.title}>Tess</span>
            <span className={styles.status} aria-live="polite">
              {LABEL[tess.state]}
            </span>
            <span className={styles.spacer} />
            <Link className={styles.link} href="/admin/ai">
              Full screen
            </Link>
            <button type="button" className={styles.x} onClick={close} aria-label="Close Tess's panel">
              ×
            </button>
          </header>

          <div className={styles.said} aria-live="polite">
            {hiddenText ? (
              <span className={styles.note}>Her words are hidden. You will hear her.</span>
            ) : tess.speech.listening ? (
              <span className={styles.you}>You: {tess.speech.transcript || (tess.speech.live ? "I am listening, go ahead…" : "Opening the microphone…")}</span>
            ) : tess.speech.working ? (
              <span className={styles.you}>You: working out what you said…</span>
            ) : tess.exchange.you ? (
              <span className={styles.you}>You: {tess.exchange.you}</span>
            ) : null}
            {!hiddenText && tess.exchange.line ? <span className={styles.line}>{tess.exchange.line}</span> : null}
            {!hiddenText && !hasWords && !active ? <span className={styles.note}>I am here. Ask me about {page ? page.label : "this page"}, or tell me where to go next.</span> : null}
            {tess.problem ? <span className={styles.problem}>{tess.problem}</span> : null}
            {tess.speech.error ? <span className={styles.problem}>{tess.speech.error}</span> : null}
            {tess.hearingProblem && !tess.speech.error ? <span className={styles.problem}>{tess.hearingProblem}</span> : null}
            {tess.voiceProblem ? <span className={styles.problem}>{tess.voiceProblem}</span> : null}
            {tess.needsTap ? <span className={styles.note}>Your browser held her voice back. Click anywhere or press a key to hear her.</span> : null}
          </div>

          <form
            className={styles.talk}
            onSubmit={(e) => {
              e.preventDefault();
              const message = draft.trim();
              if (!message || tess.busy) return;
              setDraft("");
              void tess.ask(message);
            }}
          >
            <input
              className={styles.field}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tess.busy ? "Tess is answering…" : `Ask about ${page ? page.label : "this page"}`}
              aria-label="Message to Tess"
              maxLength={4000}
              autoComplete="off"
            />
            <button type="submit" className={styles.btn} disabled={tess.busy || !draft.trim()}>
              Send
            </button>
          </form>

          <div className={styles.row}>
            {tess.speech.supported ? (
              <button
                type="button"
                className={`${styles.btn} ${tess.speech.listening ? styles.btnLive : ""}`}
                onClick={() => (tess.speech.listening ? tess.speech.stop() : tess.speech.start("tap"))}
                disabled={(tess.busy || tess.speech.working) && !tess.speech.listening}
                aria-pressed={tess.speech.listening}
              >
                {tess.speech.listening ? "Listening · tap to send" : tess.speech.working ? "Hearing you…" : "Tap to talk"}
              </button>
            ) : null}
            <button type="button" className={styles.btn} onClick={tess.toggleSound} aria-pressed={tess.soundOn}>
              {tess.soundOn ? "Sound on" : "Sound off"}
            </button>
            <span className={styles.hint}>{tess.speech.supported ? "or hold space" : "type to talk"}</span>
          </div>
        </section>
      ) : null}

      <button
        ref={ball}
        type="button"
        className={`${styles.ball} ${styles[tess.state]} ${dragSpot ? styles.dragging : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-expanded={showPanel}
        aria-label={`Tess: ${LABEL[tess.state].toLowerCase()}. ${showPanel ? "Close" : "Open"} her panel. Drag to move.`}
        title="Tess · click to talk, drag to move"
      >
        <i className={styles.ring} aria-hidden />
        <i className={styles.core} aria-hidden />
      </button>
    </div>
  );
}
