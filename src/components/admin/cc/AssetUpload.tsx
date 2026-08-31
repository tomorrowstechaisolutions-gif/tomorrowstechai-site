"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IconImage, IconPlus } from "./Icons";

/**
 * Drag or click to add an asset.
 *
 * Uploads go to a PRIVATE bucket; nothing here produces a public link. The
 * grid shows a signed URL minted on demand and expiring in five minutes.
 */
export default function AssetUpload({ brandId }: { brandId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (brandId) fd.append("brand_profile_id", brandId);
      const res = await fetch("/api/admin/assets", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "The upload failed.");
      else router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`cc-drop ${over ? "is-over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) send(file);
        }}
        disabled={busy}
      >
        <span className="cc-drop-icon">{busy ? <IconImage size={17} /> : <IconPlus size={17} />}</span>
        <span className="cc-drop-label">{busy ? "Uploading…" : "Upload asset"}</span>
        <span className="cc-drop-hint">Drag & drop or click</span>
      </button>

      <input
        ref={input}
        type="file"
        hidden
        accept="image/*,video/*,audio/*,application/pdf,text/plain,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) send(file);
          e.target.value = "";
        }}
      />

      {error ? <div className="cc-error"><span>{error}</span></div> : null}
    </>
  );
}
