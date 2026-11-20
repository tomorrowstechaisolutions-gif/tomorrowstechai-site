"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nothingHeardNotice, spaceBarTalks } from "./speechLogic";

/**
 * Talking to Tess with the microphone, using the browser's own speech
 * recognition (Chrome and Edge have it; Firefox does not, and `supported`
 * says so). Two ways in: hold the space bar and let go to send ("hold"), or
 * tap the talk button and it sends by itself when John stops speaking ("tap").
 *
 * `onFinal` is called once with what was heard when listening stops.
 */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked for this site. Allow it in the browser's address bar.",
  "service-not-allowed": "The microphone is blocked for this site. Allow it in the browser's address bar.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a connection and could not reach it.",
};

export function useSpeechInput(opts: { onFinal?: (text: string) => void; holdSpace?: boolean } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** True once the browser has the microphone open and is taking sound in. */
  const [live, setLive] = useState(false);
  const failed = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const heard = useRef("");
  const onFinal = useRef(opts.onFinal);
  useEffect(() => {
    onFinal.current = opts.onFinal;
  }, [opts.onFinal]);

  // Decided after mount so the server and the first client render agree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, only knowable after mount
    setSupported(recognitionCtor() !== null);
    return () => recognition.current?.abort();
  }, []);

  const start = useCallback((mode: "hold" | "tap" = "hold") => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const r = new Ctor();
    r.lang = "en-US";
    // Held: keep listening through pauses until John lets go. Tapped: stop by itself when he stops speaking.
    r.continuous = mode === "hold";
    r.interimResults = true;
    heard.current = "";
    setTranscript("");
    setError(null);
    setLive(false);
    failed.current = false;

    r.onaudiostart = () => setLive(true);
    r.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      heard.current = text.trim();
      setTranscript(heard.current);
    };
    r.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      failed.current = true;
      setError(ERRORS[event.error] ?? "I could not hear that. Try again.");
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
      setLive(false);
      if (heard.current) onFinal.current?.(heard.current);
      else {
        const notice = nothingHeardNotice(heard.current, failed.current);
        if (notice) setError(notice);
      }
    };

    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError("The microphone could not start. Try again.");
    }
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  useEffect(() => {
    if (!opts.holdSpace || !supported) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !spaceBarTalks(e.target as HTMLElement | null)) return;
      e.preventDefault(); // also stops a focused button being pressed by the space bar
      if (!e.repeat) start("hold");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !spaceBarTalks(e.target as HTMLElement | null)) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [opts.holdSpace, supported, start, stop]);

  return { supported, listening, live, working: false, start, stop, transcript, error };
}
