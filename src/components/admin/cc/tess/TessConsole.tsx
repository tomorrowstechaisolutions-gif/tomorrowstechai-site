"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { confirmPlaybookAction, removeTessNoteAction, setAgentPausedAction, setCrewPausedAction, setTessSettingsAction, type CrewActionResult } from "@/app/admin/crew-actions";
import type { Brief } from "@/lib/crew/brief";
import type { ChatLine } from "@/lib/crew/chat";
import type { TessProfile } from "@/lib/crew/profile";
import { MODES } from "@/lib/crew/tess-modes";
import { LeftPanels, RightPanels } from "./BriefPanels";
import { BACKGROUND_EVENT, BACKGROUND_KEY, parseBackground, playsWhileHidden, soundPlan, type Background } from "./soundPlan";
import type { TessState } from "./TessCore";
import TessProfilePanel from "./TessProfilePanel";
import styles from "./tess.module.css";
import { createTessSounds, type TessSounds } from "./tessSounds";
import { parseTextPrefs, TEXT_EVENT, TEXT_KEY, TEXT_PREV_KEY, textFaded, type TextPrefs, type TextStyle } from "./textPrefs";
import { useRecorderInput } from "./useRecorderInput";
import { useSpeechInput } from "./useSpeechInput";

/**
 * The Tess tab: the Core in the middle, the brief either side, and the
 * conversation underneath. Three views: Briefing, Stage (the Core alone) and
 * Profile, which swaps the right-hand column for her mode, dials and notes.
 *
 * John talks by tapping the talk button, holding the space bar, or typing. Tess's words arrive as she
 * writes them; when a voice is configured they are then spoken, and the
 * Core's surface follows the sound of her actual voice. Everything works by
 * typing alone: no microphone and no voice are both fine. Besides her voice
 * she makes small sounds of her own for each state (see tessSounds.ts); the
 * Sound button switches both off.
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

function subscribeBackground(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(BACKGROUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(BACKGROUND_EVENT, onChange);
  };
}
const backgroundSnapshot = (): Background => {
  try {
    return parseBackground(window.localStorage.getItem(BACKGROUND_KEY));
  } catch {
    return parseBackground(null);
  }
};
/** Her sounds are on, and either the tab is in view or the background is one that keeps going out of view. */
const soundsAudible = () => soundSnapshot() && (!document.hidden || playsWhileHidden(backgroundSnapshot()));

