import "server-only";

/**
 * Every dashboard panel loads its own data and is allowed to fail on its own.
 *
 * One broken query used to be able to blank the whole overview page. Panels
 * return a result instead of throwing, so a Supabase hiccup on the social
 * table costs you the social card and nothing else.
 */
export type PanelResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function panel<T>(
  name: string,
  load: () => Promise<T>
): Promise<PanelResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    // The real error goes to the server log; the browser gets a sentence.
    console.error(`[dashboard:${name}]`, err);
    return {
      ok: false,
      error: "Couldn't load this right now.",
    };
  }
}

/** Throws if a Supabase call came back with an error, so `panel` can catch it. */
export function unwrap<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string
): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** Same, for head/count-only queries. */
export function unwrapCount(
  res: { count: number | null; error: { message: string } | null },
  what: string
): number {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.count ?? 0;
}
