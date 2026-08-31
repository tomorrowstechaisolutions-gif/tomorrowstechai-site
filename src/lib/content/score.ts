import "server-only";
import type { BrandProfile } from "./brand";
import { FORMAT_BY_KEY, type FormatSpec } from "./formats";

/**
 * A content score, presented as what it is: guidance.
 *
 * Everything here is a mechanical property of the text — length against the
 * platform's own truncation point, whether a call to action exists, whether
 * a banned phrase slipped through, how heavy the sentences are. None of it
 * predicts whether a post will do well, and the UI must not imply otherwise.
 *
 * It is worth having anyway, because the mechanical faults are the ones that
 * are boring to catch by eye and cost the most: a hook buried past the fold,
 * a post with no next step, a word the brand has banned.
 *
 * Brand consistency is checked against the brand's own prohibited list, not
 * against a model's opinion of the brand.
 */

export type ScoreCategory = {
  key: string;
  label: string;
  points: number;
  max: number;
  note: string;
  ok: boolean;
};

export type ContentScore = {
  total: number;
  band: "strong" | "workable" | "weak";
  categories: ScoreCategory[];
};

export type ScoreInput = {
  body: string | null;
  title: string;
  cta: string | null;
  hashtags: string[];
  formatKey?: string;
  platform: string | null;
  brand: BrandProfile | null;
};

/** Very rough: a hook is the first sentence or the first line, whichever ends sooner. */
function hookOf(body: string): string {
  const firstLine = body.split(/\n/)[0] ?? "";
  const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? "";
  return (firstLine.length <= firstSentence.length ? firstLine : firstSentence).trim();
}

function specFor(input: ScoreInput): FormatSpec | null {
  if (input.formatKey && FORMAT_BY_KEY[input.formatKey]) return FORMAT_BY_KEY[input.formatKey];
  return null;
}

export function scoreContent(input: ScoreInput): ContentScore {
  const body = (input.body ?? "").trim();
  const categories: ScoreCategory[] = [];
  const add = (key: string, label: string, points: number, max: number, note: string) =>
    categories.push({ key, label, points, max, note, ok: points >= max * 0.7 });

  if (!body) {
    return {
      total: 0,
      band: "weak",
      categories: [
        { key: "empty", label: "No copy", points: 0, max: 100, note: "There is nothing written yet.", ok: false },
      ],
    };
  }

  const words = body.split(/\s+/).filter(Boolean);
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const hook = hookOf(body);
  const spec = specFor(input);

  // ── Hook: does the opening stand on its own? ──────────────────────
  const truncatesAt = spec?.truncatesAt;
  if (hook.length === 0) {
    add("hook", "Hook", 0, 20, "The copy has no clear opening line.");
  } else if (hook.length > 200) {
    add("hook", "Hook", 8, 20, "The opening runs long — the first line is doing too much work.");
  } else if (truncatesAt && body.length > truncatesAt && hook.length > truncatesAt) {
    add(
      "hook",
      "Hook",
      10,
      20,
      `The opening runs past the ${truncatesAt}-character fold on this platform, so it gets cut mid-thought.`
    );
  } else {
    add("hook", "Hook", 20, 20, "The opening line works on its own.");
  }

  // ── Call to action ────────────────────────────────────────────────
  const hasCta = Boolean(input.cta?.trim());
  const impliesCta = /\b(call|book|message|reply|visit|get in touch|find out|see how|start|request|dm)\b/i.test(body);
  if (hasCta) add("cta", "Call to action", 20, 20, "There is a stated next step.");
  else if (impliesCta) add("cta", "Call to action", 13, 20, "The copy suggests a next step but none is recorded on the item.");
  else add("cta", "Call to action", 0, 20, "There is no next step — nobody is being asked to do anything.");

  // ── Length against the format ─────────────────────────────────────
  if (!spec) {
    add("length", "Length", 12, 15, "No format is set, so length cannot be checked against a platform.");
  } else if (words.length < 20) {
    add("length", "Length", 5, 15, `Only ${words.length} words — short for a ${spec.label.toLowerCase()}.`);
  } else if (truncatesAt && body.length > truncatesAt * 8) {
    add("length", "Length", 8, 15, `Long for a ${spec.label.toLowerCase()}; most readers stop well before the end.`);
  } else {
    add("length", "Length", 15, 15, `Reasonable length for a ${spec.label.toLowerCase()}.`);
  }

  // ── Readability, crudely: sentence length ─────────────────────────
  const avgWords = words.length / Math.max(sentences.length, 1);
  if (avgWords > 28) add("readability", "Readability", 5, 15, `Sentences average ${Math.round(avgWords)} words — heavy going.`);
  else if (avgWords > 20) add("readability", "Readability", 10, 15, `Sentences average ${Math.round(avgWords)} words. Trimming a few would help.`);
  else add("readability", "Readability", 15, 15, `Sentences average ${Math.round(avgWords)} words — easy to read.`);

  // ── Brand consistency: the brand's own banned list ────────────────
  const banned = (input.brand?.prohibitedPhrases ?? []).filter((p) =>
    p.trim() ? new RegExp(`\\b${p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body) : false
  );
  if (banned.length > 0) {
    add("brand", "Brand fit", 0, 20, `Uses ${banned.length === 1 ? "a phrase" : "phrases"} this brand has banned: ${banned.join(", ")}.`);
  } else if (!input.brand) {
    add("brand", "Brand fit", 12, 20, "No brand profile attached, so voice cannot be checked.");
  } else {
    add("brand", "Brand fit", 20, 20, `Nothing here breaks ${input.brand.name}'s rules.`);
  }

  // ── Platform fit: hashtags where the format wants them ────────────
  if (!spec) {
    add("platform", "Platform fit", 7, 10, "No format set.");
  } else if (spec.hashtags && input.hashtags.length === 0) {
    add("platform", "Platform fit", 4, 10, `${spec.label} posts normally carry hashtags; this one has none.`);
  } else if (!spec.hashtags && input.hashtags.length > 0) {
    add("platform", "Platform fit", 7, 10, `${spec.label} does not need hashtags — they read as noise here.`);
  } else {
    add("platform", "Platform fit", 10, 10, "Matches what this platform expects.");
  }

  const total = categories.reduce((t, c) => t + c.points, 0);
  const band: ContentScore["band"] = total >= 80 ? "strong" : total >= 55 ? "workable" : "weak";

  return { total, band, categories };
}
