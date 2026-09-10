import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DMARC_LABELS,
  DNS_LABELS,
  HEALTH_LABELS,
  PROVIDER_STATUS_LABELS,
  rate,
  type DmarcStatus,
  type DnsStatus,
  type HealthState,
  type ProviderStatus,
} from "./types";

/**
 * Sending health.
 *
 * The rule this file exists to enforce, from §35: DO NOT SHOW HEALTHY
 * WITHOUT REAL CHECKS. Every authentication column in the database defaults
 * to 'unknown' and nothing in this module ever writes 'verified' — only a
 * real provider check does, through checkSendingDomain() below, which needs
 * an API key and a network round trip.
 *
 * So the default state of a fresh install is Unknown across the board, and
 * the panel says "Not checked" rather than a row of green ticks. That reads
 * worse and is the entire point: a green DKIM badge nobody earned is how
 * mail silently starts landing in spam and nobody finds out for a month.
 *
 * Bounce and complaint rates ARE measured, from email_campaign_recipients,
 * because those are our own rows. They are null — not zero — until enough
 * mail has gone out to mean anything.
 */

/** Below this many delivered messages, a rate is noise rather than a signal. */
const MIN_VOLUME_FOR_RATE = 50;

/** Industry thresholds. Above these, a provider starts throttling. */
const BOUNCE_WARN = 0.02;
const BOUNCE_CRITICAL = 0.05;
const COMPLAINT_WARN = 0.001;
const COMPLAINT_CRITICAL = 0.003;

export type HealthReason = {
  severity: "critical" | "warning" | "info";
  label: string;
  detail: string;
};

export type SendingHealth = {
  state: HealthState;
  label: string;
  reasons: HealthReason[];

  provider: string;
  providerStatus: ProviderStatus;
  providerStatusLabel: string;
  /** Whether an API key is present in the environment at all. */
  providerConfigured: boolean;

  /** The recorded domain's id, so the screen can offer to re-check it. */
  domainId: string | null;
  domain: string | null;
  fromEmail: string | null;

  spf: DnsStatus;
  spfLabel: string;
  dkim: DnsStatus;
  dkimLabel: string;
  dmarc: DmarcStatus;
  dmarcLabel: string;
  /** True only when SPF and DKIM are both really verified. */
  authenticated: boolean;

  /** Null until enough mail has gone out to mean anything. */
  bounceRate: number | null;
  complaintRate: number | null;
  /** How many delivered messages the rates above are based on. */
  measuredOn: number;

  lastSendAt: string | null;
  lastCheckedAt: string | null;
  dailySendLimit: number | null;
  sentToday: number;

  /** True when nothing has ever been configured. */
  notConfigured: boolean;
};

type DomainRow = {
  id: string;
  domain: string;
  provider: string;
  from_email: string | null;
  from_name: string | null;
  spf_status: DnsStatus;
  dkim_status: DnsStatus;
  dmarc_status: DmarcStatus;
  provider_status: ProviderStatus;
  last_error: string | null;
  daily_send_limit: number | null;
  last_checked_at: string | null;
  last_send_at: string | null;
  is_default: boolean;
};

