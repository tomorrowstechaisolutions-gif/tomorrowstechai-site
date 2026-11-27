"use client";

import Image from "next/image";
import { useState } from "react";
import { LeadMagnetForm } from "@/components/LeadMagnetForm";
import { IconDownload } from "@/components/Icons";
import type { Volume } from "@/lib/academy/library";

export function LibraryCard({ volume }: { volume: Volume }) {
  const [open, setOpen] = useState(false);
  const live = Boolean(volume.magnet);

  return (
    <article className="ac-volume" data-live={live || undefined}>
      <div className="ac-volume-cover">
        {volume.cover ? (
          <Image src={volume.cover} alt={`${volume.title} cover`} fill sizes="(max-width: 768px) 50vw, 260px" className="object-cover" />
        ) : (
          <div className="ac-volume-blank">
            <span className="ac-kicker">Volume {volume.number}</span>
            <strong>{volume.title}</strong>
            <span className="text-xs text-[color:var(--color-text-muted)]">In production</span>
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="ac-kicker mb-2">
          Vol {volume.number} · {volume.teaches}
          {volume.pages ? ` · ${volume.pages} pages` : ""}
        </div>
        <h3 className="text-lg font-medium leading-snug mb-1">{volume.title}</h3>
        <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed mb-4">{volume.subtitle}</p>
        <ul className="ac-ticks mb-5">
          {volume.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <div className="mt-auto">
          {!live ? (
            <span className="ac-pill">Coming soon</span>
          ) : open ? (
            <LeadMagnetForm
              magnet={volume.magnet}
              buttonLabel="Email me the PDF →"
              successMessage={`${volume.title} is on its way to your inbox. You can also download it right here.`}
            />
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-sm">
              <IconDownload size={15} /> Get it free
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
