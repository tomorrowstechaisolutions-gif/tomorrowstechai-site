import "server-only";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";

/**
 * Resolving the live system prompt.
 *
 * This is what makes the Prompt & Behavior tab real rather than a text box
 * that saves into a table nobody reads. A route calls
 * `resolveSystemPrompt(slug, CODE_DEFAULT)` and gets whichever version is
 * marked active in the database, falling back to the constant in the file.
 *
 * The fallback is not a nicety, it is the safety property: if the database
 * is unreachable, if no version has been activated, or if somebody manages
 * to activate an empty prompt, the assistant keeps running on the prompt
 * that shipped with the code. A prompt editor that can take a production
 * assistant offline is not worth having.
 *
 * Only solutions with `prompt_editable = true` are wired up this way. The
 * advisor and the planners hand back JSON that other code parses; their
 * instructions stay in the code and the screen says why.
 */

const CACHE_MS = 60_000;
const MIN_USEFUL_LENGTH = 40;

const cache = new Map<string, { at: number; value: string | null }>();

export async function resolveSystemPrompt(slug: string, fallback: string): Promise<string> {
  try {
    if (!supabaseConfigured()) return fallback;

    const cached = cache.get(slug);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.value ?? fallback;
    }

    const { data, error } = await supabaseAdmin()
      .from("ai_solutions")
      .select("prompt_editable, ai_solution_versions!inner(system_prompt, status)")
      .eq("slug", slug)
      .eq("ai_solution_versions.status", "active")
      .maybeSingle();

    if (error || !data) {
      cache.set(slug, { at: Date.now(), value: null });
      return fallback;
    }

    const row = data as {
      prompt_editable: boolean;
      ai_solution_versions: { system_prompt: string; status: string }[] | { system_prompt: string; status: string } | null;
    };

    if (!row.prompt_editable) {
      cache.set(slug, { at: Date.now(), value: null });
      return fallback;
    }

    const version = Array.isArray(row.ai_solution_versions)
      ? row.ai_solution_versions[0]
      : row.ai_solution_versions;

    const prompt = version?.system_prompt?.trim() ?? "";

    // An empty or stub prompt is treated as no prompt. Better the shipped
    // instructions than an assistant that has forgotten what it is.
    const value = prompt.length >= MIN_USEFUL_LENGTH ? prompt : null;
    cache.set(slug, { at: Date.now(), value });
    return value ?? fallback;
  } catch (err) {
    console.error("[ai:prompt]", err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** Called after a version is activated so the change takes effect at once. */
export function invalidatePromptCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}

/**
 * The deployment's addition to the master prompt.
 *
 * A per-client override is appended, never substituted: §22 is explicit
 * that a deployment is a delta. Copying the whole prompt per client is how
 * twelve deployments become twelve different products that nobody can
 * update at once.
 */
export function composePrompt(master: string, override: string | null, brandVoice: string | null): string {
  const parts = [master.trim()];
  if (brandVoice?.trim()) {
    parts.push(`\n\nBRAND VOICE FOR THIS DEPLOYMENT:\n${brandVoice.trim()}`);
  }
  if (override?.trim()) {
    parts.push(`\n\nADDITIONAL INSTRUCTIONS FOR THIS DEPLOYMENT:\n${override.trim()}`);
  }
  return parts.join("");
}
