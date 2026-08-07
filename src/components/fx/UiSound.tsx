"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Interface sound.
 *
 * Every sound is synthesised with the Web Audio API rather than loaded from a
 * file: the whole set costs zero bytes, has no first-play network stall, and
 * stays identical across browsers.
 *
 * Design brief was "barely there" — these sit at the edge of perception and
 * read as texture, not notification. Gains are intentionally tiny.
 *
 * OFF BY DEFAULT. A business visitor should never be surprised by audio; the
 * header toggle opts in and the choice persists. Browsers keep an AudioContext
 * suspended until a user gesture, and the toggle click is that gesture, so
 * there is no dead first interaction.
 */

const STORAGE_KEY = "ttai:sound";
const EVENT = "ttai:soundchange";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let lastHoverAt = 0;

function ensureContext() {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** A short pitched blip with an exponential decay — the workhorse. */
function blip(freq: number, peak: number, ms: number, type: OscillatorType = "sine", slideTo?: number) {
  const c = ensureContext();
  if (!c || !master) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const lp = c.createBiquadFilter();

  lp.type = "lowpass";
  lp.frequency.value = 5200;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + ms / 1000);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);

  osc.connect(gain).connect(lp).connect(master);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

/** Filtered noise burst — used for the airier transitions. */
function swoosh(from: number, to: number, peak: number, ms: number) {
  const c = ensureContext();
  if (!c || !master) return;
  const t = c.currentTime;
  const frames = Math.floor((c.sampleRate * ms) / 1000);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(from, t);
  bp.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);

  src.connect(bp).connect(gain).connect(master);
  src.start(t);
  src.stop(t + ms / 1000 + 0.02);
}

export type SoundName = "hover" | "click" | "cta" | "open" | "close" | "success";

export function playSound(name: SoundName) {
  if (!enabled) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  switch (name) {
    case "hover": {
      // Rate-limited: sweeping a cursor across a nav should not machine-gun.
      const now = performance.now();
      if (now - lastHoverAt < 55) return;
      lastHoverAt = now;
      blip(2100, 0.012, 22, "sine");
      break;
    }
    case "click":
      blip(1250, 0.026, 45, "triangle", 900);
      break;
    case "cta":
      // Two partials a fifth apart, resolving downward — reads as "committed".
      blip(680, 0.05, 95, "sine", 500);
      blip(1020, 0.022, 70, "sine", 760);
      break;
    case "open":
      swoosh(520, 1900, 0.02, 130);
      break;
    case "close":
      swoosh(1900, 520, 0.017, 120);
      break;
    case "success":
      blip(587, 0.045, 110, "sine");
      window.setTimeout(() => blip(880, 0.045, 160, "sine"), 90);
      break;
  }
}

/* ── Global wiring ──────────────────────────────────────────────────────── */

/**
 * Mounted once. Delegated listeners mean any link or button anywhere on the
 * site gets sound for free; opt a specific element out with `data-sfx="off"`,
 * or override its sound with `data-sfx="cta" | "open" | "success" | ...`.
 */
export function SoundEffects() {
  useEffect(() => {
    enabled = window.localStorage.getItem(STORAGE_KEY) === "on";

    const sync = () => {
      enabled = window.localStorage.getItem(STORAGE_KEY) === "on";
    };

    const interactive = (t: EventTarget | null) =>
      t instanceof Element
        ? t.closest<HTMLElement>('a, button, [role="button"], summary, [data-sfx]')
        : null;

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = interactive(e.target);
      if (!el || el.dataset.sfx === "off") return;
      // Only fire when genuinely entering the element, not moving within it.
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      playSound("hover");
    };

    const onClick = (e: MouseEvent) => {
      const el = interactive(e.target);
      if (!el || el.dataset.sfx === "off") return;
      const named = el.dataset.sfx;
      if (named && named !== "on") {
        playSound(named as SoundName);
        return;
      }
      playSound(el.classList.contains("btn-primary") ? "cta" : "click");
    };

    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("click", onClick);
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return null;
}

function subscribePref(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Header control. The preference is read as an external store rather than
 * synced into state from an effect, so there is no cascading render on mount.
 * Server snapshot is `false` — muted — which is also the correct default.
 */
export function SoundToggle({ className }: { className?: string }) {
  const on = useSyncExternalStore(
    subscribePref,
    () => window.localStorage.getItem(STORAGE_KEY) === "on",
    () => false
  );

  const toggle = useCallback(() => {
    const next = !on;
    enabled = next;
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    window.dispatchEvent(new Event(EVENT));
    // The click that turns sound on is also the gesture that unlocks audio.
    if (next) {
      const c = ensureContext();
      if (c?.state === "suspended") void c.resume();
      playSound("success");
    }
  }, [on]);

  return (
    <button
      type="button"
      onClick={toggle}
      data-sfx="off"
      aria-pressed={on}
      aria-label={on ? "Turn interface sound off" : "Turn interface sound on"}
      title={on ? "Sound on" : "Sound off"}
      className={className}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
        {on ? (
          <>
            <path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2" />
            <path d="M18.4 6.9a7.2 7.2 0 0 1 0 10.2" />
          </>
        ) : (
          <path d="M16.5 9.5l4.5 5M21 9.5l-4.5 5" />
        )}
      </svg>
    </button>
  );
}
