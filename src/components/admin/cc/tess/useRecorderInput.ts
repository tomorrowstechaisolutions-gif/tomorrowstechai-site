"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HEAR_LIMITS, listenStep, newListen, type ListenState } from "./hearingLogic";
import { nothingHeardNotice, spaceBarTalks } from "./speechLogic";

/**
 * Talking to Tess by recording the microphone and having the recording
 * transcribed on the server (see /api/admin/tess/hear). Far more accurate
 * than the browser's own speech recognition, at the cost of a short wait
 * after John stops talking.
 *
 * Same shape as useSpeechInput so the page can use either: "tap" sends by
 * itself once he goes quiet, "hold" runs while the space bar is down.
 * `working` is true while the recording is being transcribed.
 */

type Session = {
  stream: MediaStream;
  recorder: MediaRecorder;
  ctx: AudioContext | null;
  timer: number;
  listen: ListenState;
  chunks: Blob[];
};

function canRecord(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== "undefined";
}

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: "The microphone is blocked for this site. Allow it in the browser's address bar.",
  NotFoundError: "No microphone was found.",
  NotReadableError: "The microphone is in use by something else.",
};

export function useRecorderInput(opts: { onFinal?: (text: string) => void; holdSpace?: boolean } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The transcription service refused our key. The page uses the browser's recognition until it is reloaded. */
  const [refused, setRefused] = useState(false);
  const session = useRef<Session | null>(null);
  /** start() was called and the microphone has not opened yet. */
  const opening = useRef(false);
  /** stop() arrived while the microphone was still opening. */
  const stopEarly = useRef(false);
  const onFinal = useRef(opts.onFinal);
  useEffect(() => {
    onFinal.current = opts.onFinal;
  }, [opts.onFinal]);

  const release = useCallback((s: Session) => {
    window.clearInterval(s.timer);
    for (const track of s.stream.getTracks()) track.stop();
    void s.ctx?.close().catch(() => undefined);
  }, []);

  // Decided after mount so the server and the first client render agree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, only knowable after mount
    setSupported(canRecord());
    return () => {
      const s = session.current;
      session.current = null;
      if (!s) return;
      s.recorder.onstop = null;
      try {
        s.recorder.stop();
      } catch {
        /* already stopped */
      }
      release(s);
    };
  }, [release]);

  const send = useCallback(async (s: Session) => {
    const spoke = s.listen.spoke;
    const blob = new Blob(s.chunks, { type: s.recorder.mimeType || "audio/webm" });
    if (!spoke || blob.size < HEAR_LIMITS.minBytes) {
      setError(nothingHeardNotice("", false));
      return;
    }
    setWorking(true);
    try {
      const res = await fetch("/api/admin/tess/hear", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      if (res.status !== 200) {
        const body = (await res.json().catch(() => null)) as { error?: string; fallback?: boolean } | null;
        if (res.status === 204 || body?.fallback) setRefused(true);
        setError(body?.error ?? "I could not make out the recording. Try again, or type it.");
        return;
      }
      const { text } = (await res.json()) as { text?: string };
      if (text?.trim()) onFinal.current?.(text.trim());
      else setError(nothingHeardNotice("", false));
    } catch {
      setError("The recording could not be sent. Check the connection and try again.");
    } finally {
      setWorking(false);
    }
  }, []);

  const stop = useCallback(() => {
    const s = session.current;
    if (!s) {
      if (opening.current) stopEarly.current = true;
      return;
    }
    if (s.recorder.state !== "inactive") s.recorder.stop();
  }, []);

  const start = useCallback(
    async (mode: "hold" | "tap" = "hold") => {
      if (!canRecord() || session.current || opening.current) return;
      opening.current = true;
      stopEarly.current = false;
      setError(null);
      setLive(false);
      setListening(true);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (err) {
        opening.current = false;
        setListening(false);
        setError(MIC_ERRORS[(err as { name?: string } | null)?.name ?? ""] ?? "The microphone could not start. Try again.");
        return;
      }
      opening.current = false;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        for (const track of stream.getTracks()) track.stop();
        setListening(false);
        setError("This browser cannot record the microphone. Type instead.");
        return;
      }

      // A level meter on the same stream decides when he has stopped talking.
      let ctx: AudioContext | null = null;
      let level: () => number = () => 1; // with no meter, treat it as speech and rely on the stop button
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          ctx = new Ctx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
          level = () => {
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
              const v = (samples[i] - 128) / 128;
              sum += v * v;
            }
            return Math.sqrt(sum / samples.length);
          };
        }
      } catch {
        ctx = null;
      }

      const s: Session = { stream, recorder, ctx, timer: 0, listen: newListen(performance.now()), chunks: [] };
      recorder.ondataavailable = (event) => {
        if (event.data.size) s.chunks.push(event.data);
      };
      recorder.onstop = () => {
        session.current = null;
        release(s);
        setListening(false);
        setLive(false);
        void send(s);
      };
      s.timer = window.setInterval(() => {
        const step = listenStep(s.listen, level(), performance.now(), mode);
        s.listen = step.state;
        if (step.stop && recorder.state !== "inactive") recorder.stop();
      }, 80);

      session.current = s;
      recorder.start();
      setLive(true);
      if (stopEarly.current) recorder.stop(); // he let go before the microphone had opened
    },
    [release, send]
  );

  useEffect(() => {
    if (!opts.holdSpace || !supported || refused) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !spaceBarTalks(e.target as HTMLElement | null)) return;
      e.preventDefault(); // also stops a focused button being pressed by the space bar
      if (!e.repeat) void start("hold");
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
  }, [opts.holdSpace, supported, refused, start, stop]);

  return { supported, listening, live, working, refused, start, stop, transcript: "", error };
}
