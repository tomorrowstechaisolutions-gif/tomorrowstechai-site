import { FONTS, GLYPHS, INDUSTRIES, PALETTE_BY_ID, PALETTES, STYLE_FAMILIES } from "./data";
import type { Brief, Concept, Layout, MarkFamily } from "./types";

/**
 * Concept generator.
 *
 * Deterministic by design: the same brief and round number always produce the
 * same concepts, so a customer can leave and come back to the same set, and a
 * concept id is enough to reproduce a mark exactly. "Generate more" just walks
 * to the next round rather than rolling dice.
 */

/** mulberry32 — small, fast, well-distributed. Enough for design variation. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Ranked, de-duplicated pick list built from the chosen style tags. */
function familyPool(styles: string[]): MarkFamily[] {
  const score = new Map<string, number>();
  const tags = styles.length ? styles : ["modern", "professional"];
  tags.forEach((tag) => {
    (STYLE_FAMILIES[tag] ?? []).forEach((fam, i) => {
      score.set(fam, (score.get(fam) ?? 0) + (4 - i));
    });
  });
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f as MarkFamily);
  // Always keep a couple of wildcards so a set never looks monotonous.
  const all: MarkFamily[] = ["shard", "hexShield", "orbit", "peak", "badge", "monoblock", "glyphmark", "arcMono"];
  all.forEach((f) => {
    if (!ranked.includes(f)) ranked.push(f);
  });
  return ranked;
}

function fontPool(styles: string[]) {
  const prefer: Record<string, string[]> = {
    modern: ["geometric", "grotesk"],
    bold: ["industrial", "geometric"],
    professional: ["grotesk", "geometric"],
    industrial: ["industrial", "grotesk"],
    premium: ["editorial", "geometric"],
    friendly: ["humanist", "geometric"],
    futuristic: ["geometric", "industrial"],
    minimal: ["grotesk", "geometric"],
  };
  const ids: string[] = [];
  (styles.length ? styles : ["modern"]).forEach((s) => (prefer[s] ?? []).forEach((id) => ids.push(id)));
  FONTS.forEach((f) => ids.push(f.id));
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => FONTS.find((f) => f.id === id)!);
}

export const CONCEPTS_PER_ROUND = 6;

export function generateConcepts(brief: Brief, round = 0): Concept[] {
  const industry = INDUSTRIES.find((i) => i.id === brief.industryId) ?? INDUSTRIES[INDUSTRIES.length - 1];
  const base = hash(`${brief.businessName}|${brief.industryId}|${brief.styles.join(",")}|${brief.paletteId}`);
  const rand = rng(base + round * 7919);

  const families = familyPool(brief.styles);
  const fonts = fontPool(brief.styles);

  // The chosen palette leads; industry-appropriate palettes fill in behind it
  // so a set shows range without drifting off-brief.
  const chosen = PALETTE_BY_ID[brief.paletteId] ?? PALETTES[0];
  const palettes = [
    chosen,
    ...industry.palettes.map((id) => PALETTE_BY_ID[id]).filter((p) => p && p.id !== chosen.id),
    ...PALETTES.filter((p) => p.id !== chosen.id),
  ];

  const glyphs = [...industry.glyphs, ...Object.keys(GLYPHS)];

  const out: Concept[] = [];
  for (let i = 0; i < CONCEPTS_PER_ROUND; i++) {
    const slot = round * CONCEPTS_PER_ROUND + i;
    const family = families[slot % families.length];
    const font = fonts[Math.floor(rand() * Math.min(3, fonts.length))];
    // Two thirds of a set stay on the chosen palette; the rest explore.
    const palette = i % 3 === 2 ? palettes[1 + (slot % Math.max(1, palettes.length - 1))] : palettes[0];
    const needsGlyph = family === "orbit" || family === "glyphmark" || family === "badge";
    const glyphId = needsGlyph ? glyphs[slot % Math.min(4, glyphs.length)] : null;

    out.push({
      id: `c${round}-${i}-${(base % 9973).toString(36)}`,
      family,
      palette,
      font,
      layout: resolveLayout(brief, family, i),
      glyphId,
      seed: Math.floor(rand() * 1000),
      // One card per row renders light, matching the mockup's mixed grid and
      // proving the mark works on both backgrounds.
      onLight: i === 2 || i === 3,
    });
  }
  return out;
}

function resolveLayout(brief: Brief, family: MarkFamily, i: number): Layout {
  if (brief.layout !== "auto") return brief.layout;
  if (family === "badge") return "iconOnly";
  // Wide names read badly stacked under a big mark.
  if (brief.businessName.length > 16) return i % 2 === 0 ? "horizontal" : "stacked";
  return i % 3 === 1 ? "horizontal" : "stacked";
}

/** Default brief — also the shape the wizard starts from. */
export function emptyBrief(): Brief {
  return {
    businessName: "",
    descriptor: "",
    industryId: "electrical",
    styles: ["modern", "bold"],
    paletteId: "voltage",
    usage: ["website", "signs"],
    layout: "auto",
  };
}
