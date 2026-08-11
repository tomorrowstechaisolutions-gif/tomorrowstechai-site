/**
 * Lone Star Loud artwork, drawn entirely in code.
 *
 * Every graphic here is live SVG — no image payload, scales to any size, and
 * recolors with the shirt. To swap in real print files later, set `image` on
 * the product in catalog.ts; <ShirtArt> is bypassed automatically.
 *
 * NOTE ON IDS: each SVG defines its own filter/clip ids. Because several of
 * these render on one page (grid + cart + lifestyle strip), every caller must
 * pass a `uid` unique to that placement, or url(#id) references will resolve
 * to the wrong element.
 */

import type { ReactElement } from "react";

import type { DesignId } from "./catalog";

const CREAM = "#e2d9c4";
const BONE = "#f2ece0";
const RED = "#c02430";
const RED_DEEP = "#9d1c26";
const BLUE = "#1d4270";

/** Simplified but geographically honest Texas outline, 100 x 98 units. */
const TEXAS =
  "M27.5 0 L50.4 0 L50.4 18.1 L56.5 18.1 L65.6 22.4 L71.8 24.3 L81 26.2 L86.3 24.3 L96.2 27.6 L96.2 43 L100 60.7 L90.8 63.6 L86.3 71 L74.8 78.5 L70.2 86 L71.8 97.2 L61.8 94.4 L54.2 84.1 L45 70.1 L39.7 62.6 L32.1 62.6 L27.5 70.1 L16 63.6 L12.2 54.2 L0.8 43.9 L0 42.1 L27.5 42.1 Z";

/** Five-point star, unit radius, centered on the origin, point up. */
const STAR_UNIT =
  "M0 -1 L0.2245 -0.309 L0.951 -0.309 L0.3633 0.1181 L0.588 0.809 L0 0.382 L-0.588 0.809 L-0.3633 0.1181 L-0.951 -0.309 L-0.2245 -0.309 Z";

function Star({
  cx,
  cy,
  r,
  fill,
  rotate = 0,
  opacity = 1,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  rotate?: number;
  opacity?: number;
}) {
  return (
    <path
      d={STAR_UNIT}
      fill={fill}
      opacity={opacity}
      transform={`translate(${cx} ${cy}) rotate(${rotate}) scale(${r})`}
    />
  );
}

/** Screen-print wear: roughened edges plus scattered ink dropout. */
function Distress({ uid, seed = 4 }: { uid: string; seed?: number }) {
  return (
    <defs>
      <filter id={`${uid}-rough`} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.62"
          numOctaves="3"
          seed={seed}
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="2.4"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
      <filter id={`${uid}-speck`} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          seed={seed + 11}
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.72"
        />
      </filter>
      <mask id={`${uid}-wear`}>
        <rect x="-40" y="-40" width="480" height="480" fill="#fff" />
        <rect
          x="-40"
          y="-40"
          width="480"
          height="480"
          filter={`url(#${uid}-speck)`}
          opacity="0.55"
        />
      </mask>
    </defs>
  );
}

/** Texas silhouette filled with the state flag. Draws in a 100 x 98 box. */
function TexasFlagShape({ uid, showStar = true }: { uid: string; showStar?: boolean }) {
  return (
    <g>
      <clipPath id={`${uid}-txclip`}>
        <path d={TEXAS} />
      </clipPath>
      <g clipPath={`url(#${uid}-txclip)`}>
        <rect x="0" y="0" width="34" height="98" fill={BLUE} />
        <rect x="34" y="0" width="66" height="49" fill={BONE} />
        <rect x="34" y="49" width="66" height="49" fill={RED} />
        {showStar && <Star cx={16} cy={44} r={12} fill={BONE} />}
      </g>
      <path d={TEXAS} fill="none" stroke={CREAM} strokeWidth="1.6" opacity="0.8" />
    </g>
  );
}

type ArtProps = { uid: string };

const slab = { fontFamily: "var(--ls-slab)" } as const;
const cond = { fontFamily: "var(--ls-cond)", fontWeight: 800 } as const;
const west = { fontFamily: "var(--ls-west)" } as const;

/* ---------------------------------------------------------------- 1 ------ */

