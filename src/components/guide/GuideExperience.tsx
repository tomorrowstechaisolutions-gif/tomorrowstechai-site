"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TessState } from "@/components/admin/cc/tess/TessCore";
import type { Decision } from "@/lib/guide/brain";
import { WORDS_LIMIT } from "@/lib/guide/brain";
import type { GuideOffer } from "@/lib/guide/offers";
import { GUIDE_START, GUIDE_WELCOME, guideStep, nextStep, type GuideStep } from "@/lib/guide/script";
import { SPAM_TRAP_FIELD } from "@/lib/spam-trap";
import styles from "./guide.module.css";

const TessCore = dynamic(() => import("@/components/admin/cc/tess/TessCore"), { ssr: false });

type Contact = { name: string; email: string; phone: string };
type Picked = { id: string; choice: number };

/** Save the visitor's details, and their answers when there are any. Throws only for something they can fix. */
async function postLead(who: Contact, startedAt: number, extra: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/guide/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...who, elapsed_ms: Date.now() - startedAt, referrer: document.referrer, ...extra }),
  });
  if (res.status === 400 || res.status === 429) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Check your details and try again.");
  return res.ok;
}

/**
 * Tess's page for visitors. She greets them, takes their name and email,
 * asks up to three questions with answers to tap, and ends on the one service
 * that fits. Every line is a recording made once; nothing here calls a model.
 */
