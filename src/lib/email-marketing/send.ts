import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAudience } from "./audience";
import { canSend, personalize, preSendChecks, renderCampaignHtml, renderCampaignText } from "./render";
import { campaignUnsubscribeUrl, listUnsubscribeHeaders, sequenceUnsubscribeUrl } from "./unsubscribe";
import { delayMs, normalizeEmail, type DelayUnit, type EmailBlock, type EmailTone } from "./types";

/**
 * Actually sending the mail.
 *
 * Modelled on lib/social/publisher.ts, and for the same reason: an explicit
 * provider adapter that REFUSES when it is not configured, rather than a
 * code path that quietly reports success. Nothing in this file writes a
 * "sent" row it did not get a provider message id for.
 *
 * THE ORDER OF OPERATIONS IS THE SAFETY MODEL:
 *
 *   1. Resolve the audience and check suppression — before a single email
 *      is composed, let alone sent.
 *   2. Freeze the result into email_campaign_recipients, INCLUDING the
 *      people who were skipped and why. A campaign must be able to answer
 *      "did you email this person" months later.
 *   3. Send in batches to the frozen list, marking each row as it goes.
 *   4. Write an event per send, which the database trigger turns into
 *      recipient state.
 *
 * A retry re-enters at step 3 against the same frozen list, so a partial
 * failure never mails a different set of people and never mails anyone
 * twice — the unique index on (campaign_id, lower(email)) plus the pending
 * filter guarantee it.
 */

const BATCH = 40;
/** Resend's own rate limit is generous; this keeps us politely under it. */
const PAUSE_MS = 120;

export type SendSummary = {
  campaignId: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  message: string;
};

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  preview_text: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  blocks: EmailBlock[];
  tone: EmailTone;
  audience_id: string | null;
  approval_mode: string;
  approval_status: string;
  customer_id: string | null;
  owner: string | null;
  sending_domain_id: string | null;
};

const CAMPAIGN_FIELDS =
  "id, name, status, subject, preview_text, from_name, from_email, reply_to, blocks, tone, audience_id, approval_mode, approval_status, customer_id, owner, sending_domain_id";

async function loadCampaign(sb: SupabaseClient, id: string): Promise<CampaignRow> {
  const { data, error } = await sb.from("email_campaigns").select(CAMPAIGN_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(`campaign: ${error.message}`);
  if (!data) throw new Error("That campaign no longer exists.");
  return data as CampaignRow;
}

/** The From header, falling back to the sending domain and then the env. */
async function resolveSender(
  sb: SupabaseClient,
  campaign: CampaignRow
): Promise<{ from: string; fromEmail: string | null; fromName: string | null; replyTo: string | null }> {
  let fromEmail = campaign.from_email;
  let fromName = campaign.from_name;
  let replyTo = campaign.reply_to;

  if ((!fromEmail || !fromName) && campaign.sending_domain_id) {
    const { data } = await sb
      .from("email_sending_domains")
      .select("from_email, from_name, reply_to")
      .eq("id", campaign.sending_domain_id)
      .maybeSingle();
    fromEmail = fromEmail ?? data?.from_email ?? null;
    fromName = fromName ?? data?.from_name ?? null;
    replyTo = replyTo ?? data?.reply_to ?? null;
  }

  // The env value is already in "Name <address>" form for the transactional
  // path, so it is used whole rather than reassembled.
  const envFrom = process.env.CONTACT_FROM_EMAIL ?? null;
  const from = fromEmail
    ? fromName
      ? `${fromName} <${fromEmail}>`
      : fromEmail
    : envFrom ?? "";

  return { from, fromEmail: fromEmail ?? envFrom, fromName, replyTo };
}

async function logEvent(
  sb: SupabaseClient,
  campaignId: string,
  kind: string,
  body: string,
  actor: string | null = null
) {
  await sb.from("email_campaign_events").insert({ campaign_id: campaignId, kind, body, actor });
}

/* ── Step 1 + 2: freeze the send list ──────────────────────────────── */

/**
 * Resolve the audience and write the recipient rows.
 *
 * Idempotent: an upsert on (campaign_id, lower(email)) means running it
 * twice does not duplicate anybody, so a retry after a timeout is safe.
 */
export async function buildRecipientList(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ sendable: number; skipped: number; total: number }> {
  const campaign = await loadCampaign(sb, campaignId);
  if (!campaign.audience_id) throw new Error("This campaign has no audience selected.");

  const resolved = await resolveAudience(sb, campaign.audience_id);

  const rows = [
    ...resolved.sendable.map((c) => ({
      campaign_id: campaignId,
      email: c.email,
      first_name: c.firstName,
      last_name: c.lastName,
      company: c.company,
      lead_id: c.leadId,
      customer_id: c.customerId,
      audience_member_id: c.audienceMemberId,
      status: "pending" as const,
      skip_reason: null,
    })),
    // The skipped rows are written too. This is the audit trail that proves
    // the suppression rules ran, and it is why a screen can say "1,842 in
    // the audience, 1,203 emailed, 639 suppressed" rather than losing 639
    // people silently.
    ...resolved.skipped
      .filter((s) => s.reason !== "duplicate")
      .map((s) => ({
        campaign_id: campaignId,
        email: s.candidate.email,
        first_name: s.candidate.firstName,
        last_name: s.candidate.lastName,
        company: s.candidate.company,
        lead_id: s.candidate.leadId,
        customer_id: s.candidate.customerId,
        audience_member_id: s.candidate.audienceMemberId,
        status: "skipped" as const,
        skip_reason: s.reason,
      })),
  ];

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb
      .from("email_campaign_recipients")
      .upsert(rows.slice(i, i + 200), { onConflict: "campaign_id,email", ignoreDuplicates: true });
    if (error) throw new Error(`build recipient list: ${error.message}`);
  }

  return {
    sendable: resolved.sendable.length,
    skipped: resolved.skipped.filter((s) => s.reason !== "duplicate").length,
    total: resolved.candidates.length,
  };
}

