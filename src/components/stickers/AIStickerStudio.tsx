import Image from "next/image";
import { useState } from "react";
import type { AIStickerRequest, AIStickerResult } from "@/lib/stickers/types";
import styles from "./StickerPage.module.css";

const STYLES = ["Modern", "Professional", "Bold", "Vintage", "Cartoon", "Luxury", "Minimal", "Texas", "Automotive", "Pirate", "Custom"];
const SHAPES = ["Auto / Die Cut", "Circle", "Square", "Rectangle", "Badge", "Custom"];

type Props = { open: boolean; onClose: () => void; onUse: (result: AIStickerResult) => void; onToast: (message: string) => void };

export function AIStickerStudio({ open, onClose, onUse, onToast }: Props) {
  const [form, setForm] = useState<AIStickerRequest>({ businessName: "", stickerText: "", prompt: "", style: "Bold", colorPreference: "Electric blue, white, and black", shape: "Auto / Die Cut", includeQrCode: false, qrCodeUrl: "" });
  const [result, setResult] = useState<AIStickerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const update = <K extends keyof AIStickerRequest>(key: K, value: AIStickerRequest[K]) => setForm((current) => ({ ...current, [key]: value }));

  if (!open) return null;

  const generate = async () => {
    if (!form.prompt.trim()) { onToast("Describe the sticker you want to generate."); return; }
    if (form.includeQrCode && !form.qrCodeUrl?.trim()) { onToast("Add the URL for your QR code."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/sticker-ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Generation failed.");
      setResult(payload.result);
      onToast("AI preview generated. Review it before using it in your order.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Generation failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="ai-studio-title">
        <header className={styles.modalHeader}>
          <div><p className={styles.eyebrow}>Create with AI</p><h2 id="ai-studio-title" className={styles.modalTitle}>AI Sticker Studio</h2></div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close AI Sticker Studio">×</button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.formGrid}>
            <Field label="Business / Brand Name"><input className={styles.input} value={form.businessName} onChange={(e) => update("businessName", e.target.value)} /></Field>
            <Field label="What should the sticker say?"><input className={styles.input} value={form.stickerText} onChange={(e) => update("stickerText", e.target.value)} /></Field>
            <Field label="Describe Your Sticker" className={styles.span2}><textarea className={styles.textarea} value={form.prompt} onChange={(e) => update("prompt", e.target.value)} placeholder="Create a bold Texas-themed plumbing company sticker featuring a blue service truck, the business name, and a professional mascot." /></Field>
            <Field label="Style" className={styles.span2}><div className={styles.choiceGrid}>{STYLES.map((style) => <button type="button" key={style} onClick={() => update("style", style)} className={`${styles.choice} ${form.style === style ? styles.selected : ""}`}>{style}</button>)}</div></Field>
            <Field label="Color Preference"><input className={styles.input} value={form.colorPreference} onChange={(e) => update("colorPreference", e.target.value)} /></Field>
            <Field label="Shape"><select className={styles.select} value={form.shape} onChange={(e) => update("shape", e.target.value)}>{SHAPES.map((shape) => <option key={shape}>{shape}</option>)}</select></Field>
            <label className={`${styles.field} ${styles.span2}`}><span><input type="checkbox" checked={form.includeQrCode} onChange={(e) => update("includeQrCode", e.target.checked)} /> Include QR Code</span>{form.includeQrCode ? <input className={styles.input} type="url" value={form.qrCodeUrl} onChange={(e) => update("qrCodeUrl", e.target.value)} placeholder="https://example.com" /> : null}</label>
          </div>
          <button type="button" disabled={loading} onClick={generate} className={`${styles.primaryButton} ${styles.fullButton}`}>{loading ? "Generating preview\u2026" : result ? "Regenerate Sticker" : "Generate Sticker"}</button>
          {result ? (
            <div className={styles.generated}>
              <div className={styles.generatedImage}><Image src={result.imageUrl} alt="Generated sticker preview" width={280} height={280} className={styles.previewImage} /></div>
              <div><p className={styles.eyebrow}>Preview ready</p><h3 className={styles.methodTitle}>Review your concept</h3><p className={styles.methodDescription}>This preview is not automatically marked print-ready. Production artwork will still be checked for resolution, bleed, safe zone, cut line, and color.</p><div className={styles.buttonRow}><a className={styles.secondaryButton} href={result.imageUrl} download="sticker-preview.png">Download Preview</a><button type="button" className={styles.primaryButton} onClick={() => onUse(result)}>Use This Design</button></div></div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={`${styles.field} ${className}`}><span>{label}</span>{children}</label>; }
