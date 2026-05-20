"use client";

import { useState } from "react";

type Props = {
  id: string;
  title: string;
  className?: string;
};

/**
 * Lazy-loads a YouTube embed.
 * Initially renders only a thumbnail + play button (no JS, no iframe).
 * On user click, swaps in the real youtube-nocookie iframe.
 *
 * This pattern reduces Total Blocking Time significantly because
 * YouTube's player JS is heavy — we shouldn't load it for visitors
 * who never click play.
 */
export function LazyYouTube({ id, title, className = "" }: Props) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className={`absolute inset-0 w-full h-full ${className}`}
      />
    );
  }

  // YouTube provides several thumbnail sizes: maxresdefault is highest quality
  // (1280x720), hqdefault is the safer fallback (480x360) that always exists.
  const thumbUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      aria-label={`Play ${title}`}
      className={`absolute inset-0 w-full h-full group cursor-pointer bg-black overflow-hidden ${className}`}
    >
      {/* Static thumbnail — no JS needed to render this */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl}
        alt={title}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
      />
      {/* Cyan-bordered play button overlay */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[color:var(--color-cyan)]/90 border-2 border-[color:var(--color-cyan)] flex items-center justify-center shadow-[0_0_30px_rgba(0,217,255,0.4)] group-hover:scale-110 transition-transform">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="black"
            aria-hidden="true"
            className="translate-x-0.5"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