/* ── Step 3 + 4: send ──────────────────────────────────────────────── */

/**
 * Send the pending portion of a campaign's frozen list.
 *
 * Returns after `limit` recipients so a cron invocation cannot run past its
 * timeout. `remaining` tells the caller to come back, and because the list
 * is frozen and each row moves out of 'pending' as it is sent, coming back
 * resumes exactly where it stopped.
 */
export async function sendCampaign(
  sb: SupabaseClient,
  campaignId: string,
  options: { limit?: number; actor?: string | null } = {}
): Promise<SendSummary> {
  const limit = options.limit ?? 500;
  const campaign = await loadCampaign(sb, campaignId);
  const resend = client();

  const summary: SendSummary = {
    campaignId,
    attempted: 0, sent: 0, failed: 0, skipped: 0, remaining: 0,
    message: "",
  };

  if (!resend) {
    await sb
      .from("email_campaigns")
      .update({ status: "failed", failure_reason: "No email provider is configured (RESEND_API_KEY is not set)." })
      .eq("id", campaignId);
    await logEvent(sb, campaignId, "failed", "Send refused: no email provider is configured.", options.actor ?? null);
    summary.message = "No email provider is configured, so nothing was sent.";
    return summary;
  }

  // The approval gate also lives in the database, but refusing here gives a
  // sentence instead of a constraint error, and stops a partially-sent
  // campaign in the case where somebody withdrew approval mid-send.
  if (campaign.approval_mode !== "none" && campaign.approval_status !== "approved") {
    summary.message = `This campaign needs ${campaign.approval_mode} approval before it can be sent.`;
    return summary;
  }

  const sender = await resolveSender(sb, campaign);

  const { data: pending, error } = await sb
    .from("email_campaign_recipients")
    .select("id, email, first_name, last_name, company, lead_id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(limit);
  if (error) throw new Error(`pending recipients: ${error.message}`);

  const queue = (pending ?? []) as {
    id: string; email: string; first_name: string | null;
    last_name: string | null; company: string | null; lead_id: string | null;
  }[];

  if (queue.length === 0) {
    summary.message = "There is nobody left to send to.";
    return summary;
  }

  await sb
    .from("email_campaigns")
    .update({ status: "sending", started_sending_at: new Date().toISOString() })
    .eq("id", campaignId)
    .in("status", ["scheduled", "approved", "draft", "sending"]);

  const clientName = await clientNameFor(sb, campaign.customer_id);

  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);

    for (const row of batch) {
      summary.attempted += 1;
      const unsubscribeUrl = campaignUnsubscribeUrl(row.id);
      const recipient = {
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        company: row.company,
      };
      const context = { clientName, salesRep: campaign.owner, serviceName: null };

      try {
        await sb
          .from("email_campaign_recipients")
          .update({ status: "sending" })
          .eq("id", row.id)
          .eq("status", "pending");

        const html = renderCampaignHtml({
          blocks: campaign.blocks ?? [],
          previewText: campaign.preview_text ?? "",
          tone: campaign.tone,
          recipient,
          context,
          unsubscribeUrl,
          allowCustomHtml: true,
        });
        const text = renderCampaignText({
          blocks: campaign.blocks ?? [],
          previewText: campaign.preview_text ?? "",
          recipient,
          context,
          unsubscribeUrl,
        });

        const response = await resend.emails.send({
          from: sender.from,
          to: row.email,
          replyTo: sender.replyTo ?? undefined,
          subject: personalizeSubject(campaign.subject ?? campaign.name, recipient, context),
          html,
          text,
          headers: listUnsubscribeHeaders(unsubscribeUrl),
        });

        const messageId = response.data?.id ?? null;
        if (!messageId) {
          throw new Error(response.error?.message ?? "The provider accepted nothing and returned no message id.");
        }

        const now = new Date().toISOString();
        await sb
          .from("email_campaign_recipients")
          .update({ status: "sent", provider_message_id: messageId, sent_at: now, error: null })
          .eq("id", row.id);

        // The event is what drives everything downstream, and its
        // idempotency key means a replay cannot double-count it.
        await sb.from("email_events").insert({
          campaign_id: campaignId,
          recipient_id: row.id,
          provider: "resend",
          provider_message_id: messageId,
          idempotency_key: `resend:sent:${messageId}`,
          event_type: "sent",
          occurred_at: now,
        });

        summary.sent += 1;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "The send failed.";
        await sb
          .from("email_campaign_recipients")
          .update({ status: "failed", error: message.slice(0, 500) })
          .eq("id", row.id);
        summary.failed += 1;
      }
    }

    if (i + BATCH < queue.length) await sleep(PAUSE_MS);
  }

  const { count } = await sb
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  summary.remaining = count ?? 0;

  if (summary.remaining === 0) {
    await sb.from("email_campaigns").update({ status: "sent" }).eq("id", campaignId);
    await sb
      .from("email_sending_domains")
      .update({ last_send_at: new Date().toISOString() })
      .eq("id", campaign.sending_domain_id ?? "00000000-0000-0000-0000-000000000000");
    await logEvent(
      sb, campaignId, "sent",
      `Campaign sent. ${summary.sent} delivered to the provider, ${summary.failed} failed.`,
      options.actor ?? null
    );
  }

  summary.message =
    summary.remaining > 0
      ? `Sent ${summary.sent}. ${summary.remaining} still queued.`
      : `Campaign complete. ${summary.sent} sent, ${summary.failed} failed.`;
  return summary;
}

