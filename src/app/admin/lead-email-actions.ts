"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { cancelPendingFollowups } from "@/lib/campaign/intake";
import { activityBody, checkDraft, emailBlock, type EmailableLead } from "@/lib/leads/direct-email";
import type { LeadStatus } from "@/lib/supabase/types";

export type LeadEmailState = { ok: boolean; message: string; sentAt?: string } | null;

function fromEmail() {
  return process.env.CONTACT_FROM_EMAIL || "Tomorrow's Tech AI <hello@tomorrowstechai.com>";
}

function adminInbox() {
  return process.env.CONTACT_TO_EMAIL || "john@tomorrowstechai.com";
}

/**
 * Sends one personal email to a lead, then records it on the lead.
 *
 * Replies go to John's inbox (reply-to), not to the no-reply sending address.
 * The email is logged on the activity timeline with its full text, so the
 * lead record shows exactly what was said and when.
 */
export async function sendLeadEmailAction(_prev: LeadEmailState, formData: FormData): Promise<LeadEmailState> {
  // Server actions are public endpoints; re-check the admin every time.
  const session = await getAdminUser();
  if (!session) return { ok: false, message: "Your admin session expired. Sign in again." };
  const supabase = await createSupabaseServerClient();
  const actor = session.admin.email;

  const field = (key: string, max: number) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.slice(0, max) : "";
  };
  const leadId = field("lead_id", 40).trim();
  if (!leadId) return { ok: false, message: "Missing lead." };

  const draft = checkDraft(field("subject", 400), field("body", 12_000));
  if (!draft.ok) return { ok: false, message: draft.error };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, first_name, business_name, email, do_not_contact, unsubscribed_at, lead_status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "That lead no longer exists." };

  const block = emailBlock(lead as EmailableLead);
  if (block.blocked) return { ok: false, message: block.reason };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, message: "Email isn't configured on this server (RESEND_API_KEY is missing). Nothing was sent." };

  const sendCopy = formData.get("send_copy") === "on";
  let resendId: string | null = null;
  try {
    const res = await new Resend(key).emails.send({
      from: fromEmail(),
      to: lead.email,
      replyTo: adminInbox(),
      ...(sendCopy ? { bcc: adminInbox() } : {}),
      subject: draft.subject,
      text: draft.body,
    });
    if (res.error) {
      console.error("Lead email failed:", res.error);
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        type: "email_failed",
        body: `Email not sent: ${draft.subject}`,
        meta: { subject: draft.subject, error: res.error.message ?? "send failed", direct: true },
        actor,
      });
      revalidatePath(`/admin/leads/${lead.id}`);
      return { ok: false, message: `The email provider refused it: ${res.error.message ?? "unknown error"}. Nothing was sent.` };
    }
    resendId = res.data?.id ?? null;
  } catch (err) {
    console.error("Lead email failed:", err);
    return { ok: false, message: "Couldn't reach the email provider. Nothing was sent; try again." };
  }

  const now = new Date().toISOString();
  await supabase.from("lead_events").insert({
    lead_id: lead.id,
    type: "email_sent",
    body: activityBody(draft.subject, draft.body),
    meta: { subject: draft.subject, to: lead.email, resend_id: resendId, copy_to_admin: sendCopy, direct: true },
    actor,
  });

  const patch: Record<string, unknown> = { last_contacted_at: now };
  const markContacted = formData.get("mark_contacted") === "on" && (lead.lead_status as LeadStatus) === "New";
  if (markContacted) patch.lead_status = "Contacted";
  await supabase.from("leads").update(patch).eq("id", lead.id);
  if (markContacted) {
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      type: "status_change",
      body: "New → Contacted (personal email sent).",
      actor,
    });
  }

  if (formData.get("stop_automation") === "on") {
    await cancelPendingFollowups(lead.id, "personal_email_sent");
  }

  revalidatePath(`/admin/leads/${lead.id}`);
  return { ok: true, message: `Sent to ${lead.email}. Replies will land in ${adminInbox()}.`, sentAt: now };
}
