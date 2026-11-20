"use client";

import type { FloorStep } from "./replay";
import styles from "./floor.module.css";

/** The card for the selected bot and the running log, beside the floor. */

export type SideBot = { id: string; name: string; role: string; color: string; status: string; last: string | null; actions: number; refused: number };

const TONE: Record<string, string> = { act: styles.toneAct, refused: styles.toneRefused, needs_john: styles.toneJohn, report: styles.toneReport, read: "" };

function clock(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export default function FloorSide({ bot, log, names }: { bot: SideBot | null; log: FloorStep[]; names: Record<string, { name: string; color: string }> }) {
  return (
    <aside className={styles.side}>
      {bot ? (
        <section className={styles.card} aria-live="polite">
          <div className={styles.who}>
            <i style={{ background: bot.color }} />
            {bot.name}
          </div>
          <div className={styles.role}>{bot.role}</div>
          <div className={styles.kv}>
            <span>Now</span>
            <b>{bot.status}</b>
          </div>
          <div className={styles.kv}>
            <span>Last did</span>
            <b>{bot.last ?? "nothing in the last day"}</b>
          </div>
          <div className={styles.kv}>
            <span>Last 24 hours</span>
            <b>
              {bot.actions} done · {bot.refused} stopped
            </b>
          </div>
        </section>
      ) : null}

      <section className={styles.logwrap}>
        <h2>Live log</h2>
        <div className={styles.log}>
          {log.length ? (
            log.map((s) => (
              <div key={s.id} className={TONE[s.kind] ?? ""} style={{ borderLeftColor: names[s.agent_id]?.color }}>
                <b>{names[s.agent_id]?.name ?? "A bot"}</b> {s.summary}
                <small>{clock(s.created_at)}</small>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Nothing has happened in the last day. A bot shows up here the moment it does something.</p>
          )}
        </div>
      </section>
    </aside>
  );
}