function personalizeSubject(
  subject: string,
  recipient: { email: string; firstName?: string | null; lastName?: string | null; company?: string | null },
  context: { clientName?: string | null; salesRep?: string | null; serviceName?: string | null }
): string {
  // Same resolver the body uses, so a token cannot behave differently in the
  // subject line — which is the one place a broken token is unmissable.
  return personalize(subject, recipient, context);
}

async function clientNameFor(sb: SupabaseClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await sb
    .from("customers")
    .select("name, business_name")
    .eq("id", customerId)
    .maybeSingle();
  return data?.business_name || data?.name || null;
}

/* ── Test sends ────────────────────────────────────────────────────── */

/**
 * Send the campaign to named internal addresses. §17.
 *
 * Deliberately does NOT touch email_campaign_recipients or email_events: a
 * test is not part of the campaign's numbers, and counting five tests as
 * five sends would put a permanent lie in the open rate. It also skips the
 * suppression check on purpose — you are allowed to test-send to yourself
 * after unsubscribing yourself.
 */
export async function sendTestEmail(
  sb: SupabaseClient,
  campaignId: string,
  addresses: string[]
): Promise<{ ok: boolean; message: string }> {
  const resend = client();
  if (!resend) return { ok: false, message: "No email provider is configured, so no test could be sent." };

  const campaign = await loadCampaign(sb, campaignId);
  const sender = await resolveSender(sb, campaign);
  if (!sender.from) return { ok: false, message: "This campaign has no From address." };

  const clean = [...new Set(addresses.map(normalizeEmail).filter(Boolean))].slice(0, 5);
  if (clean.length === 0) return { ok: false, message: "Add at least one test address." };

  const clientName = await clientNameFor(sb, campaign.customer_id);
  const recipient = {
    email: clean[0],
    firstName: "Alex",
    lastName: "Rivera",
    company: "Rivera Pool Service",
  };
  const context = { clientName, salesRep: campaign.owner, serviceName: null };

  // The test carries a real, working unsubscribe link built from a sentinel
  // id, so what lands in the tester's inbox is the same shape as the real
  // thing — including the footer, which is the part people forget to check.
  const unsubscribeUrl = campaignUnsubscribeUrl(`test-${campaignId}`);

  try {
    const response = await resend.emails.send({
      from: sender.from,
      to: clean,
      replyTo: sender.replyTo ?? undefined,
      subject: `[TEST] ${personalizeSubject(campaign.subject ?? campaign.name, recipient, context)}`,
      html: renderCampaignHtml({
        blocks: campaign.blocks ?? [],
        previewText: campaign.preview_text ?? "",
        tone: campaign.tone,
        recipient,
        context,
        unsubscribeUrl,
        footerReason: "This is a TEST send. Personalization shows sample values.",
        allowCustomHtml: true,
      }),
      text: renderCampaignText({
        blocks: campaign.blocks ?? [],
        previewText: campaign.preview_text ?? "",
        recipient,
        context,
        unsubscribeUrl,
      }),
    });

    if (!response.data?.id) {
      return { ok: false, message: response.error?.message ?? "The provider rejected the test." };
    }

    await logEvent(sb, campaignId, "test_sent", `Test sent to ${clean.join(", ")}.`);
    return { ok: true, message: `Test sent to ${clean.join(", ")}.` };
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : "The test send failed." };
  }
}

