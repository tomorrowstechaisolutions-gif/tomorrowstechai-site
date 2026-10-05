import { useRef } from "react";
import type { ArtworkState, DesignMethod, DesignRequest } from "@/lib/stickers/types";
import { validateArtworkFile } from "@/lib/stickers/validation";
import styles from "./StickerPage.module.css";

const METHODS: Array<{ id: DesignMethod; icon: string; title: string; description: string; action: string }> = [
  { id: "upload", icon: "\u21e7", title: "Upload My Design", description: "Have a design ready? Upload your file and we'll take care of the rest.", action: "Upload Design" },
  { id: "design-service", icon: "\u25cf", title: "Have Us Design It", description: "Tell us what you need and we'll create a professional design for you.", action: "Request a Design" },
  { id: "ai", icon: "\u2726", title: "Create With AI", description: "Use our AI Sticker Studio to instantly generate custom sticker designs.", action: "Open AI Sticker Studio" },
];

type Props = {
  method: DesignMethod;
  artwork: ArtworkState;
  designRequest: DesignRequest;
  onMethod: (method: DesignMethod) => void;
  onArtwork: (artwork: ArtworkState) => void;
  onDesignRequest: (next: DesignRequest) => void;
  onOpenAI: () => void;
  onToast: (message: string) => void;
};

export function DesignMethodSelector({ method, artwork, designRequest, onMethod, onArtwork, onDesignRequest, onOpenAI, onToast }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseMethod = (next: DesignMethod) => {
    onMethod(next);
    if (next === "upload") fileInput.current?.click();
    if (next === "ai") onOpenAI();
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const error = validateArtworkFile(file);
    if (error) { onToast(error); return; }
    const previewUrl = URL.createObjectURL(file);
    const next: ArtworkState = { previewUrl, originalFile: file, fileName: file.name, widthPx: null, heightPx: null, source: "upload" };
    if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
      const image = new Image();
      image.onload = () => onArtwork({ ...next, widthPx: image.naturalWidth, heightPx: image.naturalHeight });
      image.src = previewUrl;
    } else {
      onArtwork(next);
    }
    onToast("Artwork added. The original file will be retained with your order.");
  };

  const updateRequest = (key: keyof DesignRequest, value: string | File | null) => onDesignRequest({ ...designRequest, [key]: value });

  return (
    <>
      <div className={styles.methodGrid}>
        {METHODS.map((item) => (
          <button key={item.id} type="button" onClick={() => chooseMethod(item.id)} className={`${styles.methodCard} ${method === item.id ? styles.selected : ""}`} aria-pressed={method === item.id}>
            {item.id === "ai" ? <span className={styles.popular}>Popular</span> : null}
            <div className={styles.methodIcon} aria-hidden="true">{item.icon}</div>
            <h3 className={styles.methodTitle}>{item.title}</h3>
            <p className={styles.methodDescription}>{item.description}</p>
            <span className={`${styles.primaryButton} ${styles.fullButton}`}>{item.action}</span>
          </button>
        ))}
      </div>

      {method === "upload" ? (
        <div className={`${styles.panel} ${styles.methodBody}`}>
          <label className={styles.uploadZone}>
            <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.pdf,.svg,image/png,image/jpeg,application/pdf,image/svg+xml" onChange={(event) => handleFile(event.target.files?.[0])} />
            <span className={styles.methodIcon} aria-hidden="true">⇧</span>
            <span className={styles.uploadTitle}>{artwork.fileName ?? "Choose artwork or drop it here"}</span>
            <span className={styles.uploadMeta}>PNG, JPG, PDF, or SVG · Up to 25 MB · Original resolution preserved</span>
          </label>
        </div>
      ) : null}

      {method === "design-service" ? (
        <div className={`${styles.panel} ${styles.methodBody}`}>
          <div className={styles.formGrid}>
            <Field label="Business Name"><input className={styles.input} value={designRequest.businessName} onChange={(e) => updateRequest("businessName", e.target.value)} /></Field>
            <Field label="What should the sticker say?"><input className={styles.input} value={designRequest.stickerText} onChange={(e) => updateRequest("stickerText", e.target.value)} /></Field>
            <Field label="Business / Industry"><input className={styles.input} value={designRequest.industry} onChange={(e) => updateRequest("industry", e.target.value)} /></Field>
            <Field label="Colors"><input className={styles.input} value={designRequest.colors} onChange={(e) => updateRequest("colors", e.target.value)} placeholder="Blue, white, black" /></Field>
            <Field label="Style"><input className={styles.input} value={designRequest.style} onChange={(e) => updateRequest("style", e.target.value)} placeholder="Bold, modern, vintage..." /></Field>
            <Field label="QR code URL (optional)"><input className={styles.input} type="url" value={designRequest.qrCodeUrl} onChange={(e) => updateRequest("qrCodeUrl", e.target.value)} placeholder="https://" /></Field>
            <Field label="Upload logo" className={styles.span2}><input className={styles.input} type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" onChange={(e) => updateRequest("logo", e.target.files?.[0] ?? null)} /></Field>
            <Field label="Special instructions" className={styles.span2}><textarea className={styles.textarea} value={designRequest.instructions} onChange={(e) => updateRequest("instructions", e.target.value)} placeholder="Tell us what the finished sticker should feel like." /></Field>
          </div>
          <button type="button" onClick={() => onToast("Design brief saved to this order.")} className={`${styles.primaryButton} ${styles.fullButton}`}>Save Design Brief</button>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`${styles.field} ${className}`}><span>{label}</span>{children}</label>;
}
