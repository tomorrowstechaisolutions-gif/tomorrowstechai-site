"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cleanPageView } from "./pages";
import { applyScreenChange, SOUND_EVENT, SOUND_KEY, type ScreenChange } from "./screenSettings";
import { BACKGROUND_EVENT, BACKGROUND_KEY, parseBackground, playsWhileHidden, soundPlan, type Background } from "./soundPlan";
import type { TessState } from "./TessCore";
import { createTessSounds, type TessSounds } from "./tessSounds";
import { parseTextPrefs, TEXT_EVENT, TEXT_KEY, TEXT_PREV_KEY, textFaded, type TextPrefs } from "./textPrefs";
import { useRecorderInput } from "./useRecorderInput";
import { useSpeechInput } from "./useSpeechInput";

/**
 * Tess herself, kept running around every admin page: the conversation, her
 * voice, her hearing and her sounds. It lives in the frame around the pages
 * and not in any one of them, so moving from page to page does not cut her
 * off mid-sentence. Her full screen (TessConsole) and the small ball that
 * follows John everywhere else (TessOrb) are two views of this one Tess.
 *
 * John talks by tapping a talk button, holding the space bar, or typing.
 * Her words arrive as she writes them; when a voice is configured they are
 * then spoken. Each thing he says goes out with the page he is on and the
 * text on it, so she can talk about what he is looking at. When she opens a
 * page for him, his screen goes there.
 */

type StreamEvent =
  | { type: "state"; state: "thinking" | "speaking" | "idle" }
  | { type: "text"; delta: string }
  | { type: "screen"; change: ScreenChange }
  | { type: "go"; href: string }
  | { type: "error"; message: string }
  | { type: "done" };

const listen = (event: string) => (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(event, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(event, onChange);
  };
};
const subscribeSound = listen(SOUND_EVENT);
const subscribeBackground = listen(BACKGROUND_EVENT);
const subscribeText = listen(TEXT_EVENT);

const stored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string, event?: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  if (event) window.dispatchEvent(new Event(event));
};
const soundSnapshot = () => stored(SOUND_KEY) !== "off";
const backgroundSnapshot = (): Background => parseBackground(stored(BACKGROUND_KEY));
const textSnapshot = () => stored(TEXT_KEY);
/** Her sounds are on, and either the tab is in view or the background is one that keeps going out of view. */
const soundsAudible = () => soundSnapshot() && (!document.hidden || playsWhileHidden(backgroundSnapshot()));

/** The text of the page John is on, without the frame around it or Tess's own ball. */
function readPage(): string {
  const main = document.querySelector<HTMLElement>("main.cc-page");
  return cleanPageView(main?.innerText ?? "");
}

export type Tess = {
  /** What she is doing right now; listening wins over everything else. */
  state: TessState;
  busy: boolean;
  /** The last thing John said and what she is saying back. */
  exchange: { you: string; line: string };
  problem: string | null;
  voiceProblem: string | null;
  /** The browser held her voice back until John clicks or presses a key. */
  needsTap: boolean;
  /** Whether a voice service is set up on the server. */
  voice: boolean;
  speech: {
    supported: boolean;
    listening: boolean;
    live: boolean;
    working: boolean;
    transcript: string;
    error: string | null;
    start: (mode: "hold" | "tap") => void;
    stop: () => void;
  };
  /** Why her better hearing was refused, if it was. */
  hearingProblem: string | null;
  soundOn: boolean;
  toggleSound: () => void;
  background: Background;
  saveBackground: (next: Background) => void;
  textPrefs: TextPrefs;
  saveTextPrefs: (next: TextPrefs) => void;
  toggleText: () => void;
  /** Her words have been up long enough to leave the screen. */
  faded: boolean;
  /** Bring faded words back until the next exchange. */
  pin: () => void;
  ask: (message: string) => Promise<void>;
  /** Have her speak first, once, when there is no conversation to carry on. */
  greet: () => void;
  /** 0 to 1: how loud she is right now. Read every frame, never causes a render. */
  getLevel: () => number;
};

