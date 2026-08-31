"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import type { DealStage } from "@/lib/crm/stages";

/**
 * Writes for the CRM.
 *
 * The one rule with teeth: closing a deal must record WHEN. The database
 * enforces it (stage 'won' requires won_at), and this file supplies the
 * timestamp rather than letting a form omit it — otherwise the win-rate and
 * the close-date report quietly disagree with the stage column.
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

function toCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

const CRM = "/admin/crm";

const STAGES: DealStage[] = [
  "new", "qualified", "discovery", "proposal",
  "negotiation", "won", "lost", "on_hold",
];

/** Bare host, lowercased, no www — matching the unique index on companies. */
function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  let host = trimmed;
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    host = trimmed.replace(/^https?:\/\//, "").split("/")[0];
  }
  host = host.replace(/^www\./, "").replace(/\/$/, "");
  return host.includes(".") ? host : null;
}

export async function addCompanyAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(formData, "name", 200);
  if (!name) return;

  const { error } = await supabase.from("companies").insert({
    name,
    domain: normalizeDomain(str(formData, "domain", 200)),
    business_type: str(formData, "business_type", 120) || null,
    city: str(formData, "city", 120) || null,
    state: str(formData, "state", 40) || null,
    phone: str(formData, "phone", 40) || null,
    owner: str(formData, "owner", 120) || null,
  });

  // A duplicate domain is the expected failure — one website, one business.
  if (error) console.error("[crm:company]", error.message);
  revalidatePath(CRM);
}

/** Attach an existing contact to a company. This is the multi-contact move. */
export async function linkContactAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const contactId = str(formData, "contact_id", 40);
  const kind = str(formData, "kind", 20);
  const companyId = str(formData, "company_id", 40);
  if (!contactId || !["lead", "customer"].includes(kind)) return;

  await supabase
    .from(kind === "lead" ? "leads" : "customers")
    .update({ company_id: companyId || null })
    .eq("id", contactId);

  revalidatePath(CRM);
}

export async function addDealAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const title = str(formData, "title", 200);
  if (!title) return;

  const stage = str(formData, "stage", 30) as DealStage;
  const chosen = STAGES.includes(stage) ? stage : "new";
  const now = new Date().toISOString();

  await supabase.from("deals").insert({
    title,
    company_id: str(formData, "company_id", 40) || null,
    lead_id: str(formData, "lead_id", 40) || null,
    catalog_item_id: str(formData, "catalog_item_id", 40) || null,
    stage: chosen,
    value_cents: toCents(str(formData, "value", 20)),
    billing: str(formData, "billing", 20) === "monthly" ? "monthly" : "one_time",
    expected_close: str(formData, "expected_close", 20) || null,
    owner: str(formData, "owner", 120) || actor,
    notes: str(formData, "notes", 2000) || null,
    // The DB requires these on a closed stage; supply them rather than
    // letting the insert fail on a form that did not think about it.
    won_at: chosen === "won" ? now : null,
    lost_at: chosen === "lost" ? now : null,
  });

  revalidatePath(CRM);
  revalidatePath("/admin");
}

/**
 * Move a deal through the funnel.
 *
 * Closing stamps the time. Re-opening a closed deal clears it, so a deal that
 * went Won → Negotiation does not keep claiming it was won in March.
 */
export async function setDealStageAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "deal_id", 40);
  const stage = str(formData, "stage", 30) as DealStage;
  if (!id || !STAGES.includes(stage)) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage };

  if (stage === "won") {
    patch.won_at = now;
    patch.lost_at = null;
    patch.lost_reason = null;
  } else if (stage === "lost") {
    patch.lost_at = now;
    patch.won_at = null;
    patch.lost_reason = str(formData, "lost_reason", 500) || null;
  } else {
    patch.won_at = null;
    patch.lost_at = null;
    patch.lost_reason = null;
  }

  await supabase.from("deals").update(patch).eq("id", id);

  revalidatePath(CRM);
  revalidatePath("/admin");
}

/** A note on a contact. Goes to lead_events, which is already the timeline. */
export async function addNoteAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const leadId = str(formData, "lead_id", 40);
  const body = str(formData, "body", 4000);
  if (!leadId || !body) return;

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    type: "note",
    body,
    actor,
  });

  await supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath(CRM);
  revalidatePath(`/admin/leads/${leadId}`);
}
