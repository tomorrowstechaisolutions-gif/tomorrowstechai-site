import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSuppression } from "./suppression";
import { isEmail, normalizeEmail, type AudienceSource, type AudienceType, type SkipReason } from "./types";

/**
 * Turning an audience into a list of people.
 *
 * A DYNAMIC segment is resolved from the CRM right now, so it is never
 * stale. A STATIC or IMPORTED list reads its own rows. Either way the result
 * runs through the suppression check before anybody is called a recipient.
 *
 * ON FILTERS AND SQL: `filters` is jsonb a person typed into a form, and it
 * is NEVER turned into SQL by string concatenation. Every key this file
 * reads is on the allowlist below, every value goes through the Supabase
 * query builder as a bound parameter, and an unrecognised key is ignored
 * rather than passed through. That is the difference between a segment
 * builder and a SQL injection endpoint.
 *
 * ON DUPLICATION: nothing here copies a contact. A dynamic segment holds no
 * rows at all, and an imported list holds an address plus whatever the CSV
 * said — with lead_id filled in when we already know them, so the CRM stays
 * the source of truth for their consent.
 */

export type AudienceCandidate = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  leadId: string | null;
  customerId: string | null;
  audienceMemberId: string | null;
};

export type ResolvedAudience = {
  audienceId: string;
  name: string;
  audienceType: AudienceType;
  source: AudienceSource;
  /** Everyone the segment matched, before safety rules. */
  candidates: AudienceCandidate[];
  /** Everyone who may actually be emailed. */
  sendable: AudienceCandidate[];
  /** Everyone who may not, and why. */
  skipped: { candidate: AudienceCandidate; reason: SkipReason }[];
};

/** The only filter keys this module understands. Anything else is ignored. */
export type AudienceFilters = {
  lead_status?: string[];
  business_type?: string[];
  source?: string[];
  assigned_to?: string;
  state?: string;
  city?: string;
  created_after?: string;
  created_before?: string;
  last_contacted_before?: string;
  /** customers only */
  customer_status?: string[];
  tags?: string[];
  /** Restrict to leads that have an explicit consent record. */
  require_consent?: boolean;
};

const ALLOWED_KEYS = new Set<keyof AudienceFilters>([
  "lead_status", "business_type", "source", "assigned_to", "state", "city",
  "created_after", "created_before", "last_contacted_before",
  "customer_status", "tags", "require_consent",
]);

/** Drops anything not on the allowlist and coerces what is left. */
export function sanitizeFilters(raw: unknown): AudienceFilters {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: AudienceFilters = {};

  const strings = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const list = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return list.length > 0 ? list.slice(0, 50) : undefined;
  };
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key as keyof AudienceFilters)) continue;
    switch (key as keyof AudienceFilters) {
      case "lead_status": out.lead_status = strings(input[key]); break;
      case "business_type": out.business_type = strings(input[key]); break;
      case "source": out.source = strings(input[key]); break;
      case "customer_status": out.customer_status = strings(input[key]); break;
      case "tags": out.tags = strings(input[key]); break;
      case "assigned_to": out.assigned_to = str(input[key]); break;
      case "state": out.state = str(input[key]); break;
      case "city": out.city = str(input[key]); break;
      case "created_after": out.created_after = str(input[key]); break;
      case "created_before": out.created_before = str(input[key]); break;
      case "last_contacted_before": out.last_contacted_before = str(input[key]); break;
      case "require_consent": out.require_consent = input[key] === true; break;
    }
  }
  return out;
}