export async function loadSendingHealth(sb: SupabaseClient): Promise<SendingHealth> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [domainResult, recipientResult, todayResult] = await Promise.all([
    sb
      .from("email_sending_domains")
      .select(
        "id, domain, provider, from_email, from_name, spf_status, dkim_status, dmarc_status, provider_status, last_error, daily_send_limit, last_checked_at, last_send_at, is_default"
      )
      .order("is_default", { ascending: false })
      .limit(1),
    // Only marketing sends. Transactional mail never lands in these tables,
    // so these rates cannot be polluted by receipts and password resets.
    sb
      .from("email_campaign_recipients")
      .select("status")
      .gte("sent_at", monthAgo)
      .in("status", ["sent", "delivered", "bounced", "complained"]),
    sb
      .from("email_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", dayAgo),
  ]);

  if (domainResult.error) throw new Error(`sending domain: ${domainResult.error.message}`);
  if (recipientResult.error) throw new Error(`send volume: ${recipientResult.error.message}`);

  const domain = (domainResult.data?.[0] ?? null) as DomainRow | null;
  const rows = (recipientResult.data ?? []) as { status: string }[];

  const attempted = rows.length;
  const bounced = rows.filter((r) => r.status === "bounced").length;
  const complained = rows.filter((r) => r.status === "complained").length;

  const bounceRate = attempted >= MIN_VOLUME_FOR_RATE ? rate(bounced, attempted) : null;
  const complaintRate = attempted >= MIN_VOLUME_FOR_RATE ? rate(complained, attempted) : null;

  const providerConfigured = Boolean(process.env.RESEND_API_KEY);
  const spf = domain?.spf_status ?? "unknown";
  const dkim = domain?.dkim_status ?? "unknown";
  const dmarc = domain?.dmarc_status ?? "unknown";
  const authenticated = spf === "verified" && dkim === "verified";

  const providerStatus: ProviderStatus = domain
    ? domain.provider_status
    : providerConfigured
      ? "unknown"
      : "not_connected";

  const reasons: HealthReason[] = [];
  const add = (severity: HealthReason["severity"], label: string, detail: string) =>
    reasons.push({ severity, label, detail });

  // ── Critical ────────────────────────────────────────────────────
  if (!providerConfigured) {
    add(
      "critical",
      "No email provider configured",
      "RESEND_API_KEY is not set, so nothing can be sent. Add it to the environment and redeploy."
    );
  }
  if (domain?.provider_status === "error") {
    add("critical", "The provider reported an error", domain.last_error ?? "No detail was returned.");
  }
  if (bounceRate !== null && bounceRate >= BOUNCE_CRITICAL) {
    add(
      "critical",
      "Bounce rate is very high",
      `${(bounceRate * 100).toFixed(1)}% of the last ${attempted} sends bounced. Providers throttle above 5%. Stop sending and clean the list.`
    );
  }
  if (complaintRate !== null && complaintRate >= COMPLAINT_CRITICAL) {
    add(
      "critical",
      "Spam complaint rate is very high",
      `${(complaintRate * 100).toFixed(2)}% of recent sends were reported as spam. Above 0.3% a sending domain gets blocked.`
    );
  }

  // ── Warning ─────────────────────────────────────────────────────
  if (!domain) {
    add(
      "warning",
      "No sending domain recorded",
      "Add the domain you send from so its SPF, DKIM and DMARC can be checked."
    );
  } else {
    if (spf !== "verified") {
      add(
        spf === "failed" ? "critical" : "warning",
        `SPF is ${DNS_LABELS[spf].toLowerCase()}`,
        spf === "unknown"
          ? "Nothing has checked SPF for this domain, so its state is unknown rather than fine."
          : "Receiving servers cannot confirm this domain authorised the send."
      );
    }
    if (dkim !== "verified") {
      add(
        dkim === "failed" ? "critical" : "warning",
        `DKIM is ${DNS_LABELS[dkim].toLowerCase()}`,
        dkim === "unknown"
          ? "Nothing has checked DKIM for this domain, so its state is unknown rather than fine."
          : "Messages cannot be cryptographically tied to this domain."
      );
    }
    if (dmarc === "missing") {
      add(
        "warning",
        "DMARC is not configured",
        "Without a DMARC record, mailbox providers have no policy to apply and give the domain less benefit of the doubt."
      );
    }
    if (!domain.from_email) {
      add("warning", "No From address on the sending domain", "Each campaign has to supply its own until one is set.");
    }
  }

  if (bounceRate !== null && bounceRate >= BOUNCE_WARN && bounceRate < BOUNCE_CRITICAL) {
    add(
      "warning",
      "Bounce rate is above normal",
      `${(bounceRate * 100).toFixed(1)}% over the last 30 days. Anything above 2% is worth investigating.`
    );
  }
  if (complaintRate !== null && complaintRate >= COMPLAINT_WARN && complaintRate < COMPLAINT_CRITICAL) {
    add(
      "warning",
      "Spam complaints are above normal",
      `${(complaintRate * 100).toFixed(2)}% over the last 30 days. Above 0.1% is a signal worth acting on.`
    );
  }

  const sentToday = todayResult.count ?? 0;
  if (domain?.daily_send_limit && sentToday >= domain.daily_send_limit * 0.8) {
    add(
      sentToday >= domain.daily_send_limit ? "critical" : "warning",
      "Near the daily sending limit",
      `${sentToday.toLocaleString("en-US")} of ${domain.daily_send_limit.toLocaleString("en-US")} sent in the last 24 hours.`
    );
  }

  // ── Info ────────────────────────────────────────────────────────
  if (attempted > 0 && attempted < MIN_VOLUME_FOR_RATE) {
    add(
      "info",
      "Not enough volume for a rate yet",
      `Only ${attempted} marketing ${attempted === 1 ? "message has" : "messages have"} been sent in the last 30 days, so bounce and complaint rates are not shown — a single bounce out of ten is not a 10% bounce rate in any useful sense.`
    );
  }

  // ── The verdict ─────────────────────────────────────────────────
  const critical = reasons.filter((r) => r.severity === "critical").length;
  const warning = reasons.filter((r) => r.severity === "warning").length;

  // Nothing configured at all is its own state. It is not "critical" —
  // nothing is broken, nothing has been set up — and calling it critical
  // would train people to ignore the badge.
  const notConfigured = !domain && !providerConfigured;

  const state: HealthState = notConfigured
    ? "unknown"
    : critical > 0
      ? "critical"
      : warning > 0
        ? "warning"
        // Verified SPF and DKIM plus a live provider is the ONLY route to
        // green. Missing data never gets here.
        : authenticated && providerStatus === "connected"
          ? "healthy"
          : "unknown";

  if (state === "unknown" && reasons.length === 0) {
    add(
      "info",
      "Sending health has not been checked",
      "Run a domain check to confirm SPF, DKIM and DMARC. Until something looks, this reads Unknown rather than Healthy."
    );
  }

  return {
    state,
    label: HEALTH_LABELS[state],
    reasons,
    provider: domain?.provider ?? "resend",
    domainId: domain?.id ?? null,
    providerStatus,
    providerStatusLabel: PROVIDER_STATUS_LABELS[providerStatus],
    providerConfigured,
    domain: domain?.domain ?? null,
    fromEmail: domain?.from_email ?? process.env.CONTACT_FROM_EMAIL ?? null,
    spf,
    spfLabel: DNS_LABELS[spf],
    dkim,
    dkimLabel: DNS_LABELS[dkim],
    dmarc,
    dmarcLabel: DMARC_LABELS[dmarc],
    authenticated,
    bounceRate,
    complaintRate,
    measuredOn: attempted,
    lastSendAt: domain?.last_send_at ?? null,
    lastCheckedAt: domain?.last_checked_at ?? null,
    dailySendLimit: domain?.daily_send_limit ?? null,
    sentToday,
    notConfigured,
  };
}

