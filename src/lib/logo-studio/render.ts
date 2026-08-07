import { GLYPHS } from "./data";
import type { Concept, Layout, Palette } from "./types";

/**
 * Turns a Concept into an SVG string.
 *
 * Deliberately a string rather than JSX: the exact same output feeds the live
 * preview, the mockup scenes and the downloaded files, so what a customer sees
 * is byte-for-byte what they get. Gradient ids are namespaced per render
 * because a page shows a dozen of these at once and duplicate ids would make
 * every mark inherit the first one's fill.
 */

export type RenderOptions = {
  /** Draw for a light background (dark text) instead of the dark default. */
  onLight?: boolean;
  /** Force a layout, e.g. iconOnly for a favicon. Defaults to the concept's. */
  layout?: Layout;
  /** Unique suffix for gradient ids. Defaults to the concept id. */
  ns?: string;
  /** Include an XML prolog — needed for a standalone .svg file. */
  standalone?: boolean;
  /** Override colours (used by the customise step). */
  palette?: Palette;
};

const ICON = 200; // icon design grid

export function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function initials(name: string, max = 2) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "A";
  if (words.length === 1) return words[0].slice(0, max).toUpperCase();
  return words
    .slice(0, max)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Rough advance width in em units, used only to size the viewBox.
 *
 * Deliberately generous: under-estimating clips the wordmark, which is a
 * visible defect, while over-estimating just adds a little air. The 1.08
 * factor covers the heavier faces (Arial Black, Georgia bold) whose caps run
 * wider than the average this approximates.
 */
