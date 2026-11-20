"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { confirmPlaybookAction, removeTessNoteAction, setAgentPausedAction, setCrewPausedAction, setTessSettingsAction, type CrewActionResult } from "@/app/admin/crew-actions";
import type { Brief } from "@/lib/crew/brief";
import type { ChatLine } from "@/lib/crew/chat";
import type { TessProfile } from "@/lib/crew/profile";
import { MODES } from "@/lib/crew/tess-modes";
import { LeftPanels, RightPanels } from "./BriefPanels";
import type { TessState } from "./TessCore";
import TessProfilePanel from "./TessProfilePanel";
import { useTess } from "./TessProvider";
import styles from "./tess.module.css";
import type { TextStyle } from "./textPrefs";

/**
 * The Tess tab: the Core in the middle, the brief either side, and the
 * conversation underneath. Three views: Briefing, Stage (the Core alone) and
 * Profile, which swaps the right-hand column for her mode, dials and notes.
 *
 * This is Tess at full size. Tess herself (the conversation, her voice, her
 * hearing, her sounds) runs in TessProvider around every admin page, so she
 * carries on when John leaves this screen; there she is the small ball
 * (TessOrb). Everything works by typing alone: no microphone and no voice
 * are both fine.
 */

const TessCore = dynamic(() => import("./TessCore"), { ssr: false });

const LABEL: Record<TessState, string> = { idle: "Waiting", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

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

const WRAP: Record<TextStyle, string> = { classic: "", comic: "wrapComic", tech: "wrapTech", hidden: "" };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function TessConsole({ brief, history, profile }: { brief: Brief; history: ChatLine[]; profile: TessProfile }) {
  const router = useRouter();
  const tess = useTess();
  const { busy, problem, voiceProblem, needsTap, speech, hearingProblem, soundOn, toggleSound, background, saveBackground, textPrefs, saveTextPrefs, toggleText, faded, pin, ask, greet, getLevel } = tess;
  const shown = tess.state;
  // What was said since this browser tab was opened, or failing that the end of the saved conversation.
  const exchange = busy || tess.exchange.you || tess.exchange.line ? tess.exchange : lastExchange(history);
  const [view, setView] = useState<"briefing" | "stage" | "profile">("briefing");
  const stage = view === "stage";
  const [profileProblem, setProfileProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [acting, setActing] = useState(false);
  const [actionProblem, setActionProblem] = useState<string | null>(null);

  // John has just opened the tab and there is no conversation to carry on: Tess speaks first.
  useEffect(() => {
    if (history.length) return;
    const timer = window.setTimeout(greet, 0);
    return () => window.clearTimeout(timer);
  }, [greet, history.length]);

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
          const anyProblem = problem || speech.error || voiceProblem || hearingProblem;
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
                {hearingProblem && !speech.error ? <span className={styles.problem}>{hearingProblem}</span> : null}
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
          {needsTap ? (
            "Your browser held her voice back. Click anywhere or press a key to hear her."
          ) : faded && textPrefs.style !== "hidden" && exchange.line ? (
            <button type="button" className={styles.botBtn} onClick={pin}>
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
