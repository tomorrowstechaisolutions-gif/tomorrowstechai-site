import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/email-marketing/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One click, no login, no confirmation step.
 *
 * Same posture as the existing /api/unsubscribe route, which handles the
 * automated lead follow-ups: anything more than one click and people reach
 * for "report spam" instead, which is worse for everyone — for them, and
 * for the sending domain.
 *
 * This route covers MARKETING campaigns and sequences, which go to leads,
 * customers and imported addresses alike. It writes to the global
 * suppression list rather than to a single lead row, so an opt-out sticks
 * across every list the address appears on. The database triggers do the
 * rest: exit their live sequences, unsubscribe them from static lists, and
 * update the CRM's own consent columns.
 */

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Tomorrow's Tech AI</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#04070D;color:#E9EFF7;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
 .c{max-width:420px;border:1px solid #1B2739;border-radius:16px;padding:28px;background:#0A111C}
 h1{font-size:1.25rem;margin:0 0 10px}
 p{color:#94A3B8;margin:0 0 14px}
 a{color:#60A5FA}
</style></head><body><div class="c"><h1>${title}</h1><p>${body}</p>
<p><a href="https://tomorrowstechai.com">tomorrowstechai.com</a></p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

const FAILED = [
  "That link didn't work",
  "It may have expired. Email john@tomorrowstechai.com and we'll take you off the list by hand — no questions.",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const recipientId = url.searchParams.get("r");
  const enrollmentId = url.searchParams.get("e");
  const token = url.searchParams.get("t") ?? "";

  if (!supabaseConfigured() || (!recipientId && !enrollmentId) || !token) {
    return page(FAILED[0], FAILED[1], 400);
  }

  const scope = recipientId ? "c" : "s";
  const id = (recipientId ?? enrollmentId)!;
  if (!verifyUnsubscribe(scope, id, token)) return page(FAILED[0], FAILED[1], 400);

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  // A test send carries a sentinel id so the footer link is real and
  // clickable in the tester's inbox — but it must not suppress anybody.
  if (id.startsWith("test-")) {
    return page(
      "This was a test message",
      "Nothing was changed. Test sends use a working link so the footer can be checked, but they never unsubscribe a real contact."
    );
  }

  let email: string | null = null;
  let campaignId: string | null = null;
  let sequenceId: string | null = null;
  let leadId: string | null = null;
  let customerId: string | null = null;
  let recipientRowId: string | null = null;

  if (scope === "c") {
    const { data } = await db
      .from("email_campaign_recipients")
      .select("id, email, campaign_id, lead_id, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return page(FAILED[0], FAILED[1], 400);
    email = data.email as string;
    campaignId = data.campaign_id as string;
    leadId = (data.lead_id as string | null) ?? null;
    customerId = (data.customer_id as string | null) ?? null;
    recipientRowId = data.id as string;
  } else {
    const { data } = await db
      .from("email_sequence_enrollments")
      .select("id, email, sequence_id, lead_id, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return page(FAILED[0], FAILED[1], 400);
    email = data.email as string;
    sequenceId = data.sequence_id as string;
    leadId = (data.lead_id as string | null) ?? null;
    customerId = (data.customer_id as string | null) ?? null;
  }

  // The suppression row is the decision. Its trigger exits their sequences
  // and unsubscribes them from static lists, so none of that is repeated
  // here and none of it can be forgotten.
  await db.from("email_suppressions").insert({
    email: email!.toLowerCase(),
    reason: "unsubscribed",
    source_campaign_id: campaignId,
    source_sequence_id: sequenceId,
    lead_id: leadId,
    customer_id: customerId,
    note: "One-click unsubscribe from a marketing email.",
    suppressed_at: now,
  });

  // Stamp the recipient row too, so the campaign's own numbers show the
  // unsubscribe against the send that caused it.
  if (recipientRowId) {
    await db
      .from("email_campaign_recipients")
      .update({ unsubscribed_at: now })
      .eq("id", recipientRowId);
    await db.from("email_events").insert({
      campaign_id: campaignId,
      recipient_id: recipientRowId,
      provider: "internal",
      idempotency_key: `internal:unsubscribed:${recipientRowId}`,
      event_type: "unsubscribed",
      occurred_at: now,
    });
  }

  // The CRM keeps its own consent record, and the existing lead-followup
  // cron reads it, so it is told directly rather than only through the
  // suppression list.
  if (leadId) {
    await db
      .from("leads")
      .update({ unsubscribed_at: now, email_consent: false, do_not_contact: true })
      .eq("id", leadId);
    await db
      .from("lead_followups")
      .update({ status: "cancelled", error: "unsubscribed" })
      .eq("lead_id", leadId)
      .eq("status", "pending");
    await db.from("lead_events").insert({
      lead_id: leadId,
      type: "system",
      body: "Unsubscribed from marketing email via the one-click link.",
      actor: "lead",
    });
  }

  return page(
    "You're unsubscribed",
    "No more marketing email from us — that covers newsletters, offers and any automated follow-up sequence you were in. Anything you have actually asked for, like an invoice or a receipt, will still reach you."
  );
}

/**
 * Gmail and Outlook's one-click unsubscribe POSTs to the same URL with the
 * query string intact. Without this, the button in the mail client fails and
 * people reach for "report spam" instead.
 */
export async function POST(request: Request) {
  return GET(request);
}