export default function GuideExperience({ offers, clips }: { offers: Record<string, GuideOffer>; clips: Record<string, string> }) {
  const [step, setStep] = useState<GuideStep>(() => guideStep(GUIDE_WELCOME)!);
  const [path, setPath] = useState<Picked[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [state, setState] = useState<TessState>("idle");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [callAsked, setCallAsked] = useState(false);
  // What she answered when the visitor typed, and everything they typed (kept for the lead).
  const [reply, setReply] = useState<string | null>(null);
  const [typed, setTyped] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speaking = useRef(false);
  const startedAt = useRef(0);
  const mutedRef = useRef(false);

  // Her surface moves while a recording plays. The motion is made up, not measured, so it needs no audio permissions.
  const getLevel = useCallback(() => (speaking.current ? 0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 140)) : 0), []);

  // Starts a line's recording. State only changes from the recording's own events, never straight away.
  const play = useCallback(
    (id: string) => {
      audio.current?.pause();
      speaking.current = false;
      const url = clips[id];
      if (!url || mutedRef.current) return;
      const clip = new Audio(url);
      audio.current = clip;
      const done = () => {
        if (audio.current !== clip) return;
        speaking.current = false;
        setState("idle");
      };
      clip.onended = done;
      clip.onerror = done;
      clip.onplaying = () => {
        speaking.current = true;
        setState("speaking");
      };
      // A browser may refuse sound before the visitor has clicked anything. Her words are on screen either way.
      clip.play().catch(done);
    },
    [clips]
  );

  const say = useCallback(
    (id: string) => {
      setState("idle");
      play(id);
    },
    [play]
  );

  useEffect(() => {
    startedAt.current = Date.now();
    play(GUIDE_WELCOME);
    return () => audio.current?.pause();
  }, [play]);

  const go = (next: GuideStep) => {
    setStep(next);
    setProblem(null);
    setReply(null);
    say(next.id);
  };

  const send = (who: Contact, extra: Record<string, unknown> = {}) => postLead(who, startedAt.current, extra);

  const begin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const who: Contact = { name: String(form.get("name") ?? "").trim(), email: String(form.get("email") ?? "").trim(), phone: String(form.get("phone") ?? "").trim() };
    if (!who.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email)) return setProblem("Enter your name and a valid email address.");
    setBusy(true);
    try {
      // If saving fails for a reason that is not theirs, let them carry on. Their details are sent again with their answers.
      await send(who, { [SPAM_TRAP_FIELD]: String(form.get(SPAM_TRAP_FIELD) ?? "") }).catch((err: Error) => {
        if (/details|valid|Too many/i.test(err.message)) throw err;
      });
      setContact(who);
      go(guideStep(GUIDE_START)!);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try once more.");
    } finally {
      setBusy(false);
    }
  };

  const arrive = (next: GuideStep, walked: Picked[], words: string[]) => {
    setPath(walked);
    go(next);
    if (next.kind === "outcome" && contact) void send(contact, { path: walked, outcome: next.id, words }).catch(() => undefined);
  };

  const pick = (choice: number, words: string[] = typed) => {
    const next = nextStep(step.id, choice);
    if (next) arrive(next, [...path, { id: step.id, choice }], words);
  };

  // The visitor typed instead of tapping. A small model picks one of the script's own moves; the page carries it out.
  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("words") as HTMLInputElement | null;
    const words = (field?.value ?? "").trim();
    if (words.length < 2 || thinking) return;
    const said = [...typed, words];
    setTyped(said);
    setThinking(true);
    setState("thinking");
    try {
      const res = await fetch("/api/guide/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: step.id, words }) });
      const decision = ((await res.json().catch(() => ({}))) as { decision?: Decision }).decision;
      if (field) field.value = "";
      setState("idle");
      if (decision?.kind === "choose") return pick(decision.choice, said);
      const target = decision?.kind === "go" ? guideStep(decision.to) : null;
      if (target) return arrive(target, path, said);
      setReply(decision?.kind === "say" ? decision.text : "Pick the closest option and I will take it from there.");
    } catch {
      setState("idle");
      setReply("Pick the closest option and I will take it from there.");
    } finally {
      setThinking(false);
    }
  };

  const back = () => {
    const last = path[path.length - 1];
    if (!last) return;
    setPath(path.slice(0, -1));
    setCallAsked(false);
    go(guideStep(last.id)!);
  };

  const askForCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contact || step.kind !== "outcome") return;
    const phone = String(new FormData(event.currentTarget).get("phone") ?? contact.phone).trim();
    setBusy(true);
    try {
      const ok = await send({ ...contact, phone }, { path, outcome: step.id, wants_call: "yes", words: typed });
      if (!ok) throw new Error("That did not go through. Try once more.");
      setCallAsked(true);
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try once more.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSound = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      audio.current?.pause();
      speaking.current = false;
      setState("idle");
    } else say(step.id);
  };

  const offer = step.kind === "outcome" ? offers[step.offer] : undefined;
  const first = contact?.name.split(/\s+/)[0];

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.home}>Tomorrow&rsquo;s Tech AI</Link>
        <button type="button" className={styles.quiet} onClick={toggleSound} aria-pressed={muted}>{muted ? "Sound off" : "Sound on"}</button>
      </header>

      <div className={styles.core} aria-hidden="true"><TessCore state={state} getLevel={getLevel} crew={[]} /></div>

      <section className={styles.talk} aria-live="polite">
        <p className={styles.said}>{step.kind === "question" && step.id === GUIDE_START && first ? `Thanks, ${first}. What brought you here today?` : step.say}</p>

        {step.kind === "line" ? (
          <form className={styles.form} onSubmit={begin} noValidate>
            <label>Your name<input name="name" autoComplete="name" required maxLength={120} /></label>
            <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
            <label>Phone <span>(optional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
            <input name={SPAM_TRAP_FIELD} tabIndex={-1} autoComplete="off" className={styles.trap} aria-hidden="true" />
            <button className={styles.primary} disabled={busy}>{busy ? "One moment" : "Start"}</button>
            <p className={styles.fine}>We use this to follow up about what you ask for here. Nothing is charged.</p>
          </form>
        ) : null}

        {step.kind === "question" ? (
          <ul className={styles.options}>
            {step.options.map((option, index) => (
              <li key={option.label}><button type="button" onClick={() => pick(index)} disabled={thinking}>{option.label}</button></li>
            ))}
          </ul>
        ) : null}

        {step.kind === "outcome" ? (
          <div className={styles.result}>
            <div className={styles.card}>
              <h1>{offer?.name ?? step.need}</h1>
              {offer?.blurb ? <p>{offer.blurb}</p> : null}
              {offer ? (
                <p className={styles.price}>
                  <strong>{offer.price}</strong>
                  {offer.regular ? <span> Regular price {offer.regular}</span> : null}
                  {offer.setup ? <span> plus {offer.setup}</span> : null}
                </p>
              ) : null}
            </div>
            <div className={styles.actions}>
              <Link href={step.href} className={styles.primary}>See it</Link>
              {callAsked ? (
                <p className={styles.done}>Got it. John will reach out to you.</p>
              ) : (
                <form className={styles.call} onSubmit={askForCall}>
                  {contact?.phone ? null : <input name="phone" type="tel" autoComplete="tel" placeholder="Best number to reach you" required maxLength={40} aria-label="Phone number" />}
                  <button className={styles.second} disabled={busy}>{busy ? "One moment" : "Have John call me"}</button>
                </form>
              )}
            </div>
          </div>
        ) : null}

        {reply ? <p className={styles.reply}>{reply}</p> : null}

        {step.kind === "line" ? null : (
          <form className={styles.ask} onSubmit={ask}>
            <input name="words" maxLength={WORDS_LIMIT} autoComplete="off" placeholder={step.kind === "outcome" ? "Have a question about this? Type it here" : "Or tell me in your own words"} aria-label="Tell Tess in your own words" />
            <button className={styles.second} disabled={thinking}>{thinking ? "Thinking" : "Send"}</button>
          </form>
        )}

        {problem ? <p className={styles.problem} role="alert">{problem}</p> : null}
        {path.length ? <button type="button" className={styles.quiet} onClick={back}>Go back</button> : null}
      </section>
    </main>
  );
}
