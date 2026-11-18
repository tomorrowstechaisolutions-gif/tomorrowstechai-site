"use client";

import { useMemo, useState } from "react";
import { systemEmail } from "@/lib/system-emails/registry";
import { fillInsUsed } from "@/lib/system-emails/copy";
import styles from "./system-emails.module.css";

/**
 * Wording editor with a live preview. The preview renders the real email
 * builder in the browser with sample data, so what you see is what the
 * template produces. Saving goes through a server action.
 */
export default function SystemEmailEditor({
  emailKey,
  saved,
  saveAction,
}: {
  emailKey: string;
  saved: Record<string, string>;
  saveAction: (fd: FormData) => Promise<void>;
}) {
  const def = systemEmail(emailKey)!;
  const initial = useMemo(() => Object.fromEntries(def.slots.map((s) => [s.key, saved[s.key] ?? s.default])), [def, saved]);
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [view, setView] = useState<"html" | "text">("html");

  const built = useMemo(() => {
    try {
      return { ok: true as const, email: def.preview(draft) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Preview failed." };
    }
  }, [def, draft]);

  // Some emails (lead follow-ups) are sent as plain text only.
  const plainOnly = built.ok && !built.email.html.trim();
  const shown = plainOnly ? "text" : view;
  const known = new Set(def.vars.map((v) => v.name));
  const dirty = def.slots.some((s) => (draft[s.key] ?? "") !== initial[s.key]);

  return (
    <div className={styles.editor}>
      <form action={saveAction} className={styles.fields}>
        <input type="hidden" name="key" value={def.key} />
        {def.slots.map((s) => {
          const value = draft[s.key] ?? "";
          const unknown = fillInsUsed(value).filter((n) => !known.has(n));
          const changed = value.trim() !== s.default;
          return (
            <label key={s.key} className={styles.field}>
              <span className={styles.fieldHead}>
                {s.label}
                {changed ? (
                  <button type="button" className={styles.revert} onClick={() => setDraft((d) => ({ ...d, [s.key]: s.default }))}>
                    Original
                  </button>
                ) : null}
              </span>
              {s.multiline ? (
                <textarea name={`slot:${s.key}`} value={value} rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70) + value.split("\n").length - 1))} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} />
              ) : (
                <input name={`slot:${s.key}`} value={value} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} />
              )}
              {s.help ? <small>{s.help}</small> : null}
              {unknown.length ? <small className={styles.warn}>Unknown fill-in: {unknown.map((u) => `{${u}}`).join(", ")}. It will show as typed.</small> : null}
            </label>
          );
        })}
        <div className={styles.saveRow}>
          <button className={styles.save} disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</button>
          {dirty ? <button type="button" className={styles.ghost} onClick={() => setDraft(initial)}>Discard</button> : null}
        </div>
        {def.vars.length ? (
          <div className={styles.vars}>
            <b>Fill-ins you can use</b>
            <ul>
              {def.vars.map((v) => (
                <li key={v.name}>
                  <code>{`{${v.name}}`}</code> {v.label} <span>e.g. {v.sample}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

      <div className={styles.previewCol}>
        <div className={styles.previewBar}>
          {plainOnly ? (
            <span className={styles.sampleNote}>Sent as plain text, the way a personal email looks.</span>
          ) : (
            <div className={styles.seg} role="group" aria-label="Format">
              <button type="button" className={view === "html" ? styles.segOn : ""} onClick={() => setView("html")}>Email</button>
              <button type="button" className={view === "text" ? styles.segOn : ""} onClick={() => setView("text")}>Plain text</button>
            </div>
          )}
          {shown === "html" ? (
            <div className={styles.seg} role="group" aria-label="Device">
              <button type="button" className={device === "desktop" ? styles.segOn : ""} onClick={() => setDevice("desktop")}>Desktop</button>
              <button type="button" className={device === "phone" ? styles.segOn : ""} onClick={() => setDevice("phone")}>Phone</button>
            </div>
          ) : null}
        </div>
        {built.ok ? (
          <>
            <div className={styles.subject}><span>Subject</span>{built.email.subject}</div>
            {shown === "html" ? (
              <div className={`${styles.frameWrap} ${device === "phone" ? styles.phone : ""}`}>
                <iframe title="Email preview" sandbox="" srcDoc={built.email.html} className={styles.frame} />
              </div>
            ) : (
              <pre className={styles.text}>{built.email.text}</pre>
            )}
            <small className={styles.sampleNote}>Preview uses sample data. Real emails fill in the actual client, amounts and links.</small>
          </>
        ) : (
          <p className={styles.warn}>{built.error}</p>
        )}
      </div>
    </div>
  );
}
