import type { FontPair, Industry, Palette } from "./types";

/**
 * Static design library for the generator.
 *
 * Everything here is data, not code, so the range of output grows by adding
 * entries rather than by writing new rendering logic. Glyphs are authored on a
 * 100x100 grid and stroked, not filled, so they stay legible when a mark is
 * scaled down to a favicon.
 */

/* ── Industry glyphs ─────────────────────────────────────────────────────
   Path data drawn in a 0 0 100 100 box, centred, designed for
   stroke-width ~7 with round caps. */

export const GLYPHS: Record<string, string> = {
  bolt: "M56 12 30 56h18l-6 32 28-46H52l4-30z",
  mountain: "M10 76 36 34l16 24 10-14 28 32z",
  hammer: "M28 24h30l10 12-12 10-10-10H28zM50 40 26 76l-8-6 24-36z",
  roof: "M12 52 50 22l38 30M24 52v26h52V52",
  droplet: "M50 16c14 18 22 28 22 38a22 22 0 0 1-44 0c0-10 8-20 22-38z",
  gear: "M50 34a16 16 0 1 0 0 32 16 16 0 0 0 0-32zM50 12v10M50 78v10M12 50h10M78 50h10M23 23l7 7M70 70l7 7M77 23l-7 7M30 70l-7 7",
  leaf: "M22 78C22 44 46 22 80 22c0 34-22 56-56 56zM30 70 66 36",
  wrench: "M66 22a18 18 0 0 0-22 24L22 68l10 10 22-22a18 18 0 0 0 24-22l-12 12-10-2-2-10z",
  wheel: "M50 14a36 36 0 1 0 0 72 36 36 0 0 0 0-72zM50 34a16 16 0 1 0 0 32 16 16 0 0 0 0-32zM50 14v20M50 66v20M14 50h20M66 50h20",
  heart: "M50 82 20 54a17 17 0 0 1 24-24l6 6 6-6a17 17 0 0 1 24 24z",
  cross: "M40 14h20v26h26v20H60v26H40V60H14V40h26z",
  dumbbell: "M20 38v24M32 30v40M68 30v40M80 38v24M32 50h36",
  node: "M50 14a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM22 62a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM78 62a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM45 33 27 62M55 33l18 29M32 72h36",
  home: "M14 48 50 18l36 30M26 46v34h48V46M42 80V60h16v20",
  scales: "M50 16v66M30 82h40M50 30 22 42l12 20 14-20zM50 30l28 12-12 20-14-20z",
  sparkle: "M50 14 58 42l28 8-28 8-8 28-8-28-28-8 28-8zM80 16l3 9 9 3-9 3-3 9-3-9-9-3 9-3z",
  paw: "M34 44a9 11 0 1 0 0-22 9 11 0 0 0 0 22zM66 44a9 11 0 1 0 0-22 9 11 0 0 0 0 22zM20 68a8 10 0 1 0 0-20 8 10 0 0 0 0 20zM80 68a8 10 0 1 0 0-20 8 10 0 0 0 0 20zM50 84c-12 0-20-7-20-15s8-15 20-15 20 7 20 15-8 15-20 15z",
  aperture: "M50 14a36 36 0 1 0 0 72 36 36 0 0 0 0-72zM50 14 32 78M50 14l32 26M86 46 40 84M78 72H22M14 60l24-42",
  book: "M50 28C40 20 26 20 16 22v50c10-2 24-2 34 6 10-8 24-8 34-6V22c-10-2-24-2-34 6zM50 28v56",
  chart: "M18 82V52M38 82V32M58 82V44M78 82V20M14 82h72",
  cut: "M28 20 72 70M72 20 28 70M26 82a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM74 82a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  fork: "M30 16v22a8 8 0 0 0 16 0V16M38 38v46M70 16c-8 0-12 10-12 20s4 14 12 14v34",
  camera: "M16 34h14l6-10h28l6 10h14v46H16zM50 44a15 15 0 1 0 0 30 15 15 0 0 0 0-30z",
  shield: "M50 14 20 26v24c0 18 13 32 30 36 17-4 30-18 30-36V26z",
  truck: "M12 30h44v34H12zM56 42h18l12 12v10H56zM30 76a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM72 76a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  compass: "M50 14a36 36 0 1 0 0 72 36 36 0 0 0 0-72zM64 36 56 56l-20 8 8-20z",
};