function textWidthEm(text: string, tracking: number) {
  const narrow = /[IJL1!.,:;'\s]/;
  const wide = /[MW@%]/;
  let w = 0;
  for (const ch of text) w += narrow.test(ch) ? 0.36 : wide.test(ch) ? 0.86 : 0.66;
  return (w + tracking * Math.max(0, text.length - 1)) * 1.08;
}

/* ── Mark families ──────────────────────────────────────────────────────
   Each returns markup drawn inside a 0 0 200 200 box. */

function markShard(p: Palette, ns: string, seed: number) {
  const skew = 12 + (seed % 3) * 4;
  return `
  <defs>
    <linearGradient id="${ns}-a" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
    <linearGradient id="${ns}-b" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity=".92"/><stop offset="100%" stop-color="#9AA6B4"/>
    </linearGradient>
  </defs>
  <path fill="url(#${ns}-b)" d="M28 46h84l-${skew} 30H28z"/>
  <path fill="url(#${ns}-b)" d="M52 88h44l-${skew} 30H52z" opacity=".85"/>
  <path fill="url(#${ns}-a)" d="M${88 + skew} 46h84l-${skew} 30H${88 + skew}z"/>
  <path fill="url(#${ns}-a)" d="M104 88h52l-14 66-38-18z"/>`;
}

function markHexShield(p: Palette, ns: string, text: string, font: string) {
  return `
  <defs>
    <linearGradient id="${ns}-h" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <path fill="url(#${ns}-h)" d="M100 16 172 56v88l-72 40-72-40V56z"/>
  <path fill="${p.deep}" d="M100 38 152 67v66l-52 29-52-29V67z"/>
  <text x="100" y="100" font-family="${font}" font-size="72" font-weight="800"
        fill="url(#${ns}-h)" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

function markOrbit(p: Palette, ns: string, glyph: string) {
  return `
  <defs>
    <linearGradient id="${ns}-o" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="76" fill="none" stroke="url(#${ns}-o)" stroke-width="9"/>
  <g transform="translate(50 50) scale(1.0)" fill="none" stroke="url(#${ns}-o)"
     stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`;
}

function markPeak(p: Palette, ns: string) {
  return `
  <defs>
    <linearGradient id="${ns}-p" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
    <linearGradient id="${ns}-q" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="#F2F5F8"/><stop offset="100%" stop-color="#8A95A2"/>
    </linearGradient>
  </defs>
  <path fill="url(#${ns}-q)" d="M18 156 74 52l30 56-16 26-14-24-22 46z"/>
  <path fill="url(#${ns}-p)" d="M96 156 134 52l48 104z"/>
  <path fill="url(#${ns}-p)" opacity=".55" d="M118 108h32l10 22h-52z"/>`;
}

function markBadge(p: Palette, ns: string, glyph: string, top: string, bottom: string, font: string) {
  return `
  <defs>
    <linearGradient id="${ns}-g" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
    <path id="${ns}-top" d="M100 100 m-68 0 a68 68 0 0 1 136 0" fill="none"/>
    <path id="${ns}-bot" d="M100 100 m68 0 a68 68 0 0 1 -136 0" fill="none"/>
  </defs>
  <circle cx="100" cy="100" r="92" fill="none" stroke="url(#${ns}-g)" stroke-width="5"/>
  <circle cx="100" cy="100" r="56" fill="none" stroke="url(#${ns}-g)" stroke-width="3" opacity=".6"/>
  <g transform="translate(65 65) scale(.7)" fill="none" stroke="url(#${ns}-g)"
     stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  <text font-family="${font}" font-size="19" font-weight="700" letter-spacing="4" fill="url(#${ns}-g)">
    <textPath href="#${ns}-top" startOffset="50%" text-anchor="middle">${escapeXml(top)}</textPath>
  </text>
  <text font-family="${font}" font-size="15" font-weight="600" letter-spacing="5" fill="url(#${ns}-g)" opacity=".8">
    <textPath href="#${ns}-bot" startOffset="50%" text-anchor="middle">${escapeXml(bottom)}</textPath>
  </text>`;
}

function markMonoblock(p: Palette, ns: string, text: string, font: string) {
  return `
  <defs>
    <linearGradient id="${ns}-m" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <rect x="14" y="14" width="172" height="172" rx="42" fill="url(#${ns}-m)"/>
  <text x="100" y="103" font-family="${font}" font-size="96" font-weight="900"
        fill="${p.deep}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

function markGlyph(p: Palette, ns: string, glyph: string) {
  return `
  <defs>
    <linearGradient id="${ns}-l" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <g transform="translate(20 20) scale(1.6)" fill="none" stroke="url(#${ns}-l)"
     stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`;
}

function markArcMono(p: Palette, ns: string, text: string, font: string) {
  return `
  <defs>
    <linearGradient id="${ns}-c" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${p.secondary}"/><stop offset="100%" stop-color="${p.primary}"/>
    </linearGradient>
  </defs>
  <path d="M100 20 a80 80 0 0 1 80 80" fill="none" stroke="url(#${ns}-c)" stroke-width="10" stroke-linecap="round"/>
  <path d="M100 180 a80 80 0 0 1 -80 -80" fill="none" stroke="url(#${ns}-c)" stroke-width="10" stroke-linecap="round" opacity=".45"/>
  <text x="100" y="102" font-family="${font}" font-size="82" font-weight="800"
        fill="url(#${ns}-c)" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

/** Draws just the icon, on the 200x200 grid. */
export function renderMark(concept: Concept, brief: { businessName: string; descriptor: string }, opts: RenderOptions = {}) {
  const p = opts.palette ?? concept.palette;
  const ns = opts.ns ?? concept.id;
  const font = concept.font.stack;
  const glyph = concept.glyphId ? pathsFrom(GLYPHS[concept.glyphId] ?? GLYPHS.sparkle) : "";
  const mono = initials(brief.businessName, concept.family === "monoblock" ? 1 : 2);

  switch (concept.family) {
    case "shard": return markShard(p, ns, concept.seed);
    case "hexShield": return markHexShield(p, ns, mono, font);
    case "orbit": return markOrbit(p, ns, glyph);
    case "peak": return markPeak(p, ns);
    case "badge":
      return markBadge(p, ns, glyph, brief.businessName, brief.descriptor || "EST 2026", font);
    case "monoblock": return markMonoblock(p, ns, mono, font);
    case "glyphmark": return markGlyph(p, ns, glyph);
    case "arcMono": return markArcMono(p, ns, mono, font);
  }
}

/** Glyph data is a single `d`; wrap it so stroke attributes apply cleanly. */
function pathsFrom(d: string) {
  return `<path d="${d}"/>`;
}

/* ── Full lockup ────────────────────────────────────────────────────── */

export function renderLogoSvg(
  concept: Concept,
  brief: { businessName: string; descriptor: string },
  opts: RenderOptions = {}
): string {
  const layout = opts.layout ?? concept.layout;
  const p = opts.palette ?? concept.palette;
  const f = concept.font;
  const ns = opts.ns ?? concept.id;
  const onLight = opts.onLight ?? concept.onLight;
  const ink = onLight ? "#0B1220" : "#FFFFFF";
  const subInk = p.primary;

  const name = f.uppercase ? brief.businessName.toUpperCase() : brief.businessName;
  const sub = f.uppercase ? brief.descriptor.toUpperCase() : brief.descriptor;
  const mark = renderMark(concept, brief, { ...opts, ns });

  if (layout === "iconOnly") {
    return wrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${mark}</svg>`, opts);
  }

  // Type sizes are chosen relative to the icon so lockups stay optically even.
  const nameSize = 46;
  const subSize = 20;
  const nameW = textWidthEm(name, f.nameTracking) * nameSize;
  const subW = sub ? textWidthEm(sub, f.subTracking) * subSize : 0;

  if (layout === "horizontal") {
    const gap = 34;
    const textW = Math.max(nameW, subW);
    const w = Math.round(ICON + gap + textW + 24);
    const h = 200;
    const tx = ICON + gap;
    const nameY = sub ? 96 : 108;
    const body = `
  <g>${mark}</g>
  <text x="${tx}" y="${nameY}" font-family="${f.stack}" font-size="${nameSize}" font-weight="${f.nameWeight}"
        letter-spacing="${(f.nameTracking * nameSize).toFixed(2)}" fill="${ink}">${escapeXml(name)}</text>
  ${sub ? `<text x="${tx}" y="${nameY + 40}" font-family="${f.stack}" font-size="${subSize}" font-weight="${f.subWeight}"
        letter-spacing="${(f.subTracking * subSize).toFixed(2)}" fill="${subInk}">${escapeXml(sub)}</text>` : ""}`;
    return wrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, opts);
  }

  // stacked
  const w = Math.round(Math.max(ICON + 48, nameW + 48, subW + 48));
  const h = sub ? 330 : 292;
  const cx = w / 2;
  const body = `
  <g transform="translate(${cx - ICON / 2} 0)">${mark}</g>
  <text x="${cx}" y="252" font-family="${f.stack}" font-size="${nameSize}" font-weight="${f.nameWeight}"
        letter-spacing="${(f.nameTracking * nameSize).toFixed(2)}" fill="${ink}" text-anchor="middle">${escapeXml(name)}</text>
  ${sub ? `<text x="${cx}" y="296" font-family="${f.stack}" font-size="${subSize}" font-weight="${f.subWeight}"
        letter-spacing="${(f.subTracking * subSize).toFixed(2)}" fill="${subInk}" text-anchor="middle">${escapeXml(sub)}</text>` : ""}`;
  return wrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, opts);
}

function wrap(svg: string, opts: RenderOptions) {
  return opts.standalone ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg;
}
