"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { cancelPendingFollowups } from "@/lib/campaign/intake";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/supabase/types";
import { OFFER_PRICE_CENTS, CAMPAIGN_NAME } from "@/lib/campaign/config";

/**
 * Every action re-checks the admin. Server actions are public endpoints —
 * "the UI only shows this to admins" is not a control.
 *
 * All writes go through the request-scoped client, so RLS applies on top.
 * The service role is never used here.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** "$1,299.00" / "1299" / "1,299" → 129900 cents. */
function toCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function toInt(raw: string): number {
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ── Lead pipeline ───────────────────────────────────────────────────────────

export async function updateLeadStatus(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  const status = str(formData, "lead_status", 40) as LeadStatus;
  if (!leadId || !LEAD_STATUSES.includes(status)) return;

  const patch: Record<string, unknown> = { lead_status: status };
  if (status === "Contacted" || status === "Contact Attempted") {
    patch.last_contacted_at = new Date().toISOString();
  }
  if (status === "Won" || status === "Lost") {
    patch.closed_at = new Date().toISOString();
  }
  const lostReason = str(formData, "lost_reason", 300);
  if (status === "Lost" && lostReason) patch.lost_reason = lostReason;

  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) return;

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "status_change",
    body: `Status set to ${status}.`,
    actor,
  });

  // Automated sales follow-up stops the moment a human takes over the
  // outcome — booked, sold, lost, or parked.
  if (["Contacted", "Demo Scheduled", "Won", "Lost", "Follow Up Later"].includes(status)) {
    await cancelPendingFollowups(leadId, `status:${status}`);
  }

  if (status === "Won") await ensureCustomerForLead(leadId);

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

export async function addLeadNote(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  const body = str(formData, "body", 4000);
  const type = str(formData, "type", 30) || "note";
  if (!leadId || !body) return;

  const allowed = ["note", "call", "email_sent", "sms"];
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: allowed.includes(type) ? type : "note",
    body,
    actor,
  });

  if (type === "call" || type === "email_sent" || type === "sms") {
    await supabase
      .from("leads")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", leadId);
  }

  revalidatePath(`/admin/leads/${leadId}`);
}

export async function updateLeadFields(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  if (!leadId) return;

  const patch: Record<string, unknown> = {};
  const assigned = str(formData, "assigned_to", 120);
  const next = str(formData, "next_followup_at", 40);
  const notes = str(formData, "notes", 4000);
  const dnc = formData.get("do_not_contact") === "on";

  patch.assigned_to = assigned || null;
  patch.next_followup_at = next ? new Date(next).toISOString() : null;
  patch.notes = notes || null;
  patch.do_not_contact = dnc;

  await supabase.from("leads").update(patch).eq("id", leadId);

  if (dnc) {
    await cancelPendingFollowups(leadId, "do_not_contact");
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "system",
      body: "Marked do-not-contact. Pending automated follow-up cancelled.",
      actor,
    });
  }

  revalidatePath(`/admin/leads/${leadId}`);
}

// ── Appointments ────────────────────────────────────────────────────────────

export async function addAppointment(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  const when = str(formData, "scheduled_at", 40);
  if (!leadId || !when) return;

  await supabase.from("appointments").insert({
    lead_id: leadId,
    scheduled_at: new Date(when).toISOString(),
    status: "scheduled",
    source: "admin",
  });

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "appointment",
    body: `Appointment booked for ${new Date(when).toLocaleString("en-US")}.`,
    actor,
  });

  await cancelPendingFollowups(leadId, "appointment_booked");

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

// ── Revenue ─────────────────────────────────────────────────────────────────

async function ensureCustomerForLead(leadId: string): Promise<string | null> {
  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: lead } = await supabase
    .from("leads")
    .select("first_name, last_name, email, phone, business_name")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const { data: created } = await supabase
    .from("customers")
    .insert({
      lead_id: leadId,
      name: `${lead.first_name} ${lead.last_name}`.trim(),
      business_name: lead.business_name,
      email: lead.email,
      phone: lead.phone,
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

export async function addRevenue(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  const kind = str(formData, "kind", 20);
  const category = str(formData, "category", 40) || "other";
  const description = str(formData, "description", 300);
  const amountCents = toCents(str(formData, "amount", 30));
  const occurred = str(formData, "occurred_at", 40);

  if (!leadId || !["initial", "recurring", "upsell"].includes(kind) || amountCents <= 0) {
    return;
  }

  const customerId = await ensureCustomerForLead(leadId);

  await supabase.from("revenue_events").insert({
    customer_id: customerId,
    lead_id: leadId,
    kind,
    category,
    description: description || null,
    amount_cents: amountCents,
    campaign: CAMPAIGN_NAME,
    occurred_at: occurred ? new Date(occurred).toISOString() : new Date().toISOString(),
  });

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "revenue",
    body: `${kind} revenue recorded: $${(amountCents / 100).toFixed(2)} (${category}).`,
    actor,
  });

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

/** Records the standard $399 build in one click. */
export async function recordLaunchSale(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  if (!leadId) return;

  const customerId = await ensureCustomerForLead(leadId);

  const { data: already } = await supabase
    .from("revenue_events")
    .select("id")
    .eq("lead_id", leadId)
    .eq("kind", "initial")
    .maybeSingle();

  if (!already) {
    await supabase.from("revenue_events").insert({
      customer_id: customerId,
      lead_id: leadId,
      kind: "initial",
      category: "launch_package",
      description: "$399 Business Launch package",
      amount_cents: OFFER_PRICE_CENTS,
      campaign: CAMPAIGN_NAME,
    });
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "revenue",
      body: "$399 Business Launch package recorded.",
      actor,
    });
  }

  await supabase
    .from("leads")
    .update({ lead_status: "Won", closed_at: new Date().toISOString() })
    .eq("id", leadId);
  await cancelPendingFollowups(leadId, "won");

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

// ── Ad spend ────────────────────────────────────────────────────────────────

export async function upsertSpend(formData: FormData) {
  const { supabase } = await requireAdmin();

  const date = str(formData, "date", 20);
  if (!date) return;

  const row = {
    date,
    campaign: str(formData, "campaign", 200) || CAMPAIGN_NAME,
    // Empty string, not null — the unique upsert key spans these columns.
    adset: str(formData, "adset", 200),
    ad: str(formData, "ad", 200),
    placement: str(formData, "placement", 100),
    device: str(formData, "device", 100),
    spend_cents: toCents(str(formData, "spend", 30)),
    impressions: toInt(str(formData, "impressions", 20)),
    reach: toInt(str(formData, "reach", 20)),
    clicks: toInt(str(formData, "clicks", 20)),
    landing_page_views: toInt(str(formData, "landing_page_views", 20)),
    source: "manual" as const,
  };

  // Same day + same breakdown overwrites rather than double-counting.
  await supabase.from("campaign_spend").upsert(row, {
    onConflict: "date,campaign,adset,ad,placement,device",
  });

  revalidatePath("/admin/marketing/spend");
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

export async function deleteSpend(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "id", 40);
  if (!id) return;
  await supabase.from("campaign_spend").delete().eq("id", id);
  revalidatePath("/admin/marketing/spend");
  revalidatePath("/admin/marketing/campaigns/business-launch");
}

// ── Session ─────────────────────────────────────────────────────────────────

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
