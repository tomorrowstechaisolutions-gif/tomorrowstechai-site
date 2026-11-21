"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TessState } from "@/components/admin/cc/tess/TessCore";
import type { Decision } from "@/lib/guide/brain";
import { WORDS_LIMIT } from "@/lib/guide/brain";
import type { GuideOffer } from "@/lib/guide/offers";
import { ASK_AGAIN_CLIP, BACK_CLIP, nameClip, nameKey } from "@/lib/guide/names";
import { CONTACT_KEY, packContact, readContact } from "@/lib/guide/remember";
import { clipName, GUIDE_START, GUIDE_WELCOME, guideStep, nextStep, type GuideStep } from "@/lib/guide/script";
import { SPAM_TRAP_FIELD } from "@/lib/spam-trap";
import styles from "./guide.module.css";

const TessCore = dynamic(() => import("@/components/admin/cc/tess/TessCore"), { ssr: false });

type Contact = { name: string; email: string; phone: string };

/** The visitor this browser remembers from an earlier visit, if any. Only ever called in the browser: the page is not drawn on the server. */
function remembered(): Contact | null {
  try {
    return readContact(window.localStorage.getItem(CONTACT_KEY));
  } catch {
    return null;
  }
}

function remember(who: Contact | null) {
  try {
    if (who) window.localStorage.setItem(CONTACT_KEY, packContact(who));
    else window.localStorage.removeItem(CONTACT_KEY);
  } catch {
    // Storage blocked: she simply asks again next time.
  }
}
type Picked = { id: string; choice: number };

type Player = { audio: { current: HTMLAudioElement | null }; muted: () => boolean; onSpeaking: () => void; onQuiet: () => void };

/**
 * Play recordings back to back. State only changes from a recording's own
 * events, never straight away. A browser may refuse sound before the visitor
 * has clicked anything; her words are on screen either way.
 */
function playInTurn(urls: string[], player: Player): void {
  player.audio.current?.pause();
  const [url, ...rest] = urls;
  if (!url || player.muted()) return;
  const clip = new Audio(url);
  player.audio.current = clip;
  const mine = () => player.audio.current === clip;
  const next = () => {
    if (!mine()) return;
    if (rest.length) playInTurn(rest, player);
    else player.onQuiet();
  };
  clip.onended = next;
  clip.onerror = next;
  clip.onplaying = () => {
    if (mine()) player.onSpeaking();
  };
  clip.play().catch(() => {
    if (mine()) player.onQuiet();
  });
}

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
export default function GuideExperience({ offers, clips, names, clipBase }: { offers: Record<string, GuideOffer>; clips: Record<string, string>; names: string[]; clipBase: string }) {
  // A visitor she already knows skips the introductions and starts at the first question.
  const [contact, setContact] = useState<Contact | null>(remembered);
  const [returning, setReturning] = useState(() => Boolean(remembered()));
  const [step, setStep] = useState<GuideStep>(() => guideStep(remembered() ? GUIDE_START : GUIDE_WELCOME)!);
  const [path, setPath] = useState<Picked[]>([]);
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

  // Plays recordings one after another, by address.
  const playUrls = useCallback((urls: string[]) => {
    playInTurn(urls, {
      audio,
      muted: () => mutedRef.current,
      onSpeaking: () => {
        speaking.current = true;
        setState("speaking");
      },
      onQuiet: () => {
        speaking.current = false;
        setState("idle");
      },
    });
  }, []);

  const play = useCallback((id: string) => playUrls(clips[id] ? [clips[id]] : []), [clips, playUrls]);

  // What a returning visitor hears: "Welcome back, John." when she has their name recorded, "Welcome back." when she does not, then the first question.
  const welcomeBack = useCallback(
    (name: string) => {
      const named = names.includes(nameKey(name)) ? nameClip(name) : null;
      const greeting = named ? `${clipBase}${clipName(named)}` : clips[BACK_CLIP.id];
      playUrls([greeting, clips[ASK_AGAIN_CLIP.id] ?? clips[GUIDE_START]].filter(Boolean));
    },
    [names, clipBase, clips, playUrls]
  );

  const say = useCallback(
    (id: string) => {
      setState("idle");
      play(id);
    },
    [play]
  );

  const firstLine = useRef({ id: step.id, back: contact?.name ?? null });
  useEffect(() => {
    startedAt.current = Date.now();
    if (firstLine.current.back) welcomeBack(firstLine.current.back);
    else play(firstLine.current.id);
    // Whatever is playing when the page closes is what must stop, so the ref is read at that moment on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => audio.current?.pause();
  }, [play, welcomeBack]);

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
      remember(who);
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
      // A number given here is kept, so she does not ask for it twice.
      if (phone && phone !== contact.phone) {
        setContact({ ...contact, phone });
        remember({ ...contact, phone });
      }
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

  // "Not you?": forget this visitor and start again from the introductions.
  const forget = () => {
    remember(null);
    setContact(null);
    setReturning(false);
    setPath([]);
    setTyped([]);
    setCallAsked(false);
    go(guideStep(GUIDE_WELCOME)!);
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
        <p className={styles.said}>{step.kind === "question" && step.id === GUIDE_START && first ? `${returning ? "Welcome back" : "Thanks"}, ${first}. What brought you here today?` : step.say}</p>

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
        {returning && contact && step.id === GUIDE_START ? <button type="button" className={styles.notYou} onClick={forget}>Not {first}? Start fresh</button> : null}
      </section>
    </main>
  );
}