/* ── The scheduled-send job ────────────────────────────────────────── */

/**
 * Send everything that is due. Called by the cron.
 *
 * Campaigns are taken one at a time with a per-run budget, because a Vercel
 * function has a wall clock and half a campaign sent twice is worse than
 * half a campaign sent once. The frozen list makes resuming exact.
 */
export async function runDueCampaigns(
  sb: SupabaseClient,
  budget = 400
): Promise<{ examined: number; summaries: SendSummary[] }> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("email_campaigns")
    .select("id, audience_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(5);
  if (error) throw new Error(`due campaigns: ${error.message}`);

  const summaries: SendSummary[] = [];
  let left = budget;

  for (const row of data ?? []) {
    if (left <= 0) break;
    try {
      // Building is idempotent, so doing it on every run is safe and covers
      // the case where a campaign was scheduled before its list was built.
      await buildRecipientList(sb, row.id as string);
      const summary = await sendCampaign(sb, row.id as string, { limit: left });
      summaries.push(summary);
      left -= summary.attempted;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The scheduled send failed.";
      await sb
        .from("email_campaigns")
        .update({ status: "failed", failure_reason: message.slice(0, 500) })
        .eq("id", row.id as string);
      await logEvent(sb, row.id as string, "failed", message);
    }
  }

  return { examined: (data ?? []).length, summaries };
}

/* ── The sequence stepper ──────────────────────────────────────────── */

/**
 * Advance every enrollment whose next step is due.
 *
 * The delay is measured from the PREVIOUS SEND, not from enrollment, so a
 * sequence that was paused for a week resumes with proper spacing instead
 * of firing four overdue emails into somebody's inbox at once.
 *
 * Exit rules are enforced by database triggers on suppression, so this loop
 * never has to remember to check them — an unsubscribed person is already
 * 'exited' and never appears in this query.
 */