function DontDan({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="Don't Dan My Texas">
      <Distress uid={uid} seed={3} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <text
          x="180"
          y="64"
          textAnchor="middle"
          style={slab}
          fontSize="50"
          fill={CREAM}
          letterSpacing="1"
        >
          DON&apos;T
        </text>
        <text
          x="180"
          y="152"
          textAnchor="middle"
          style={slab}
          fontSize="104"
          fill={RED}
          stroke={CREAM}
          strokeWidth="2.4"
          paintOrder="stroke"
        >
          DAN
        </text>
        <Star cx={44} cy={120} r={12} fill={RED} rotate={-12} />
        <Star cx={316} cy={120} r={12} fill={RED} rotate={12} />
        <text x="180" y="216" textAnchor="middle" style={slab} fill={CREAM}>
          <tspan fontSize="32">MY </tspan>
          <tspan fontSize="66">TEXAS</tspan>
        </text>
        <g transform="translate(122 246) scale(1.16)">
          <TexasFlagShape uid={uid} />
        </g>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- 2 ------ */

function StarsAtNight({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="The stars at night, don't vote for Dan">
      <Distress uid={uid} seed={8} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <text x="180" y="40" textAnchor="middle" style={cond} fontSize="26" fill={CREAM} letterSpacing="6">
          THE
        </text>
        <text x="180" y="106" textAnchor="middle" style={slab} fontSize="78" fill={BONE}>
          STARS
        </text>
        <text x="180" y="140" textAnchor="middle" style={west} fontSize="27" fill={CREAM} letterSpacing="2">
          AT NIGHT...
        </text>
        <Star cx={40} cy={96} r={9} fill={CREAM} opacity={0.75} />
        <Star cx={322} cy={82} r={7} fill={CREAM} opacity={0.6} />
        <Star cx={300} cy={132} r={5} fill={CREAM} opacity={0.5} />
        <g transform="translate(132 152) scale(0.96)">
          <TexasFlagShape uid={uid} showStar={false} />
          <g clipPath={`url(#${uid}-txclip)`}>
            <circle cx="17" cy="44" r="13" fill={BONE} />
            <circle cx="22" cy="40" r="11" fill={BLUE} />
          </g>
        </g>
        <text x="180" y="298" textAnchor="middle" style={slab} fontSize="34" fill={CREAM}>
          DON&apos;T VOTE FOR
        </text>
        <text
          x="180"
          y="362"
          textAnchor="middle"
          style={slab}
          fontSize="58"
          fill={RED}
          stroke={CREAM}
          strokeWidth="1.8"
          paintOrder="stroke"
        >
          DAN
        </text>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- 3 ------ */

function NotMyKind({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="Not my kind of Texas">
      <Distress uid={uid} seed={15} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <text x="180" y="54" textAnchor="middle" style={slab} fontSize="46" fill={CREAM}>
          NOT MY
        </text>
        <text x="180" y="104" textAnchor="middle" style={slab} fontSize="46" fill={CREAM}>
          KIND OF
        </text>
        <text
          x="180"
          y="186"
          textAnchor="middle"
          style={slab}
          fontSize="92"
          fill={BONE}
          stroke={RED_DEEP}
          strokeWidth="2"
          paintOrder="stroke"
        >
          TEXAS
        </text>
        <Star cx={180} cy={218} r={13} fill={RED} />
        <g>
          <rect x="88" y="240" width="184" height="94" fill="none" stroke={RED} strokeWidth="8" />
          <path d="M96 248 L264 326" stroke={RED} strokeWidth="9" strokeLinecap="round" />
          <path d="M264 248 L96 326" stroke={RED} strokeWidth="9" strokeLinecap="round" />
          <text
            x="180"
            y="310"
            textAnchor="middle"
            style={slab}
            fontSize="70"
            fill={CREAM}
            stroke="#0d0d10"
            strokeWidth="7"
            paintOrder="stroke"
          >
            DAN
          </text>
        </g>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- 4 ------ */

function DitchDan({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="Ditch Dan for Texas">
      <Distress uid={uid} seed={21} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <text x="180" y="70" textAnchor="middle" style={slab} fontSize="60" fill="#cfc7b3">
          DITCH
        </text>
        <text
          x="180"
          y="168"
          textAnchor="middle"
          style={slab}
          fontSize="106"
          fill={RED}
          stroke={CREAM}
          strokeWidth="2.4"
          paintOrder="stroke"
        >
          DAN
        </text>
        <g>
          <path d="M74 196 H150" stroke={CREAM} strokeWidth="3" />
          <path d="M210 196 H286" stroke={CREAM} strokeWidth="3" />
          <text x="180" y="207" textAnchor="middle" style={slab} fontSize="30" fill={CREAM}>
            FOR
          </text>
        </g>
        <text x="180" y="268" textAnchor="middle" style={slab} fontSize="66" fill={BONE}>
          TEXAS
        </text>
        <g transform="translate(137 284) scale(0.86)">
          <TexasFlagShape uid={uid} />
        </g>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- 5 ------ */

function LoneStarNoDan({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="Lone Star. No Dan.">
      <Distress uid={uid} seed={30} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <Star cx={180} cy={118} r={98} fill={BONE} />
        <text x="180" y="272" textAnchor="middle" style={slab} fontSize="54" fill={CREAM}>
          LONE STAR.
        </text>
        <text x="180" y="338" textAnchor="middle" style={slab} fontSize="60" fill={RED}>
          NO DAN.
        </text>
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- 6 ------ */

/** Simplified cowboy boot, drawn in a 100 x 140 box, toe pointing right. */
const BOOT =
  "M3 2 H51 L49 74 C72 80 92 90 98 103 C102 111 99 121 89 121 H30 L26 138 H6 L2 105 Z";

function Boot({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <g>
      <path d={BOOT} fill={fill} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
      {/* shaft stitching and pull strap */}
      <path d="M5 22 H50" stroke={stroke} strokeWidth="3" opacity="0.85" />
      <path d="M9 34 L27 56 L45 34" fill="none" stroke={stroke} strokeWidth="3" opacity="0.85" />
      <path d="M14 6 V18 M40 6 V18" stroke={stroke} strokeWidth="3" opacity="0.6" />
      {/* vamp seam, sole and heel */}
      <path d="M49 74 C58 88 62 104 60 121" fill="none" stroke={stroke} strokeWidth="3" opacity="0.75" />
      <path d="M30 121 H89" stroke={stroke} strokeWidth="3" opacity="0.7" />
      <path d="M6 138 H26" stroke={stroke} strokeWidth="3" opacity="0.7" />
    </g>
  );
}

function BootDan({ uid }: ArtProps) {
  return (
    <svg viewBox="0 0 360 380" role="img" aria-label="Boot Dan">
      <Distress uid={uid} seed={42} />
      <g mask={`url(#${uid}-wear)`} filter={`url(#${uid}-rough)`}>
        <text x="180" y="72" textAnchor="middle" style={slab} fontSize="62" fill={CREAM}>
          BOOT
        </text>
        <text
          x="180"
          y="186"
          textAnchor="middle"
          style={slab}
          fontSize="112"
          fill={RED}
          stroke={CREAM}
          strokeWidth="2.6"
          paintOrder="stroke"
        >
          DAN
        </text>
        <g transform="translate(56 208) scale(1.2)">
          <Boot fill={CREAM} stroke={RED_DEEP} />
        </g>
        <g transform="translate(304 208) scale(-1.2 1.2)">
          <Boot fill="#cfc7b3" stroke={RED_DEEP} />
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------ exports ---- */

const DESIGNS: Record<DesignId, (p: ArtProps) => ReactElement> = {
  "dont-dan": DontDan,
  "stars-at-night": StarsAtNight,
  "not-my-kind": NotMyKind,
  "ditch-dan": DitchDan,
  "lone-star-no-dan": LoneStarNoDan,
  "boot-dan": BootDan,
};

export function ShirtArt({ design, uid }: { design: DesignId; uid: string }) {
  const Art = DESIGNS[design];
  return <Art uid={uid} />;
}

/* ------------------------------------------------------- hero flag ------- */

/** Weathered Texas flag panel used behind the hero. */
export function HeroFlag() {
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="ls-hero-weather">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.05" numOctaves="4" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="ls-hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" seed="17" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <linearGradient id="ls-hero-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b0b0d" stopOpacity="0.96" />
          <stop offset="0.24" stopColor="#0b0b0d" stopOpacity="0.35" />
          <stop offset="0.62" stopColor="#0b0b0d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ls-hero-vig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0b0d" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#0b0b0d" stopOpacity="0" />
          <stop offset="1" stopColor="#0b0b0d" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <g filter="url(#ls-hero-weather)">
        <rect x="-30" y="-30" width="360" height="660" fill="#16305a" />
        <rect x="330" y="-30" width="500" height="330" fill="#d9d2c2" />
        <rect x="330" y="300" width="500" height="330" fill="#8f1f26" />
        <path
          d={STAR_UNIT}
          fill="#e8e2d3"
          transform="translate(150 300) rotate(-1) scale(150)"
        />
      </g>

      {/* Weathered plank / wear pass */}
      <rect x="0" y="0" width="800" height="600" filter="url(#ls-hero-grain)" opacity="0.22" style={{ mixBlendMode: "overlay" }} />
      <g opacity="0.16" stroke="#0b0b0d" strokeWidth="2">
        {Array.from({ length: 13 }, (_, i) => (
          <path key={i} d={`M0 ${i * 48 + 12} H800`} />
        ))}
      </g>
      <rect x="0" y="0" width="800" height="600" fill="url(#ls-hero-vig)" />
      <rect x="0" y="0" width="800" height="600" fill="url(#ls-hero-fade)" />
    </svg>
  );
}

/** Small standalone Texas-flag map used in the closing band. */
export function TexasMap({ uid = "ls-map" }: { uid?: string }) {
  return (
    <svg viewBox="-3 -3 106 104" aria-hidden="true" style={{ width: "100%", height: "auto" }}>
      <TexasFlagShape uid={uid} />
    </svg>
  );
}