/* ── Industries ──────────────────────────────────────────────────────── */

export const INDUSTRIES: Industry[] = [
  { id: "electrical", name: "Electrical contracting", glyphs: ["bolt", "node", "shield"], palettes: ["voltage", "midnight", "signal"] },
  { id: "construction", name: "Construction & building", glyphs: ["roof", "hammer", "mountain"], palettes: ["ironclad", "forge", "midnight"] },
  { id: "roofing", name: "Roofing", glyphs: ["roof", "home", "shield"], palettes: ["ironclad", "forge", "voltage"] },
  { id: "plumbing", name: "Plumbing & HVAC", glyphs: ["droplet", "wrench", "gear"], palettes: ["signal", "voltage", "midnight"] },
  { id: "landscaping", name: "Landscaping & outdoor", glyphs: ["leaf", "mountain", "compass"], palettes: ["evergreen", "harvest", "ironclad"] },
  { id: "automotive", name: "Automotive & fleet", glyphs: ["wheel", "gear", "truck"], palettes: ["forge", "ironclad", "midnight"] },
  { id: "health", name: "Health & medical", glyphs: ["cross", "heart", "shield"], palettes: ["clinic", "signal", "evergreen"] },
  { id: "fitness", name: "Fitness & wellness", glyphs: ["dumbbell", "heart", "mountain"], palettes: ["forge", "voltage", "midnight"] },
  { id: "tech", name: "Technology & software", glyphs: ["node", "aperture", "sparkle"], palettes: ["midnight", "voltage", "orchid"] },
  { id: "realestate", name: "Real estate & property", glyphs: ["home", "compass", "shield"], palettes: ["midnight", "harvest", "clinic"] },
  { id: "legal", name: "Legal & professional", glyphs: ["scales", "shield", "book"], palettes: ["midnight", "ironclad", "harvest"] },
  { id: "finance", name: "Finance & accounting", glyphs: ["chart", "shield", "compass"], palettes: ["evergreen", "midnight", "clinic"] },
  { id: "beauty", name: "Beauty & salon", glyphs: ["sparkle", "cut", "heart"], palettes: ["orchid", "harvest", "clinic"] },
  { id: "pets", name: "Pet services", glyphs: ["paw", "heart", "home"], palettes: ["harvest", "evergreen", "orchid"] },
  { id: "food", name: "Restaurant & food", glyphs: ["fork", "leaf", "sparkle"], palettes: ["forge", "harvest", "evergreen"] },
  { id: "cleaning", name: "Cleaning services", glyphs: ["sparkle", "droplet", "shield"], palettes: ["signal", "clinic", "evergreen"] },
  { id: "creative", name: "Creative & media", glyphs: ["camera", "aperture", "sparkle"], palettes: ["orchid", "midnight", "forge"] },
  { id: "education", name: "Education & training", glyphs: ["book", "compass", "node"], palettes: ["midnight", "harvest", "clinic"] },
  { id: "logistics", name: "Logistics & delivery", glyphs: ["truck", "compass", "node"], palettes: ["voltage", "forge", "ironclad"] },
  { id: "other", name: "Something else", glyphs: ["sparkle", "shield", "compass"], palettes: ["midnight", "voltage", "ironclad"] },
];

/* ── Palettes ────────────────────────────────────────────────────────── */

