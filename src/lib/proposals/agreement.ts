import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgreementVersion } from "./types";

/**
 * The agreement, read from the database rather than a component.
 *
 * A proposal pins the version row it was written against, so editing the
 * wording in Admin Settings can never change what somebody already signed —
 * the old row stays exactly where it is and the signature still points at it.
 */

export async function loadAgreement(
  db: SupabaseClient,
  id: string
): Promise<AgreementVersion | null> {
  const { data } = await db
    .from("agreement_versions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AgreementVersion) ?? null;
}

/**
 * The version a NEW proposal should carry: the most recently published one.
 * Returns null if nothing is published, which the builder surfaces rather
 * than silently writing a proposal with no terms attached.
 */
export async function currentAgreement(
  db: SupabaseClient
): Promise<AgreementVersion | null> {
  const { data } = await db
    .from("agreement_versions")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgreementVersion) ?? null;
}

export async function listAgreements(
  db: SupabaseClient
): Promise<AgreementVersion[]> {
  const { data } = await db
    .from("agreement_versions")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as AgreementVersion[];
}

/**
 * How many proposals already point at a version. Admin Settings uses it to
 * refuse to delete wording that somebody has signed under.
 */
export async function agreementUsage(
  db: SupabaseClient,
  id: string
): Promise<{ proposals: number; signatures: number }> {
  const [proposals, signatures] = await Promise.all([
    db.from("proposals").select("id", { count: "exact", head: true })
      .eq("agreement_version_id", id).then((r) => r.count ?? 0),
    db.from("proposal_signatures").select("id", { count: "exact", head: true })
      .eq("agreement_version_id", id).then((r) => r.count ?? 0),
  ]);
  return { proposals, signatures };
}

/** The agreement as flat text, for the signed snapshot and for hashing. */
export function agreementToText(agreement: AgreementVersion): string {
  const lines: string[] = [agreement.title, ""];
  if (agreement.intro) lines.push(agreement.intro, "");

  for (const section of agreement.sections) {
    lines.push(`${section.n}. ${section.heading}`);
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph);
    for (const bullet of section.bullets ?? []) lines.push(`• ${bullet}`);
    lines.push("");
  }

  if (agreement.ownership_rows.length > 0) {
    lines.push("EXHIBIT B — OWNERSHIP AT A GLANCE");
    for (const row of agreement.ownership_rows) {
      lines.push(`${row.asset} — ${row.owner} — ${row.treatment}`);
    }
  }

  return lines.join("\n");
}