/** A one-line description of a segment, for the audience table. */
export function describeFilters(filters: AudienceFilters): string {
  const parts: string[] = [];
  if (filters.lead_status?.length) parts.push(`status ${filters.lead_status.join(" or ")}`);
  if (filters.business_type?.length) parts.push(`industry ${filters.business_type.join(" or ")}`);
  if (filters.source?.length) parts.push(`source ${filters.source.join(" or ")}`);
  if (filters.customer_status?.length) parts.push(`client status ${filters.customer_status.join(" or ")}`);
  if (filters.tags?.length) parts.push(`tagged ${filters.tags.join(" or ")}`);
  if (filters.assigned_to) parts.push(`assigned to ${filters.assigned_to}`);
  if (filters.state) parts.push(`in ${filters.state}`);
  if (filters.city) parts.push(`in ${filters.city}`);
  if (filters.created_after) parts.push(`created after ${filters.created_after}`);
  if (filters.created_before) parts.push(`created before ${filters.created_before}`);
  if (filters.last_contacted_before) parts.push(`not contacted since ${filters.last_contacted_before}`);
  if (filters.require_consent) parts.push("with recorded consent");
  return parts.length > 0 ? parts.join(", ") : "Everyone in the source";
}

const MAX_CANDIDATES = 20_000;

async function candidatesFromLeads(
  sb: SupabaseClient,
  filters: AudienceFilters
): Promise<AudienceCandidate[]> {
  let query = sb
    .from("leads")
    .select("id, email, first_name, last_name, business_name")
    .not("email", "is", null)
    .limit(MAX_CANDIDATES);

  if (filters.lead_status?.length) query = query.in("lead_status", filters.lead_status);
  if (filters.business_type?.length) query = query.in("business_type", filters.business_type);
  if (filters.source?.length) query = query.in("source", filters.source);
  if (filters.assigned_to) query = query.eq("assigned_to", filters.assigned_to);
  if (filters.created_after) query = query.gte("created_at", filters.created_after);
  if (filters.created_before) query = query.lte("created_at", filters.created_before);
  if (filters.last_contacted_before) query = query.lte("last_contacted_at", filters.last_contacted_before);
  // Belt and braces: the suppression pass would catch these anyway, but not
  // fetching them keeps a big segment smaller and the intent obvious.
  if (filters.require_consent) query = query.eq("email_consent", true);

  const { data, error } = await query;
  if (error) throw new Error(`resolve leads: ${error.message}`);

  return (data ?? []).map((row) => ({
    email: normalizeEmail(row.email as string),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    company: (row.business_name as string | null) ?? null,
    leadId: row.id as string,
    customerId: null,
    audienceMemberId: null,
  }));
}

async function candidatesFromCustomers(
  sb: SupabaseClient,
  filters: AudienceFilters
): Promise<AudienceCandidate[]> {
  let query = sb
    .from("customers")
    .select("id, email, name, business_name, status, state, city, tags")
    .not("email", "is", null)
    .limit(MAX_CANDIDATES);

  if (filters.customer_status?.length) query = query.in("status", filters.customer_status);
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.business_type?.length) query = query.in("business_type", filters.business_type);
  if (filters.tags?.length) query = query.overlaps("tags", filters.tags);
  if (filters.created_after) query = query.gte("created_at", filters.created_after);
  if (filters.created_before) query = query.lte("created_at", filters.created_before);

  const { data, error } = await query;
  if (error) throw new Error(`resolve customers: ${error.message}`);

  return (data ?? []).map((row) => {
    const name = ((row.name as string | null) ?? "").trim();
    const [first, ...rest] = name.split(/\s+/);
    return {
      email: normalizeEmail(row.email as string),
      firstName: first || null,
      lastName: rest.length > 0 ? rest.join(" ") : null,
      company: (row.business_name as string | null) ?? null,
      leadId: null,
      customerId: row.id as string,
      audienceMemberId: null,
    };
  });
}

async function candidatesFromMembers(
  sb: SupabaseClient,
  audienceId: string
): Promise<AudienceCandidate[]> {
  const { data, error } = await sb
    .from("email_audience_members")
    .select("id, email, first_name, last_name, company, lead_id, customer_id, subscribed")
    .eq("audience_id", audienceId)
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(`resolve list members: ${error.message}`);

  return (data ?? [])
    // A member marked unsubscribed on the list itself never becomes a
    // candidate. The suppression pass would also catch it; this is cheaper.
    .filter((row) => row.subscribed !== false)
    .map((row) => ({
      email: normalizeEmail(row.email as string),
      firstName: (row.first_name as string | null) ?? null,
      lastName: (row.last_name as string | null) ?? null,
      company: (row.company as string | null) ?? null,
      leadId: (row.lead_id as string | null) ?? null,
      customerId: (row.customer_id as string | null) ?? null,
      audienceMemberId: row.id as string,
    }));
}