export const PALETTES: Palette[] = [
  { id: "voltage", name: "Voltage", primary: "#2F6BFF", secondary: "#7CC4FF", deep: "#0A1428", light: "#EEF4FF" },
  { id: "midnight", name: "Midnight", primary: "#5B6CFF", secondary: "#A9B4FF", deep: "#0B1020", light: "#EFF1FF" },
  { id: "signal", name: "Signal", primary: "#00B8D4", secondary: "#7BE7F5", deep: "#04212A", light: "#EAFBFF" },
  { id: "forge", name: "Forge", primary: "#FF5A1F", secondary: "#FFB27A", deep: "#1A0C06", light: "#FFF1E8" },
  { id: "ironclad", name: "Ironclad", primary: "#8C97A3", secondary: "#E2E8EF", deep: "#12161B", light: "#F3F6F9" },
  { id: "evergreen", name: "Evergreen", primary: "#12A150", secondary: "#7BE0A6", deep: "#04180E", light: "#EBFBF1" },
  { id: "harvest", name: "Harvest", primary: "#D9A227", secondary: "#F5D98A", deep: "#1C1405", light: "#FFF8E7" },
  { id: "orchid", name: "Orchid", primary: "#9333EA", secondary: "#D3A6FF", deep: "#150726", light: "#F8F0FF" },
  { id: "clinic", name: "Clinic", primary: "#1D6FF3", secondary: "#9CC6FF", deep: "#081426", light: "#F1F6FF" },
];

export const PALETTE_BY_ID = Object.fromEntries(PALETTES.map((p) => [p.id, p]));

/* ── Fonts ───────────────────────────────────────────────────────────────
   Deliberately restricted to families that are either loaded by the site or
   installed almost everywhere, so an exported SVG still typesets correctly
   when it is opened outside the browser. */

export const FONTS: FontPair[] = [
  {
    id: "geometric",
    name: "Montserrat",
    stack: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
    nameWeight: 800,
    subWeight: 500,
    nameTracking: 0.02,
    subTracking: 0.42,
    uppercase: true,
  },
  {
    id: "grotesk",
    name: "Helvetica Neue",
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    nameWeight: 700,
    subWeight: 400,
    nameTracking: -0.01,
    subTracking: 0.34,
    uppercase: true,
  },
  {
    id: "editorial",
    name: "Georgia",
    stack: "Georgia, 'Times New Roman', serif",
    nameWeight: 700,
    subWeight: 400,
    nameTracking: 0.01,
    subTracking: 0.3,
    uppercase: true,
  },
  {
    id: "industrial",
    name: "Arial Black",
    stack: "'Arial Black', 'Arial Bold', Gadget, sans-serif",
    nameWeight: 900,
    subWeight: 500,
    nameTracking: 0.0,
    subTracking: 0.38,
    uppercase: true,
  },
  {
    id: "humanist",
    name: "Trebuchet MS",
    stack: "'Trebuchet MS', 'Segoe UI', Tahoma, sans-serif",
    nameWeight: 700,
    subWeight: 400,
    nameTracking: 0.015,
    subTracking: 0.3,
    uppercase: false,
  },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

/* ── Style vocabulary ────────────────────────────────────────────────── */

export const STYLES = [
  { id: "modern", label: "Modern", hint: "Clean geometry, confident spacing" },
  { id: "bold", label: "Bold", hint: "Heavy weight, high contrast" },
  { id: "professional", label: "Professional", hint: "Restrained, trustworthy" },
  { id: "industrial", label: "Industrial", hint: "Built to work hard" },
  { id: "premium", label: "Premium", hint: "Considered, upmarket" },
  { id: "friendly", label: "Friendly", hint: "Approachable and warm" },
  { id: "futuristic", label: "Futuristic", hint: "Sharp angles, energy" },
  { id: "minimal", label: "Minimal", hint: "As little as possible" },
];

export const USAGE = [
  { id: "website", label: "Website" },
  { id: "trucks", label: "Trucks & vehicles" },
  { id: "uniforms", label: "Uniforms & shirts" },
  { id: "signs", label: "Signs & storefront" },
  { id: "app", label: "App & social icons" },
  { id: "print", label: "Cards & print" },
];

/** Style tag → the mark families that express it, in preference order. */
export const STYLE_FAMILIES: Record<string, string[]> = {
  modern: ["shard", "arcMono", "glyphmark", "monoblock"],
  bold: ["shard", "monoblock", "hexShield", "peak"],
  professional: ["hexShield", "arcMono", "glyphmark", "badge"],
  industrial: ["hexShield", "peak", "monoblock", "badge"],
  premium: ["arcMono", "badge", "orbit", "glyphmark"],
  friendly: ["orbit", "glyphmark", "arcMono", "peak"],
  futuristic: ["shard", "orbit", "peak", "monoblock"],
  minimal: ["glyphmark", "arcMono", "monoblock", "shard"],
};
