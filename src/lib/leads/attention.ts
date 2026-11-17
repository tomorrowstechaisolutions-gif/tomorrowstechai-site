/**
 * "Which leads need me" — one definition, used by the sidebar badge, the
 * Alerts bell and the AI insights card. Before this file each of those had
 * its own rule (24h, 48h, follow-ups added on top of first contact), so the
 * same admin showed 1, 4 and 5 for the same question.
 *
 * A lead needs attention when it is open, real (not Spam/Test), not
 * do-not-contact, and either:
 *   - nobody has contacted it and it arrived more than FIRST_CONTACT_HOURS ago, or
 *   - its scheduled follow-up date has passed.
 * A lead that is both is counted once in `total`.
 *
 * Callers are responsible for the open/real/do-not-contact filter in the
 * query (CLOSED_STATUSES already includes Spam and Test).
 */

export const FIRST_CONTACT_HOURS = 24;

export type AttentionLead = {
  id: string;
  created_at: string;
  last_contacted_at: string | null;
  next_followup_at: string | null;
};

export type Attention = {
  /** Never contacted, older than FIRST_CONTACT_HOURS. */
  uncontacted: string[];
  /** Follow-up date in the past. */
  followupsDue: string[];
  /** Distinct leads in either list. This is the number to show. */
  total: number;
};

export function leadAttention(leads: AttentionLead[], now = Date.now()): Attention {
  const cutoff = now - FIRST_CONTACT_HOURS * 3_600_000;
  const uncontacted = leads
    .filter((l) => !l.last_contacted_at && new Date(l.created_at).getTime() < cutoff)
    .map((l) => l.id);
  const followupsDue = leads
    .filter((l) => l.next_followup_at && new Date(l.next_followup_at).getTime() < now)
    .map((l) => l.id);
  return {
    uncontacted,
    followupsDue,
    total: new Set([...uncontacted, ...followupsDue]).size,
  };
}