/**
 * Ask Resend what it actually knows about a domain, and write that down.
 *
 * This is the ONLY function in the module that may write 'verified'. It
 * needs a real API key and a real network call, and when either is missing
 * it writes 'unknown' — never an optimistic guess.
 *
 * Resend's domain object reports per-record status for SPF and DKIM. DMARC
 * is not something Resend verifies, so it stays whatever a human recorded,
 * rather than being invented here.
 */
export async function checkSendingDomain(
  sb: SupabaseClient,
  domainId: string
): Promise<{ ok: boolean; message: string }> {
  const key = process.env.RESEND_API_KEY;

  const { data: row, error } = await sb
    .from("email_sending_domains")
    .select("id, domain, provider_domain_id")
    .eq("id", domainId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, message: "That sending domain no longer exists." };

  if (!key) {
    await sb
      .from("email_sending_domains")
      .update({
        provider_status: "not_connected",
        spf_status: "unknown",
        dkim_status: "unknown",
        last_checked_at: new Date().toISOString(),
        last_error: "RESEND_API_KEY is not set, so nothing could be checked.",
      })
      .eq("id", domainId);
    return { ok: false, message: "No provider API key is configured, so nothing could be checked." };
  }

  try {
    const endpoint = row.provider_domain_id
      ? `https://api.resend.com/domains/${encodeURIComponent(row.provider_domain_id)}`
      : "https://api.resend.com/domains";
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });

    if (!response.ok) {
      await sb
        .from("email_sending_domains")
        .update({
          provider_status: "error",
          last_checked_at: new Date().toISOString(),
          last_error: `Resend returned ${response.status}.`,
        })
        .eq("id", domainId);
      return { ok: false, message: `The provider returned ${response.status}.` };
    }

    const payload = (await response.json()) as {
      id?: string;
      name?: string;
      status?: string;
      records?: { record?: string; type?: string; status?: string; name?: string }[];
      data?: { id: string; name: string; status: string }[];
    };

    const match = payload.data
      ? payload.data.find((d) => d.name?.toLowerCase() === row.domain.toLowerCase())
      : payload;

    if (!match) {
      await sb
        .from("email_sending_domains")
        .update({
          provider_status: "not_connected",
          spf_status: "unknown",
          dkim_status: "unknown",
          last_checked_at: new Date().toISOString(),
          last_error: "This domain is not registered with the provider.",
        })
        .eq("id", domainId);
      return { ok: false, message: "That domain is not registered with Resend yet." };
    }

    const records = ("records" in match && match.records) || [];
    const statusOf = (kind: "spf" | "dkim"): DnsStatus => {
      const record = records.find((r) =>
        kind === "spf"
          ? r.record?.toUpperCase() === "SPF" || r.type?.toUpperCase() === "MX"
          : r.record?.toUpperCase() === "DKIM"
      );
      if (!record?.status) {
        // No per-record detail — fall back to the domain's own status, and
        // only "verified" counts. Anything else stays honest.
        return match.status === "verified" ? "verified" : match.status === "pending" ? "pending" : "unknown";
      }
      const value = record.status.toLowerCase();
      if (value === "verified") return "verified";
      if (value === "pending" || value === "not_started") return "pending";
      if (value === "failure" || value === "failed") return "failed";
      return "unknown";
    };

    await sb
      .from("email_sending_domains")
      .update({
        provider_domain_id: match.id ?? row.provider_domain_id,
        provider_status: "connected",
        spf_status: statusOf("spf"),
        dkim_status: statusOf("dkim"),
        last_checked_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", domainId);

    return { ok: true, message: `Checked ${row.domain}. The provider reports it as ${match.status ?? "unknown"}.` };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The domain check failed.";
    await sb
      .from("email_sending_domains")
      .update({
        provider_status: "error",
        last_checked_at: new Date().toISOString(),
        last_error: message,
      })
      .eq("id", domainId);
    return { ok: false, message };
  }
}