const TessContext = createContext<Tess | null>(null);

export function useTess(): Tess {
  const tess = useContext(TessContext);
  if (!tess) throw new Error("useTess needs TessProvider around it.");
  return tess;
}

export default function TessProvider({ voice, children }: { voice: boolean; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const [state, setState] = useState<TessState>("idle");
  const [exchange, setExchange] = useState({ you: "", line: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const startedRef = useRef(false);
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

  /** Her voice if it is playing, else the text arriving. */
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
      startedRef.current = true;
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
        const res = await fetch("/api/admin/tess/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, page: pathRef.current, view: pathRef.current === "/admin/ai" ? "" : readPage() }),
        });
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
            } else if (event.type === "screen") {
              applyScreenChange(event.change);
            } else if (event.type === "go") {
              // She opened a page. She keeps talking while the screen changes under her.
              if (event.href !== pathRef.current) router.push(event.href);
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
      // On her own screens she may have saved a playbook, a target or a rule: show it.
      // Elsewhere the page John is working on is left exactly as it is.
      if (pathRef.current.startsWith("/admin/ai")) router.refresh();
    },
    [playVoice, router, stopVoice, voice]
  );

  const greet = useCallback(() => {
    if (startedRef.current) return;
    void ask("");
  }, [ask]);

  // Two ways to hear John. With a voice service configured, his words are recorded and transcribed on the
  // server, which is far more accurate. Without one, the browser's own speech recognition is used.
  const recorder = useRecorderInput({ onFinal: ask, holdSpace: voice });
  const useRecorder = voice && recorder.supported && !recorder.refused;
  const browserSpeech = useSpeechInput({ onFinal: ask, holdSpace: !useRecorder });
  const speech = useRecorder ? recorder : browserSpeech;

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

  const saveBackground = useCallback((next: Background) => keep(BACKGROUND_KEY, next, BACKGROUND_EVENT), []);
  const saveTextPrefs = useCallback((next: TextPrefs) => keep(TEXT_KEY, JSON.stringify(next), TEXT_EVENT), []);

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

  /** Text on or off: off hides her words (she is only heard); on goes back to the style in use before. */
  const toggleText = useCallback(() => {
    if (textPrefs.style !== "hidden") {
      keep(TEXT_PREV_KEY, textPrefs.style);
      saveTextPrefs({ ...textPrefs, style: "hidden" });
      return;
    }
    saveTextPrefs({ ...textPrefs, style: parseTextPrefs(JSON.stringify({ style: stored(TEXT_PREV_KEY) })).style });
  }, [saveTextPrefs, textPrefs]);

  const toggleSound = useCallback(() => {
    const next = !soundSnapshot();
    keep(SOUND_KEY, next ? "on" : "off", SOUND_EVENT);
    if (!next) {
      heldBack.current = false;
      setNeedsTap(false);
      stopVoice();
      setState((s) => (s === "speaking" && !busyRef.current ? "idle" : s));
    }
  }, [stopVoice]);

  const pin = useCallback(() => setPinned(true), []);

  const tess: Tess = {
    state: shown,
    busy,
    exchange,
    problem,
    voiceProblem,
    needsTap,
    voice,
    speech: {
      supported: speech.supported,
      listening: speech.listening,
      live: speech.live,
      working: speech.working,
      transcript: speech.transcript,
      error: speech.error,
      start: speech.start,
      stop: speech.stop,
    },
    hearingProblem: recorder.refused ? recorder.error : null,
    soundOn,
    toggleSound,
    background,
    saveBackground,
    textPrefs,
    saveTextPrefs,
    toggleText,
    faded,
    pin,
    ask,
    greet,
    getLevel,
  };

  return <TessContext.Provider value={tess}>{children}</TessContext.Provider>;
}
