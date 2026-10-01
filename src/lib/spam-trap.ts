/**
 * The hidden spam-trap field every public form carries.
 *
 * Its name must contain NO word a browser or password manager autofills on —
 * company, organization, url, website, name, email, phone, address. The old
 * `hp_company_url` matched Chrome's organisation autofill, so real people who
 * autofilled had the trap filled for them and were silently discarded as bots
 * (found 2026-09-30). No `server-only`: the client forms import the name.
 */
export const SPAM_TRAP_FIELD = "ttai_trap_zq";

/**
 * True when a submission should be dropped as a bot: the trap is filled, or
 * the form was completed faster than a person can. Every drop is logged, so a
 * real person being caught shows up in the Vercel logs instead of vanishing.
 */
export function isBotSubmission(
  body: Record<string, unknown>,
  form: string,
  minElapsedMs: number
): boolean {
  const trapRaw = body[SPAM_TRAP_FIELD];
  const trap = typeof trapRaw === "string" ? trapRaw.trim() : "";
  const elapsedRaw = body.elapsed_ms;
  const elapsed =
    typeof elapsedRaw === "number" ? elapsedRaw
    : typeof elapsedRaw === "string" && elapsedRaw.trim() !== "" ? Number(elapsedRaw)
    : Number.POSITIVE_INFINITY;
  const tooFast = Number.isFinite(elapsed) && elapsed < minElapsedMs;
  if (!trap && !tooFast) return false;
  const email = typeof body.email === "string" ? body.email.slice(0, 200) : null;
  console.warn(`[spam-trap] ${form} submission dropped as bot:`, JSON.stringify({ trapFilled: Boolean(trap), elapsed: Number.isFinite(elapsed) ? elapsed : null, email }));
  return true;
}
