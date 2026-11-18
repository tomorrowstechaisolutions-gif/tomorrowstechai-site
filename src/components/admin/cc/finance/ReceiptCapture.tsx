"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./receipts.module.css";

/**
 * Scan or upload receipts.
 *
 * "Scan receipt" opens the phone's camera directly. "Upload" takes several
 * photos, screenshots or PDFs at once (Amazon invoices, order-email
 * screenshots). Photos are shrunk in the browser first so they stay under the
 * upload limit and read faster. Files go up one at a time, each with its own
 * status line, then the page refreshes into the review queue.
 */

type Line = { name: string; state: "waiting" | "reading" | "done" | "dup" | "error"; text: string };

const MAX_EDGE = 2200;
const LIMIT = 4 * 1024 * 1024;

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: send as-is
  }
}

export default function ReceiptCapture({ bankTransactionId, compact = false }: { bankTransactionId?: string; compact?: boolean }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function send(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    const start: Line[] = files.map((f) => ({ name: f.name, state: "waiting", text: "Waiting" }));
    setLines(start);
    const set = (i: number, l: Partial<Line>) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, ...l } : x)));

    for (let i = 0; i < files.length; i++) {
      set(i, { state: "reading", text: "Reading…" });
      try {
        const file = await shrink(files[i]);
        if (file.size > LIMIT) throw new Error("Over 4 MB, even after shrinking");
        const body = new FormData();
        body.append("file", file);
        if (bankTransactionId) body.append("bank_transaction_id", bankTransactionId);
        const res = await fetch("/api/admin/expenses/receipt", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string; duplicate?: boolean; message?: string; vendor?: string | null; totalCents?: number | null; matchedBank?: boolean; readError?: string | null };
        if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
        if (json.duplicate) set(i, { state: "dup", text: json.message ?? "Already uploaded" });
        else if (json.readError) set(i, { state: "done", text: "Saved, but couldn't be read. Fill it in below." });
        else set(i, {
          state: "done",
          text: `${json.vendor ?? "Receipt"}${json.totalCents != null ? ` · $${(json.totalCents / 100).toFixed(2)}` : ""}${json.matchedBank ? " · matched to Mercury" : ""}`,
        });
      } catch (cause) {
        set(i, { state: "error", text: cause instanceof Error ? cause.message : "Upload failed" });
      }
    }
    setBusy(false);
    router.refresh();
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void send([...e.dataTransfer.files]);
  };

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </>
  );

  if (compact) {
    return (
      <span className={styles.compact}>
        {inputs}
        <button type="button" className={styles.small} disabled={busy} onClick={() => picker.current?.click()}>
          {busy ? "Reading…" : "Attach receipt"}
        </button>
        {lines[0] && lines[0].state !== "reading" ? <small className={styles[lines[0].state]}>{lines[0].text}</small> : null}
      </span>
    );
  }

  return (
    <div
      className={`${styles.drop} ${over ? styles.over : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {inputs}
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => camera.current?.click()}>
          <span aria-hidden>◉</span> Scan receipt
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => picker.current?.click()}>
          Upload photos or PDFs
        </button>
      </div>
      <p className={styles.hint}>
        Or drop files here. Amazon invoice PDFs, order-email screenshots and phone photos all work. Several at once is fine.
      </p>
      {lines.length ? (
        <ul className={styles.lines}>
          {lines.map((l, i) => (
            <li key={i} className={styles[l.state]}>
              <b>{l.name}</b>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
