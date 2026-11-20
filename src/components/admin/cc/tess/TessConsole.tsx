"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { confirmPlaybookAction, setAgentPausedAction, setCrewPausedAction, type CrewActionResult } from "@/app/admin/crew-actions";
import type { Brief } from "@/lib/crew/brief";
import type { ChatLine } from "@/lib/crew/chat";
import { LeftPanels, RightPanels } from "./BriefPanels";
import type { TessState } from "./TessCore";
import styles from "./tess.module.css";
import { useSpeechInput } from "./useSpeechInput";

/**
 * The Tess tab: the Core in the middle, the brief either side, and the
 * conversation underneath.
 *
 * John talks by holding the space bar or typing. Tess's words arrive as she
 * writes them; when a voice is configured they are then spoken, and the
 * Core's surface follows the sound of her actual voice. Everything works by
 * typing alone: no microphone and no voice are both fine.
 */

const TessCore = dynamic(() => import("./TessCore"), { ssr: false });

const LABEL: Record<TessState, string> = { idle: "Waiting", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
const SOUND_KEY = "tess-sound";
const SOUND_EVENT = "tess-sound-change";

type StreamEvent =
  | { type: "state"; state: "thinking" | "speaking" | "idle" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

function subscribeSound(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_EVENT, onChange);
  };
}
const soundSnapshot = () => {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
};