/**
 * Resolve an audience into who may and may not be emailed.
 *
 * The two lists come back separately on purpose. `skipped` is not waste to
 * be discarded — it is written to email_campaign_recipients so the campaign
 * can answer, months later, "did we email this person, and if not why not".
 */
export async function resolveAudience(
  sb: SupabaseClient,
  audienceId: string
): Promise<ResolvedAudience> {
  const { data: audience, error } = await sb
    .from("email_audiences")
    .select("id, name, audience_type, source, filters")
    .eq("id", audienceId)
    .maybeSingle();
  if (error) throw new Error(`audience: ${error.message}`);
  if (!audience) throw new Error("That audience no longer exists.");

  const audienceType = audience.audience_type as AudienceType;
  const source = audience.source as AudienceSource;
  const filters = sanitizeFilters(audience.filters);

  const raw =
    audienceType === "static_list" || audienceType === "imported_list"
      ? await candidatesFromMembers(sb, audienceId)
      : source === "customers"
        ? await candidatesFromCustomers(sb, filters)
        : source === "members"
          ? await candidatesFromMembers(sb, audienceId)
          : await candidatesFromLeads(sb, filters);

  // ── De-duplicate before anything else ───────────────────────────
  // One person, one email, even when they are both a lead and a customer,
  // or appear twice in an imported CSV. Sending the same campaign twice to
  // one address is the most visible possible mistake.
  const seen = new Map<string, AudienceCandidate>();
  const duplicates: AudienceCandidate[] = [];
  const invalid: AudienceCandidate[] = [];

  for (const candidate of raw) {
    if (!candidate.email || !isEmail(candidate.email)) {
      invalid.push(candidate);
      continue;
    }
    const held = seen.get(candidate.email);
    if (held) {
      // Prefer the row that carries a CRM link, so the recipient row can be
      // attributed and the unsubscribe can write back to the right lead.
      if (!held.leadId && candidate.leadId) seen.set(candidate.email, candidate);
      duplicates.push(candidate);
      continue;
    }
    seen.set(candidate.email, candidate);
  }

  const unique = [...seen.values()];
  const { blocked } = await loadSuppression(sb, unique.map((c) => c.email));

  const sendable: AudienceCandidate[] = [];
  const skipped: { candidate: AudienceCandidate; reason: SkipReason }[] = [];

  for (const candidate of unique) {
    const reason = blocked.get(candidate.email);
    if (reason) skipped.push({ candidate, reason });
    else sendable.push(candidate);
  }
  for (const candidate of invalid) skipped.push({ candidate, reason: "invalid_email" });
  for (const candidate of duplicates) skipped.push({ candidate, reason: "duplicate" });

  return {
    audienceId,
    name: audience.name as string,
    audienceType,
    source,
    candidates: unique,
    sendable,
    skipped,
  };
}

/**
 * How big an audience is, without building the whole list.
 *
 * Used by the composer to show a size before anybody commits to a send, and
 * by the audience table. It still runs the suppression pass, because
 * "1,842 contacts" and "1,203 we may actually email" are different numbers
 * and showing the first one before a send sets a false expectation.
 */
export async function audienceSize(
  sb: SupabaseClient,
  audienceId: string
): Promise<{ total: number; sendable: number; suppressed: number }> {
  const resolved = await resolveAudience(sb, audienceId);
  return {
    total: resolved.candidates.length,
    sendable: resolved.sendable.length,
    suppressed: resolved.skipped.filter((s) => s.reason !== "duplicate").length,
  };
}
