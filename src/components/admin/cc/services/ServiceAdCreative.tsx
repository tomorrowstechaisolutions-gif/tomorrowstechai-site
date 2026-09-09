'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

export default function ServiceAdCreative({
  serviceId,
  serviceName,
  imagePath,
  version,
  canManage,
}: {
  serviceId: string;
  serviceName: string;
  imagePath: string | null;
  version: string;
  canManage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPTED.has(file.type)) return setError('Use a PNG, JPG, or WebP image.');
    if (file.size > MAX_BYTES) return setError('The image must be 10MB or smaller.');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/admin/services/${serviceId}/ad-image`, { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error ?? 'The image could not be uploaded.');
      else router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove the ad creative from ${serviceName}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/ad-image`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error ?? 'The image could not be removed.');
      else router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const imageUrl = `/api/admin/services/${serviceId}/ad-image?v=${encodeURIComponent(version)}`;
  return <div className="sv-creative">
    <div className="sv-creative-preview">
      {imagePath ? <Image src={imageUrl} alt={`${serviceName} ad creative`} width={1000} height={1000} sizes="(max-width: 700px) 100vw, 620px" unoptimized /> : <div className="sv-creative-empty"><strong>No ad picture yet</strong><span>Add a finished creative like the social media example.</span></div>}
    </div>
    <div className="sv-creative-controls">
      <div><h3>Service ad picture</h3><p className="sv-muted">Square artwork works best. Recommended: 1080 × 1080 PNG, JPG, or WebP, up to 10MB.</p></div>
      {canManage ? <>
        <button
          type="button"
          className={`sv-creative-drop ${dragging ? 'is-dragging' : ''}`}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
        >
          <strong>{busy ? 'Working…' : imagePath ? 'Replace picture' : '+ Add ad picture'}</strong>
          <span>Click to choose or drag an image here</span>
        </button>
        <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} />
        {imagePath ? <div className="sv-actions"><a className="cc-btn" href={`/api/admin/services/${serviceId}/ad-image?download=1`}>Download</a><button type="button" className="cc-btn" disabled={busy} onClick={() => void remove()}>Remove</button></div> : null}
      </> : <p className="sv-muted">Owners and admins can replace this creative.</p>}
      {error ? <p className="cc-error" role="alert">{error}</p> : null}
    </div>
  </div>;
}
