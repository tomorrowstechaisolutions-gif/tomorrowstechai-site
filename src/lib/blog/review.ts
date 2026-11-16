/**
 * The AI review's response shape and its tolerant parser, shared by the
 * /api/admin/blog/review route and the editor. No server-only imports.
 */

export type ReviewFinding = { quote: string; why: string };
export type BlogReview = {
  claims: ReviewFinding[];
  summary: { verdict: "clear" | "unclear" | "missing"; note: string; suggestion: string | null };
  seoTitles: string[];
  other: string[];
  model: string;
};

function str(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function parseReview(text: string): Omit<BlogReview, "model"> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const raw = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as Record<string, unknown>;
  const claims = (Array.isArray(raw.claims) ? raw.claims : [])
    .map((c) => ({ quote: str((c as ReviewFinding)?.quote, 400), why: str((c as ReviewFinding)?.why, 400) }))
    .filter((c) => c.quote)
    .slice(0, 12);
  const s = (raw.summary ?? {}) as Record<string, unknown>;
  const verdict = s.verdict === "clear" || s.verdict === "missing" ? s.verdict : "unclear";
  const suggestion = str(s.suggestion, 300) || null;
  const seoTitles = (Array.isArray(raw.seoTitles) ? raw.seoTitles : [])
    .map((t) => str(t, 120))
    .filter(Boolean)
    .slice(0, 3);
  const other = (Array.isArray(raw.other) ? raw.other : []).map((t) => str(t, 400)).filter(Boolean).slice(0, 4);
  return { claims, summary: { verdict, note: str(s.note, 400), suggestion: verdict === "clear" ? null : suggestion }, seoTitles, other };
}
