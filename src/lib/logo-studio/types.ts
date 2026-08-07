/** Shared types for the Logo Studio generator. */

export type MarkFamily =
  | "shard"
  | "hexShield"
  | "orbit"
  | "peak"
  | "badge"
  | "monoblock"
  | "glyphmark"
  | "arcMono";

export type Layout = "stacked" | "horizontal" | "iconOnly";

export type Palette = {
  id: string;
  name: string;
  /** Primary brand colour — the one the mark leads with. */
  primary: string;
  /** Secondary, used for the second plane of two-tone marks. */
  secondary: string;
  /** Deep tone for backgrounds and dark lockups. */
  deep: string;
  /** Text colour on dark backgrounds. */
  light: string;
};

export type FontPair = {
  id: string;
  name: string;
  /** CSS stack. Kept to widely-installed families so exported SVG still resolves. */
  stack: string;
  /** Weight for the business name. */
  nameWeight: number;
  /** Weight and tracking for the descriptor line. */
  subWeight: number;
  nameTracking: number;
  subTracking: number;
  uppercase: boolean;
};

export type Brief = {
  businessName: string;
  /** Optional second line — "ELECTRIC", "SOLUTIONS", "CONSULTING". */
  descriptor: string;
  industryId: string;
  /** Style tags chosen in step 2, e.g. "modern", "bold". */
  styles: string[];
  paletteId: string;
  /** Where the logo will live — informs which families are offered. */
  usage: string[];
  layout: Layout | "auto";
};

export type Concept = {
  id: string;
  family: MarkFamily;
  palette: Palette;
  font: FontPair;
  layout: Layout;
  /** Glyph id for pictorial families; null for pure letterforms. */
  glyphId: string | null;
  /** Deterministic per-concept variation seed. */
  seed: number;
  /** Renders on a light card instead of the dark default. */
  onLight: boolean;
};

export type Industry = {
  id: string;
  name: string;
  /** Glyph ids that suit this industry, best-first. */
  glyphs: string[];
  /** Palette ids that suit this industry, best-first. */
  palettes: string[];
};
