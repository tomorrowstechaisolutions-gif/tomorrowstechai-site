import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, type SkipReason, type SuppressionReason } from "./types";

/**
 * The one place that answers "may we email this address?".
 *
 * Every send path in this module goes through here. There is no second
 * opinion and no shortcut, because the failure mode is not a bug report —
 * it is a spam complaint, a burned sending domain, and in some
 * jurisdictions a fine.
 *
 * THE CHECK IS ON THE ADDRESS, not on a lead id. The same person is
 * routinely a lead AND a customer AND a row in an imported list. Suppressing
 * "lead 47" would leave the other two rows through, which is precisely how
 * somebody who unsubscribed keeps receiving mail.
 *
 * Three independent sources say no, and any one of them is enough:
 *   1. email_suppressions — the global list (unsubscribed, hard bounced,
 *      complained, or added by hand).
 *   2. leads.unsubscribed_at / do_not_contact — the CRM's own record, which
 *      predates this module and is still authoritative.
 *   3. leads.email_consent = false — they never opted in, or withdrew it.
 */

export type SuppressionCheck = {
  /** Lowercased addresses that must not be emailed. */
  blocked: Map<string, SkipReason>;
};

const CHUNK = 500;

/**
 * Builds the block list for a specific set of addresses.
 *
 * Scoped to the addresses being sent to rather than loading the whole
 * suppression table, because that table only grows and a campaign to 40
 * people should not read 40,000 rows. Chunked because PostgREST has a URL
 * length limit and a 5,000-address `in` clause exceeds it.
 */
export async function loadSuppression(
  sb: SupabaseClient,
  emails: string[]
): Promise<SuppressionCheck> {
  const blocked = new Map<string, SkipReason>();
  const wanted = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (wanted.length === 0) return { blocked };

  for (let i = 0; i < wanted.length; i += CHUNK) {
    const slice = wanted.slice(i, i + CHUNK);

    const [suppressions, leadRows] = await Promise.all([
      sb.from("email_suppressions").select("email, reason").in("email", slice),
      sb
        .from("leads")
        .select("email, email_consent, unsubscribed_at, do_not_contact")
        .in("email", slice),
    ]);

    if (suppressions.error) throw new Error(`suppression list: ${suppressions.error.message}`);
    if (leadRows.error) throw new Error(`lead consent: ${leadRows.error.message}`);

    for (const row of (suppressions.data ?? []) as { email: string; reason: SuppressionReason }[]) {
      blocked.set(normalizeEmail(row.email), suppressionToSkip(row.reason));
    }

    for (const row of (leadRows.data ?? []) as {
      email: string | null;
      email_consent: boolean | null;
      unsubscribed_at: string | null;
      do_not_contact: boolean | null;
    }[]) {
      if (!row.email) continue;
      const key = normalizeEmail(row.email);
      // The global list wins if it already has an opinion — it is more
      // specific about WHY, and the reason is what the screen shows.
      if (blocked.has(key)) continue;

      if (row.do_not_contact) blocked.set(key, "do_not_contact");
      else if (row.unsubscribed_at) blocked.set(key, "unsubscribed");
      else if (row.email_consent === false) blocked.set(key, "no_consent");
    }
  }

  return { blocked };
}

function suppressionToSkip(reason: SuppressionReason): SkipReason {
  switch (reason) {
    case "unsubscribed": return "unsubscribed";
    case "hard_bounce": return "hard_bounce";
    case "complaint": return "complaint";
    case "do_not_contact": return "do_not_contact";
    case "invalid": return "invalid_email";
    default: return "suppressed";
  }
}

/**
 * Adds an address to the global list.
 *
 * `on conflict do nothing` by design: one decision per address. An address
 * already suppressed because they unsubscribed does not need a second row
 * when it later hard-bounces, and re-inserting would move the date and lose
 * the original reason.
 *
 * The database trigger does the rest — exits their live sequences and marks
 * them unsubscribed on any static list — so a caller cannot forget to.
 */
export async function suppress(
  sb: SupabaseClient,
  input: {
    email: string;
    reason: SuppressionReason;
    campaignId?: string | null;
    sequenceId?: string | null;
    leadId?: string | null;
    customerId?: string | null;
    note?: string | null;
  }
): Promise<void> {
  const email = normalizeEmail(input.email);
  if (!email) return;

  const { error } = await sb.from("email_suppressions").insert({
    email,
    reason: input.reason,
    source_campaign_id: input.campaignId ?? null,
    source_sequence_id: input.sequenceId ?? null,
    lead_id: input.leadId ?? null,
    customer_id: input.customerId ?? null,
    note: input.note ?? null,
  });

  // 23505 is the unique index doing its job, which is not an error here.
  if (error && error.code !== "23505") {
    throw new Error(`suppress ${email}: ${error.message}`);
  }
}

/**
 * Removes an address from the global list.
 *
 * §26: resubscription must be EXPLICIT, so this exists but nothing calls it
 * automatically — no import, no CRM sync and no form submission may reach
 * it. It is a deliberate act by a person who has a reason, and it records
 * who did it in the campaign event log at the call site.
 */
export async function unsuppress(sb: SupabaseClient, email: string): Promise<void> {
  const { error } = await sb
    .from("email_suppressions")
    .delete()
    .eq("email", normalizeEmail(email));
  if (error) throw new Error(`unsuppress: ${error.message}`);
}

/** How many addresses are suppressed, by reason. For the health panel. */
export async function suppressionSummary(
  sb: SupabaseClient
): Promise<{ total: number; byReason: Record<string, number> }> {
  const { data, error } = await sb.from("email_suppressions").select("reason");
  if (error) throw new Error(`suppression summary: ${error.message}`);

  const byReason: Record<string, number> = {};
  for (const row of (data ?? []) as { reason: string }[]) {
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
  }
  return { total: (data ?? []).length, byReason };
}
