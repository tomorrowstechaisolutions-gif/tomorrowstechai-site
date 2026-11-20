/** The small decisions behind talking to Tess, kept apart from the browser so they can be tested. */

/**
 * Whether holding the space bar should talk to Tess. Only a place John is
 * typing keeps the space for itself; a button he clicked a moment ago does not.
 */
export function spaceBarTalks(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target?.tagName) return true;
  if (target.isContentEditable) return false;
  return target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.tagName !== "SELECT";
}

/** What to tell John when listening ended and no words came through. */
export function nothingHeardNotice(heard: string, hadError: boolean): string | null {
  if (heard.trim() || hadError) return null;
  return "I did not catch anything. Try again, and if it keeps happening check which microphone the browser is using.";
}