export async function runDueSequenceSteps(
  sb: SupabaseClient,
  limit = 100
): Promise<{ examined: number; sent: number; completed: number; failed: number }> {
  const resend = client();
  const now = new Date();
  const summary = { examined: 0, sent: 0, completed: 0, failed: 0 };
  if (!resend) return summary;

  const { data, error } = await sb
    .from("email_sequence_enrollments")
    .select(
      "id, sequence_id, email, first_name, last_name, company, current_step, lead_id, email_sequences!inner(id, name, status, from_name, from_email, reply_to, customer_id, owner)"
    )
    .eq("status", "active")
    .lte("next_send_at", now.toISOString())
    .eq("email_sequences.status", "active")
    .limit(limit);
  if (error) throw new Error(`due enrollments: ${error.message}`);

  for (const row of data ?? []) {
    summary.examined += 1;
    const sequence = Array.isArray(row.email_sequences) ? row.email_sequences[0] : row.email_sequences;
    if (!sequence) continue;

    const nextNumber = (row.current_step as number) + 1;

    const { data: step } = await sb
      .from("email_sequence_steps")
      .select("id, step_number, subject, preview_text, blocks, delay_amount, delay_unit, status")
      .eq("sequence_id", row.sequence_id as string)
      .eq("step_number", nextNumber)
      .maybeSingle();

    if (!step) {
      // No step after this one: they finished the sequence.
      await sb
        .from("email_sequence_enrollments")
        .update({ status: "completed" })
        .eq("id", row.id as string);
      summary.completed += 1;
      continue;
    }

    if (step.status !== "active") {
      // A paused step holds the whole enrollment rather than being skipped —
      // skipping would send step 3 as a reply to step 1's context.
      await sb
        .from("email_sequence_enrollments")
        .update({ next_send_at: new Date(now.getTime() + 3_600_000).toISOString() })
        .eq("id", row.id as string);
      continue;
    }

    const unsubscribeUrl = sequenceUnsubscribeUrl(row.id as string);
    const recipient = {
      email: row.email as string,
      firstName: row.first_name as string | null,
      lastName: row.last_name as string | null,
      company: row.company as string | null,
    };
    const context = { clientName: null, salesRep: sequence.owner as string | null, serviceName: null };
    const from = sequence.from_email
      ? sequence.from_name
        ? `${sequence.from_name} <${sequence.from_email}>`
        : (sequence.from_email as string)
      : process.env.CONTACT_FROM_EMAIL ?? "";

    try {
      const response = await resend.emails.send({
        from,
        to: row.email as string,
        replyTo: (sequence.reply_to as string | null) ?? undefined,
        subject: personalizeSubject((step.subject as string) ?? (sequence.name as string), recipient, context),
        html: renderCampaignHtml({
          blocks: (step.blocks as EmailBlock[]) ?? [],
          previewText: (step.preview_text as string) ?? "",
          recipient,
          context,
          unsubscribeUrl,
          footerReason: "You are receiving this because you enquired with us or opted in to updates.",
          allowCustomHtml: true,
        }),
        text: renderCampaignText({
          blocks: (step.blocks as EmailBlock[]) ?? [],
          previewText: (step.preview_text as string) ?? "",
          recipient,
          context,
          unsubscribeUrl,
        }),
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      });

      if (!response.data?.id) throw new Error(response.error?.message ?? "No message id was returned.");

      // Look ahead so the NEXT step's delay is measured from this send.
      const { data: following } = await sb
        .from("email_sequence_steps")
        .select("delay_amount, delay_unit")
        .eq("sequence_id", row.sequence_id as string)
        .eq("step_number", nextNumber + 1)
        .maybeSingle();

      const nextAt = following
        ? new Date(
            now.getTime() +
              delayMs(following.delay_amount as number, following.delay_unit as DelayUnit)
          ).toISOString()
        : null;

      await sb
        .from("email_sequence_enrollments")
        .update({
          current_step: nextNumber,
          last_sent_at: now.toISOString(),
          next_send_at: nextAt,
          status: following ? "active" : "completed",
        })
        .eq("id", row.id as string);

      await sb.from("email_events").insert({
        sequence_enrollment_id: row.id as string,
        provider: "resend",
        provider_message_id: response.data.id,
        idempotency_key: `resend:sent:${response.data.id}`,
        event_type: "sent",
        occurred_at: now.toISOString(),
      });

      summary.sent += 1;
      if (!following) summary.completed += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The step failed to send.";
      await sb
        .from("email_sequence_enrollments")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", row.id as string);
      summary.failed += 1;
    }
  }

  return summary;
}

/** Re-exported so the composer and the actions share one definition. */
export { canSend, preSendChecks };