function subscribeText(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(TEXT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TEXT_EVENT, onChange);
  };
}
const textSnapshot = () => {
  try {
    return window.localStorage.getItem(TEXT_KEY);
  } catch {
    return null;
  }
};
const WRAP: Record<TextStyle, string> = { classic: "", comic: "wrapComic", tech: "wrapTech", hidden: "" };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function TessConsole({ brief, history, profile, voice }: { brief: Brief; history: ChatLine[]; profile: TessProfile; voice: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"briefing" | "stage" | "profile">("briefing");
  const stage = view === "stage";
  const [profileProblem, setProfileProblem] = useState<string | null>(null);
  const [state, setState] = useState<TessState>("idle");
  const [exchange, setExchange] = useState(() => lastExchange(history));
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [voiceProblem, setVoiceProblem] = useState<string | null>(null);
  const heldBack = useRef(false);
  const soundOn = useSyncExternalStore(subscribeSound, soundSnapshot, () => true);
  const background = useSyncExternalStore(subscribeBackground, backgroundSnapshot, () => parseBackground(null));
  const textRaw = useSyncExternalStore(subscribeText, textSnapshot, () => null);
  const textPrefs = useMemo(() => parseTextPrefs(textRaw), [textRaw]);
  /** Her words have been up for the chosen time since she went quiet. */
  const [fadeDue, setFadeDue] = useState(false);
  /** John brought the faded words back; they stay until the next exchange. */
  const [pinned, setPinned] = useState(false);

  const busyRef = useRef(false);
  const pulseAt = useRef(0);
  const audio = useRef<{ el: HTMLAudioElement; url: string } | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const samples = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastSpoken = useRef("");
  const sounds = useRef<TessSounds | null>(null);

  /** One audio context for her voice and her sounds. The browser only lets it make sound after a click or key press. */
  const ensureCtx = useCallback(() => {
    if (audioCtx.current) return audioCtx.current;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx.current = new Ctx();
    return audioCtx.current;
  }, []);

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
      setVoiceProblem(null);
      let url: string;
      try {
        const res = await fetch("/api/admin/tess/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (res.status === 204) return false; // nothing to say
        if (res.status !== 200) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setVoiceProblem(body?.error ?? "Her voice did not answer, so this one is text only.");
          return false;
        }
        url = URL.createObjectURL(await res.blob());
      } catch {
        setVoiceProblem("Her voice could not be reached, so this one is text only.");
        return false;
      }
      try {
        stopVoice();
        const el = new Audio(url);
        audio.current = { el, url };
        try {
          const ctx = ensureCtx();
          if (ctx) {
            // Not awaited: before the first click this would wait forever.
            if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
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
        heldBack.current = false;
        setNeedsTap(false);
        return true;
      } catch {
        // The browser will not play sound until John has clicked or pressed something. The next click plays it.
        stopVoice();
        heldBack.current = true;
        setNeedsTap(true);
        return false;
      }
    },
    [ensureCtx, stopVoice]
  );

  const ask = useCallback(
    async (message: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      stopVoice();
      setProblem(null);
      setNeedsTap(false);
      heldBack.current = false;
      setFadeDue(false);
      setPinned(false);
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

  // Two ways to hear John. With a voice service configured, his words are recorded and transcribed on the
  // server, which is far more accurate. Without one, the browser's own speech recognition is used.
  const recorder = useRecorderInput({ onFinal: ask, holdSpace: voice });
  const useRecorder = voice && recorder.supported && !recorder.refused;
  const browserSpeech = useSpeechInput({ onFinal: ask, holdSpace: !useRecorder });
  const speech = useRecorder ? recorder : browserSpeech;

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
      sounds.current?.dispose();
      sounds.current = null;
      void audioCtx.current?.close().catch(() => undefined);
      audioCtx.current = null;
      analyser.current = null;
    },
    [stopVoice]
  );

  const shown: TessState = speech.listening ? "listening" : state;

  // Her own sounds. They start at the first click or key press, which is when the browser allows sound.
  const shownRef = useRef<TessState>(shown);
  useEffect(() => {
    const wake = () => {
      const ctx = ensureCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      if (!sounds.current) {
        sounds.current = createTessSounds(ctx);
        sounds.current.setBackground(backgroundSnapshot());
        sounds.current.setOn(soundsAudible());
        sounds.current.setBed(soundPlan(shownRef.current, shownRef.current).bed);
      }
      // What she said before the browser allowed sound: say it now.
      if (heldBack.current && lastSpoken.current && soundSnapshot() && !busyRef.current) {
        heldBack.current = false;
        void playVoice(lastSpoken.current).then((ok) => (ok ? undefined : setState("idle")));
      }
    };
    const visibility = () => sounds.current?.setOn(soundsAudible());
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [ensureCtx, playVoice]);

  useEffect(() => {
    const plan = soundPlan(shownRef.current, shown);
    shownRef.current = shown;
    if (plan.chirp) sounds.current?.chirp(plan.chirp);
    sounds.current?.setBed(plan.bed);
  }, [shown]);

  useEffect(() => {
    sounds.current?.setBackground(background);
    sounds.current?.setOn(soundOn && (!document.hidden || playsWhileHidden(background)));
  }, [soundOn, background]);

  const saveBackground = useCallback((next: Background) => {
    try {
      window.localStorage.setItem(BACKGROUND_KEY, next);
    } catch {
      /* private mode: the choice cannot be kept */
    }
    window.dispatchEvent(new Event(BACKGROUND_EVENT));
  }, []);

  // Her words leave the screen a little while after she goes quiet. They are kept in the archive.
  const quiet = !busy && shown === "idle";
  useEffect(() => {
    if (!quiet || !textPrefs.fadeSeconds || pinned) return;
    const timer = window.setTimeout(() => setFadeDue(true), textPrefs.fadeSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [quiet, textPrefs.fadeSeconds, pinned, exchange.line]);
  const faded = textFaded({
    fadeSeconds: textPrefs.fadeSeconds,
    busy,
    listening: speech.listening,
    speaking: shown === "speaking",
    pinned,
    idleForMs: fadeDue && quiet ? textPrefs.fadeSeconds * 1000 : 0,
  });

  const saveTextPrefs = useCallback((next: TextPrefs) => {
    try {
      window.localStorage.setItem(TEXT_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the choice cannot be kept */
    }
    window.dispatchEvent(new Event(TEXT_EVENT));
  }, []);

  /** Text on or off: off hides her words (she is only heard); on goes back to the style in use before. */
  const toggleText = () => {
    if (textPrefs.style !== "hidden") {
      try {
        window.localStorage.setItem(TEXT_PREV_KEY, textPrefs.style);
      } catch {
        /* nothing to remember it in */
      }
      saveTextPrefs({ ...textPrefs, style: "hidden" });
      return;
    }
    let previous: string | null = null;
    try {
      previous = window.localStorage.getItem(TEXT_PREV_KEY);
    } catch {
      /* fall through to the default */
    }
    saveTextPrefs({ ...textPrefs, style: parseTextPrefs(JSON.stringify({ style: previous })).style });
  };

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

  /** Same as `run`, but a failure shows on the profile panel. */
  const runProfile = useCallback(
    async (action: (fd: FormData) => Promise<CrewActionResult>, fields: Record<string, string>) => {
      setActing(true);
      setProfileProblem(null);
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      try {
        const result = await action(fd);
        if (!result.ok) setProfileProblem(result.error);
      } catch {
        setProfileProblem("That did not go through. Try again.");
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
      heldBack.current = false;
      setNeedsTap(false);
      stopVoice();
      setState((s) => (s === "speaking" && !busyRef.current ? "idle" : s));
    }
  };

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
        <span className={styles.chip}>
          Mode <b>{MODES[profile.mode].label}</b>
        </span>
        <span className={styles.spacer} />
        <Link className={styles.btn} href="/admin/ai/archive">
          Archive
        </Link>
        <span className={styles.modes} role="group" aria-label="View">
          <button type="button" aria-pressed={view === "briefing"} onClick={() => setView("briefing")}>
            Briefing
          </button>
          <button type="button" aria-pressed={stage} onClick={() => setView("stage")}>
            Stage
          </button>
          <button type="button" aria-pressed={view === "profile"} onClick={() => setView("profile")}>
            Profile
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
        {view === "profile" ? (
          <TessProfilePanel
            profile={profile}
            busy={acting}
            problem={profileProblem}
            textPrefs={textPrefs}
            onTextPrefs={saveTextPrefs}
            background={background}
            onBackground={saveBackground}
            soundOn={soundOn}
            onSettings={(next) => void runProfile(setTessSettingsAction, next)}
            onRemove={(list, id) => void runProfile(removeTessNoteAction, { list, id })}
          />
        ) : (
          <RightPanels brief={brief} busy={acting} onPauseBot={(slug, paused) => run(setAgentPausedAction, { slug, paused: String(paused) })} />
        )}
      </div>

      <div className={styles.voice}>
        {(() => {
          const hidden = textPrefs.style === "hidden";
          const anyProblem = problem || speech.error || voiceProblem || (recorder.refused && recorder.error);
          const anyWords = !hidden && (speech.listening || speech.working || exchange.you || exchange.line);
          if (!anyWords && !anyProblem) return <div className={styles.said} aria-live="polite" />;
          return (
            <div className={`${styles.saidWrap} ${anyWords ? styles[WRAP[textPrefs.style]] ?? "" : ""} ${faded && !anyProblem ? styles.saidFaded : ""}`}>
              {anyWords && textPrefs.style === "comic" ? <i className={styles.tail} aria-hidden /> : null}
              <div className={styles.said} aria-live="polite">
                {hidden ? null : speech.listening ? (
                  <span className={styles.you}>You: {speech.transcript || (speech.live ? "I am listening, go ahead…" : "Opening the microphone…")}</span>
                ) : speech.working ? (
                  <span className={styles.you}>You: working out what you said…</span>
                ) : exchange.you ? (
                  <span className={styles.you}>You: {exchange.you}</span>
                ) : null}
                {hidden ? null : <span className={styles.line}>{exchange.line}</span>}
                {problem ? <span className={styles.problem}>{problem}</span> : null}
                {speech.error ? <span className={styles.problem}>{speech.error}</span> : null}
                {recorder.refused && recorder.error && !speech.error ? <span className={styles.problem}>{recorder.error}</span> : null}
                {voiceProblem ? <span className={styles.problem}>{voiceProblem}</span> : null}
              </div>
            </div>
          );
        })()}

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
              onClick={() => (speech.listening ? speech.stop() : speech.start("tap"))}
              disabled={(busy || speech.working) && !speech.listening}
              aria-pressed={speech.listening}
              aria-label="Talk to Tess"
            >
              {speech.listening ? "Listening · tap to send" : speech.working ? "Hearing you…" : "Tap to talk"}
            </button>
          ) : null}
          <button type="button" className={styles.round} onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? "Sound on" : "Sound off"}
          </button>
          <button type="button" className={styles.round} onClick={toggleText} aria-pressed={textPrefs.style !== "hidden"}>
            {textPrefs.style === "hidden" ? "Text off" : "Text on"}
          </button>
          <button type="submit" className={styles.round} disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>

        <div className={styles.hint}>
          {needsTap && lastSpoken.current ? (
            "Your browser held her voice back. Click anywhere or press a key to hear her."
          ) : faded && textPrefs.style !== "hidden" && exchange.line ? (
            <button type="button" className={styles.botBtn} onClick={() => setPinned(true)}>
              Show what she said
            </button>
          ) : speech.supported ? (
            "Tap the talk button or hold the space bar to talk, or type."
          ) : (
            "Type to talk to Tess. This browser cannot use the microphone here; Chrome and Edge can."
          )}
        </div>
      </div>
    </div>
  );
}
