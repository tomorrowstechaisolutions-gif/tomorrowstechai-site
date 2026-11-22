/**
 * Two small decisions about social publishing, kept free of the database so
 * they can be tested: what a post's overall status is once its destinations
 * have reported, and whether a destination that keeps failing should be left
 * out of the next automatic post.
 */

export type DestinationState = {
  platform: string;
  platform_status: string;
  external_url?: string | null;
  error_message?: string | null;
};

export type PostRollup =
  | { status: "published"; published_at: string; external_url: string | null; error: string | null; last_publish_attempt_at: string }
  | { status: "scheduled" | "publishing"; last_publish_attempt_at: string }
  | { status: "failed"; error: string; last_publish_attempt_at: string };

/**
 * A post's status from its destinations.
 *
 * A post that reached LinkedIn, Facebook and Instagram and was refused by X
 * is a published post with one problem, not a failed post. It used to be
 * marked failed, which sent three live posts to the "needs attention" pile
 * and hid them from "published this month". Now: anything still waiting keeps
 * the post open; otherwise it is published if at least one destination took
 * it, with the failures named in `error` so they are still visible; and it is
 * failed only when nothing went out at all.
 */
export function rollUpPost(states: readonly DestinationState[], stamp: string): PostRollup {
  const waiting = states.some((s) => s.platform_status === "scheduled");
  const inFlight = states.some((s) => s.platform_status === "publishing");
  if (waiting || inFlight) {
    // A destination still "scheduled" (cut off by the batch limit, say) keeps
    // the post "scheduled" so the next run picks it up.
    return { status: waiting ? "scheduled" : "publishing", last_publish_attempt_at: stamp };
  }

  const published = states.filter((s) => s.platform_status === "published");
  const failures = states.filter((s) => s.platform_status === "failed");
  const failureText = failures.map((s) => `${s.platform}: ${s.error_message ?? "failed"}`).join(" · ");

  if (published.length > 0) {
    return {
      status: "published",
      published_at: stamp,
      external_url: states.find((s) => s.external_url)?.external_url ?? null,
      error: failures.length > 0
        ? `Published to ${published.length} of ${states.length}. Not sent: ${failureText}`.slice(0, 1000)
        : null,
      last_publish_attempt_at: stamp,
    };
  }

  return {
    status: "failed",
    error: failureText.slice(0, 1000) || "One or more platforms failed to publish",
    last_publish_attempt_at: stamp,
  };
}

export type AttemptLike = { status: string; created_at: string };

/** How many failures in a row pause a destination, and over how long. */
export const PAUSE_AFTER_FAILURES = 3;
export const PAUSE_WINDOW_DAYS = 7;

/**
 * Should automatic posting skip this account for now?
 *
 * Yes when its last three finished attempts inside the past week all failed.
 * That is the X account whose API credits ran out: every article was still
 * aimed at it, failed, and turned the post red. Skipping stops the noise.
 *
 * It lifts by itself. With nothing new attempted, the failures age out of the
 * window and the next article tries the account again; one success at any
 * point clears it immediately. A manual post is never skipped.
 */
export function shouldPauseDestination(attempts: readonly AttemptLike[], now: number = Date.now()): boolean {
  const since = now - PAUSE_WINDOW_DAYS * 86_400_000;
  const recent = attempts
    .filter((a) => a.status === "succeeded" || a.status === "failed")
    .filter((a) => new Date(a.created_at).getTime() >= since)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, PAUSE_AFTER_FAILURES);
  return recent.length === PAUSE_AFTER_FAILURES && recent.every((a) => a.status === "failed");
}

/**
 * Whether the publisher may look for "the one connected account" on a
 * platform. Only for a destination saved with no account at all. When a
 * destination names an account and that account has gone offline, the post
 * fails instead: with several brands' pages connected, the one still working
 * may belong to a different brand.
 */
export function mayUseFallbackAccount(savedAccountId: string | null | undefined): boolean {
  return !savedAccountId;
}
