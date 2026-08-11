/**
 * Lifestyle strip. Coded illustrated scenes stand in for photography so the
 * page is complete today. To drop in real photos later, pass `image` to
 * <SceneCell> (or replace the cell contents with next/image) — nothing else
 * about the layout changes.
 */

import type { DesignId } from "./catalog";
import { ShirtArt } from "./ShirtArt";

/** Front-view tee silhouette, drawn in a 200 x 230 box. */
const TEE =
  "M40 26 L74 10 C82 28 118 28 126 10 L160 26 L178 64 L150 78 L147 222 L53 222 L50 78 L22 64 Z";

type SceneKind = "ranch" | "field" | "city";

function Backdrop({ kind }: { kind: SceneKind }) {
  if (kind === "ranch") {
    return (
      <>
        <defs>
          <linearGradient id="ls-sky-ranch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fb4cf" />
            <stop offset="0.6" stopColor="#cbd7d6" />
            <stop offset="1" stopColor="#b6b39a" />
          </linearGradient>
        </defs>
        <rect width="400" height="480" fill="url(#ls-sky-ranch)" />
        <rect y="330" width="400" height="150" fill="#7d7c5c" />
        <rect y="352" width="400" height="128" fill="#6b6a4e" />
        {/* barn */}
        <path d="M28 250 L104 218 L180 250 L180 344 L28 344 Z" fill="#6d3730" />
        <path d="M28 250 L104 218 L180 250 L180 264 L104 234 L28 264 Z" fill="#4f2723" />
        <rect x="88" y="286" width="34" height="58" fill="#3b2320" />
        <path d="M88 286 L122 344 M122 286 L88 344" stroke="#7d443c" strokeWidth="4" />
        {/* flag pole */}
        <rect x="300" y="150" width="5" height="196" fill="#9b9a86" />
        <g>
          <rect x="305" y="156" width="30" height="24" fill="#1d4270" />
          <rect x="335" y="156" width="58" height="12" fill="#e8e2d3" />
          <rect x="335" y="168" width="58" height="12" fill="#9d1c26" />
          <path
            d="M0 -1 L0.2245 -0.309 L0.951 -0.309 L0.3633 0.1181 L0.588 0.809 L0 0.382 L-0.588 0.809 L-0.3633 0.1181 L-0.951 -0.309 L-0.2245 -0.309 Z"
            fill="#e8e2d3"
            transform="translate(320 168) scale(8)"
          />
        </g>
        <path d="M0 336 Q 200 322 400 338 L400 348 L0 348 Z" fill="#5c5b43" />
      </>
    );
  }

  if (kind === "field") {
    return (
      <>
        <defs>
          <linearGradient id="ls-sky-field" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5f97c9" />
            <stop offset="0.72" stopColor="#bcd3e4" />
          </linearGradient>
        </defs>
        <rect width="400" height="480" fill="url(#ls-sky-field)" />
        <g fill="#f3f6f8" opacity="0.85">
          <ellipse cx="86" cy="86" rx="46" ry="21" />
          <ellipse cx="120" cy="76" rx="32" ry="18" />
          <ellipse cx="304" cy="120" rx="52" ry="20" />
          <ellipse cx="270" cy="112" rx="30" ry="15" />
        </g>
        {/* windmill */}
        <path d="M330 322 L338 200 L346 200 L354 322 Z" fill="#8a8a80" />
        <g stroke="#8a8a80" strokeWidth="3">
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M342 196 L${342 + 30 * Math.cos((i * Math.PI) / 6)} ${196 + 30 * Math.sin((i * Math.PI) / 6)}`} />
          ))}
        </g>
        <circle cx="342" cy="196" r="5" fill="#6f6f66" />
        <rect y="316" width="400" height="164" fill="#6f8a52" />
        <rect y="342" width="400" height="138" fill="#5d7a45" />
        {/* bluebonnets */}
        <g>
          {Array.from({ length: 46 }, (_, i) => {
            const x = (i * 61) % 400;
            const y = 336 + ((i * 37) % 130);
            return <ellipse key={i} cx={x} cy={y} rx="4" ry="7" fill={i % 3 === 0 ? "#e8e2d3" : "#3f5fa8"} opacity="0.9" />;
          })}
        </g>
      </>
    );
  }

  return (
    <>
      <defs>
        <linearGradient id="ls-sky-city" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f5b86" />
          <stop offset="0.55" stopColor="#8fa9bd" />
          <stop offset="1" stopColor="#d3c6ac" />
        </linearGradient>
      </defs>
      <rect width="400" height="480" fill="url(#ls-sky-city)" />
      <g fill="#3d4c5c" opacity="0.92">
        <rect x="8" y="176" width="42" height="150" />
        <rect x="56" y="140" width="30" height="186" />
        <rect x="92" y="196" width="38" height="130" />
        <rect x="272" y="120" width="34" height="206" />
        <rect x="312" y="164" width="46" height="162" />
        <rect x="364" y="196" width="34" height="130" />
        <path d="M284 120 L289 92 L294 120 Z" />
      </g>
      <g fill="#cdd8df" opacity="0.55">
        {Array.from({ length: 60 }, (_, i) => {
          const cols = [14, 26, 38, 62, 74, 98, 110, 122, 278, 290, 318, 332, 346, 370, 384];
          const x = cols[i % cols.length];
          const y = 150 + ((i * 29) % 160);
          return <rect key={i} x={x} y={y} width="6" height="8" />;
        })}
      </g>
      <rect y="326" width="400" height="154" fill="#4a6a74" />
      <g stroke="#7fa0a6" strokeWidth="2" opacity="0.5">
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} d={`M${-20 + i * 24} ${346 + i * 18} H${420}`} />
        ))}
      </g>
      <rect y="440" width="400" height="40" fill="#3c5860" />
    </>
  );
}

export function SceneCell({
  kind,
  design,
  shirt = "#141418",
  image,
  alt,
}: {
  kind: SceneKind;
  design: DesignId;
  shirt?: string;
  image?: string;
  alt: string;
}) {
  if (image) {
    return (
      <div className="ls-life-cell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={alt} />
      </div>
    );
  }

  const uid = `life-${kind}`;

  return (
    <div className="ls-life-cell ls-grain">
      <svg viewBox="0 0 400 480" preserveAspectRatio="xMidYMid slice" role="img" aria-label={alt}>
        <Backdrop kind={kind} />

        <g transform="translate(100 176) scale(1.32)">
          <path d={TEE} fill={shirt} />
          <path d={TEE} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
          {/* soft fabric shading so the tee doesn't read flat */}
          <path d="M50 78 L53 222 L92 222 L86 80 Z" fill="rgba(255,255,255,0.05)" />
          <path d="M147 222 L114 222 L120 80 L150 78 Z" fill="rgba(0,0,0,0.18)" />
          <svg x="56" y="70" width="88" height="130" viewBox="0 0 360 380" overflow="visible">
            <ShirtArt design={design} uid={uid} />
          </svg>
        </g>
      </svg>
    </div>
  );
}
