"use client";

import Link from "next/link";
import type { Brief } from "@/lib/crew/brief";
import styles from "./tess.module.css";

/**
 * The panels either side of the Core. Everything shown is from the brief the
 * server built for this visit; nothing here is made up or remembered.
 */

const METRIC: Record<string, string> = { qualified_leads: "Qualified leads", booked_calls: "Booked calls", sales: "Sales", site_visitors: "Site visitors", unpaid_days: "Days unpaid" };

function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const sameDay = new Date().toDateString() === at.toDateString();
  return at.toLocaleString("en-US", sameDay ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
}

const TONE: Record<string, string> = { act: "", report: "", refused: "warn", needs_john: "bad", read: "" };

export function LeftPanels({
  brief,
  busy,
  problem,
  onConfirm,
}: {
  brief: Brief;
  busy: boolean;
  problem: string | null;
  onConfirm: () => void;
}) {
  const done = brief.didWhileOut.slice(-12).reverse();
  return (
    <>
      {brief.setupNeeded ? (
        <section className={`${styles.panel} ${styles.panelSetup}`}>
          <h2>Set up with Tess</h2>
          {brief.business?.hasPlaybook ? (
            <>
              <p>Tess has a playbook saved for {brief.business.name}. Ask her to read it back. When it is right, confirm it and the crew starts working. Nothing is sent before that.</p>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onConfirm} disabled={busy}>
                Confirm playbook
              </button>
            </>
          ) : (
            <p>Nothing is sent until there is a playbook. Tell Tess who you sell to, what to lead with, how you want to sound and this month&apos;s target. She will ask you one thing at a time.</p>
          )}
          {problem ? <p className={styles.note}>{problem}</p> : null}
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2>
          Waiting on you <span>{brief.needsJohn.length || "nothing"}</span>
        </h2>
        {brief.needsJohn.length ? (
          brief.needsJohn.slice(0, 8).map((item) => (
            <div key={item.id} className={styles.did}>
              <i className={styles.bad} />
              <div>{item.title}</div>
            </div>
          ))
        ) : (
          <p>The crew has raised nothing that needs your decision.</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2>
          While you were out <span>since {clock(brief.since)}</span>
        </h2>
        {done.length ? (
          done.map((d, i) => (
            <div key={`${d.at}-${i}`} className={styles.did}>
              <i className={styles[TONE[d.kind]] ?? ""} />
              <div>
                {d.agent}: {d.summary} <span>{clock(d.at)}</span>
              </div>
            </div>
          ))
        ) : (
          <p>{brief.setupNeeded ? "The crew has not started. It waits for a confirmed playbook." : "No bot took any action since you were last here."}</p>
        )}
      </section>
    </>
  );
}

export function RightPanels({ brief, busy, onPauseBot }: { brief: Brief; busy: boolean; onPauseBot: (slug: string, paused: boolean) => void }) {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthShare = today.getDate() / daysInMonth;
  return (
    <>
      <section className={styles.panel}>
        <h2>
          This month&apos;s targets <span>day {today.getDate()} of {daysInMonth}</span>
        </h2>
        {brief.targets.length ? (
          brief.targets.map((t) => {
            const share = t.current === null || t.target <= 0 ? 0 : Math.min(1, t.current / t.target);
            return (
              <div key={t.metric} className={styles.goal}>
                <div className={styles.goalRow}>
                  <span>{METRIC[t.metric] ?? t.metric}</span>
                  <b>{t.current === null ? `not measured yet · target ${t.target}` : `${t.current} of ${t.target}`}</b>
                </div>
                <div className={styles.bar}>
                  <div className={share < monthShare ? styles.behind : ""} style={{ width: `${Math.max(share * 100, t.current === null ? 0 : 2)}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <p>No target is set. Tell Tess what you want this month and she will save it.</p>
        )}
      </section>

      <section className={styles.panel}>
        <h2>
          The crew <span>{brief.crewPaused ? "all paused" : `${brief.crew.filter((c) => c.working).length} working`}</span>
        </h2>
        {brief.crew.map((bot) => (
          <div key={bot.slug} className={styles.bot}>
            <span className={`${styles.dot} ${bot.paused ? styles.dotPaused : bot.working ? styles.dotOn : ""}`} />
            <span className={styles.who}>
              {bot.name}
              <small>{bot.paused ? "paused by you" : bot.working ? bot.doing : "idle until its next shift"}</small>
            </span>
            <button type="button" className={styles.botBtn} onClick={() => onPauseBot(bot.slug, !bot.paused)} disabled={busy} aria-label={`${bot.paused ? "Resume" : "Pause"} ${bot.name}`}>
              {bot.paused ? "Resume" : "Pause"}
            </button>
          </div>
        ))}
        <Link className={styles.openFloor} href="/admin/ai/floor">
          Open the floor →
        </Link>
      </section>
    </>
  );
}