function lastExchange(history: ChatLine[]): { you: string; line: string } {
  let line = "";
  let you = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (!line && history[i].role === "tess") line = history[i].text;
    else if (line && history[i].role === "john") {
      you = history[i].text;
      break;
    }
  }
  return { you, line };
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function TessConsole({ brief, history, voice }: { brief: Brief; history: ChatLine[]; voice: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState(false);
  const [state, setState] = useState<TessState>("idle");
  const [exchange, setExchange] = useState(() => lastExchange(history));
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const soundOn = useSyncExternalStore(subscribeSound, soundSnapshot, () => true);

  const busyRef = useRef(false);
  const pulseAt = useRef(0);
  const audio = useRef<{ el: HTMLAudioElement; url: string } | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const samples = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastSpoken = useRef("");

  /** 0 to 1: how loud Tess is right now. Her voice if it is playing, else the text arriving. */
  const getLevel = useCallback(() => {
    const node = analyser.current;
    const buffer = samples.current;
    if (node && buffer && audio.current && !audio.current.el.paused) {
      node.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);
    }
    return Math.max(0, 1 - (performance.now() - pulseAt.current) / 320) * 0.7;
  }, []);

  const stopVoice = useCallback(() => {
    const playing = audio.current;
    if (!playing) return;
    playing.el.pause();
    URL.revokeObjectURL(playing.url);
    audio.current = null;
  }, []);

  const playVoice = useCallback(
    async (text: string) => {
      lastSpoken.current = text;
      try {
        const res = await fetch("/api/admin/tess/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (res.status !== 200) return false;
        const url = URL.createObjectURL(await res.blob());
        stopVoice();
        const el = new Audio(url);
        audio.current = { el, url };
        try {
          const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) {
            const ctx = (audioCtx.current ??= new Ctx());
            if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
            const node = ctx.createAnalyser();
            node.fftSize = 512;
            ctx.createMediaElementSource(el).connect(node);
            node.connect(ctx.destination);
            analyser.current = node;
            samples.current = new Uint8Array(new ArrayBuffer(node.fftSize));
          }
        } catch {
          analyser.current = null; // She still speaks; the Core follows the text instead.
        }
        el.onended = () => {
          setState("idle");
          stopVoice();
        };
        setState("speaking");
        await el.play();
        setNeedsTap(false);
        return true;
      } catch {
        // The browser will not play sound until John has clicked something.
        stopVoice();
        setNeedsTap(true);
        return false;
      }
    },
    [stopVoice]
  );

  const ask = useCallback(
    async (message: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      stopVoice();
      setProblem(null);
      setNeedsTap(false);
      setExchange({ you: message.trim(), line: "" });
      setState("thinking");

      let said = "";
      try {
        const res = await fetch("/api/admin/tess/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Tess could not be reached.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const frames = pending.split("\n\n");
          pending = frames.pop() ?? "";
          for (const frame of frames) {
            if (!frame.startsWith("data: ")) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(frame.slice(6)) as StreamEvent;
            } catch {
              continue;
            }
            if (event.type === "text") {
              said += event.delta;
              pulseAt.current = performance.now();
              setExchange((prev) => ({ ...prev, line: said }));
            } else if (event.type === "state") {
              if (event.state !== "idle") setState(event.state);
            } else if (event.type === "error") {
              setProblem(event.message);
            }
          }
        }
      } catch (err) {
        setProblem(err instanceof Error ? err.message : "Tess could not be reached.");
      }

      const spoke = said.trim() && voice && soundSnapshot() ? await playVoice(said) : false;
      if (!spoke) setState("idle");
      busyRef.current = false;
      setBusy(false);
      // She may have saved a playbook, a target or a rule. Show it.
      router.refresh();
    },
    [playVoice, router, stopVoice, voice]
  );

  const speech = useSpeechInput({ onFinal: ask, holdSpace: true });

  // John has just opened the tab and there is no conversation to carry on: Tess speaks first.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || history.length) return;
    const timer = window.setTimeout(() => {
      greeted.current = true;
      void ask("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ask, history.length]);

  useEffect(
    () => () => {
      stopVoice();
      void audioCtx.current?.close().catch(() => undefined);
    },
    [stopVoice]
  );

  const run = useCallback(
    async (action: (fd: FormData) => Promise<CrewActionResult>, fields: Record<string, string>) => {
      setActing(true);
      setActionProblem(null);
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      try {
        const result = await action(fd);
        if (!result.ok) setActionProblem(result.error);
      } catch {
        setActionProblem("That did not go through. Try again.");
      }
      setActing(false);
      router.refresh();
    },
    [router]
  );

  const toggleSound = () => {
    const next = !soundOn;
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
    if (!next) {
      stopVoice();
      setState((s) => (s === "speaking" && !busyRef.current ? "idle" : s));
    }
  };

  const shown: TessState = speech.listening ? "listening" : state;
  const working = brief.crew.filter((c) => c.working).length;
  const modeLabel = brief.business ? (brief.business.mode === "launch" ? "Launch mode" : brief.business.mode === "setup" ? "Setting up" : "Watching") : "No business";

  return (
    <div className={`${styles.root} ${stage ? styles.stage : ""}`}>
      <div className={styles.stageArea}>
        <TessCore state={shown} getLevel={getLevel} crew={brief.crew} />
      </div>
      <div className={styles.vignette} />

      <div className={styles.top}>
        <span className={styles.name}>Tess</span>
        <span className={`${styles.chip} ${brief.business?.mode === "launch" ? styles.chipLaunch : ""}`}>
          {modeLabel}
          {brief.business ? (
            <>
              {" · "}
              <b>{brief.business.name}</b>
            </>
          ) : null}
        </span>
        {brief.crewPaused ? <span className={`${styles.chip} ${styles.chipPaused}`}>Crew paused</span> : null}
        <span className={styles.chip}>
          Crew <b>{brief.crew.length}</b> · working <b>{working}</b>
        </span>
        <span className={styles.chip}>
          Spend today <b>{money(brief.spendCentsToday)}</b> of {money(brief.capCents)}
        </span>
        <span className={styles.chip}>
          Rules learned <b>{brief.rulesCount}</b>
        </span>
        <span className={styles.spacer} />
        <span className={styles.modes} role="group" aria-label="View">
          <button type="button" aria-pressed={!stage} onClick={() => setStage(false)}>
            Briefing
          </button>
          <button type="button" aria-pressed={stage} onClick={() => setStage(true)}>
            Stage
          </button>
        </span>
        <button
          type="button"
          className={`${styles.btn} ${brief.crewPaused ? styles.btnResume : styles.btnPause}`}
          disabled={acting}
          onClick={() => run(setCrewPausedAction, { paused: String(!brief.crewPaused) })}
        >
          {brief.crewPaused ? "Resume crew" : "Pause crew"}
        </button>
      </div>

      <div className={styles.state} aria-live="polite">
        {LABEL[shown]}
      </div>

      <div className={`${styles.col} ${styles.colLeft}`}>
        <LeftPanels
          brief={brief}
          busy={acting}
          problem={actionProblem}
          onConfirm={() => (brief.business ? run(confirmPlaybookAction, { business_id: brief.business.id }) : undefined)}
        />
      </div>
      <div className={`${styles.col} ${styles.colRight}`}>
        <RightPanels brief={brief} busy={acting} onPauseBot={(slug, paused) => run(setAgentPausedAction, { slug, paused: String(paused) })} />
      </div>

      <div className={styles.voice}>
        <div className={styles.said} aria-live="polite">
          {speech.listening ? (
            <span className={styles.you}>You: {speech.transcript || "…"}</span>
          ) : exchange.you ? (
            <span className={styles.you}>You: {exchange.you}</span>
          ) : null}
          <span>{exchange.line}</span>
          {problem ? <span className={styles.problem}>{problem}</span> : null}
          {speech.error ? <span className={styles.problem}>{speech.error}</span> : null}
        </div>

        <form
          className={styles.talk}
          onSubmit={(e) => {
            e.preventDefault();
            const message = draft.trim();
            if (!message || busy) return;
            setDraft("");
            void ask(message);
          }}
        >
          <input
            className={styles.field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={busy ? "Tess is answering…" : "Ask Tess anything about the business"}
            aria-label="Message to Tess"
            maxLength={4000}
            autoComplete="off"
          />
          {speech.supported ? (
            <button
              type="button"
              className={`${styles.round} ${speech.listening ? styles.roundLive : ""}`}
              onPointerDown={() => speech.start()}
              onPointerUp={() => speech.stop()}
              onPointerLeave={() => (speech.listening ? speech.stop() : undefined)}
              disabled={busy}
              aria-label="Hold to talk"
            >
              {speech.listening ? "Listening" : "Hold to talk"}
            </button>
          ) : null}
          {voice ? (
            <button type="button" className={styles.round} onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? "Voice on" : "Voice off"}
            </button>
          ) : null}
          <button type="submit" className={styles.round} disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>

        <div className={styles.hint}>
          {needsTap && lastSpoken.current ? (
            <button type="button" className={styles.botBtn} onClick={() => void playVoice(lastSpoken.current).then((ok) => (ok ? undefined : setState("idle")))}>
              Your browser held the sound back. Click here to hear her.
            </button>
          ) : speech.supported ? (
            "Hold the space bar to talk, or type."
          ) : (
            "Type to talk to Tess. This browser has no speech recognition; Chrome and Edge do."
          )}
        </div>
      </div>
    </div>
  );
}
