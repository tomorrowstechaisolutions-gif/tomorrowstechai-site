"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

/**
 * Writes for the Clients screens.
 *
 * Same posture as the other action files: re-check the admin on every call,
 * use the request-scoped client so RLS applies on top of that check, never
 * touch the service role.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, userId: session.user.id };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function toCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

const CLIENTS = "/admin/clients";

export async function updateClientFields(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(formData, "customer_id", 40);
  if (!id) return;

  const { data: current } = await supabase
    .from("customers")
    .select("company_id, lead_id")
    .eq("id", id)
    .maybeSingle();

  // Tags arrive as free text. Split, trim, drop blanks, de-duplicate, cap —
  // a tag list is a filter, and one that grows without limit stops filtering.
  const tags = [
    ...new Set(
      str(formData, "tags", 400)
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 12);

  const patch: Record<string, unknown> = {
    business_name: str(formData, "business_name", 200) || null,
    name: str(formData, "name", 200) || null,
    phone: str(formData, "phone", 40) || null,
    business_type: str(formData, "business_type", 100) || null,
    city: str(formData, "city", 100) || null,
    state: str(formData, "state", 60) || null,
    owner: str(formData, "owner", 100) || null,
    notes_internal: str(formData, "notes_internal", 4000) || null,
    tags,
  };

  // Email is the key the Stripe webhook matches on. Only overwrite it when a
  // real one was typed — a blank field must not orphan the customer record.
  const email = str(formData, "email", 200).toLowerCase();
  if (email) patch.email = email;

  const { error } = await supabase.from("customers").update(patch).eq("id", id);
  if (error) throw new Error(`Could not save client: ${error.message}`);

  // A client remains the same person and company they were as a lead. Keep
  // those linked records aligned so CRM screens never show conflicting data.
  if (current?.lead_id) {
    await supabase
      .from("leads")
      .update({
        email: email || undefined,
        phone: patch.phone,
        business_name: patch.business_name,
        business_type: patch.business_type,
        assigned_to: patch.owner,
        company_id: current.company_id,
      })
      .eq("id", current.lead_id);
  }

  if (str(formData, "sync_company", 2) === "1") {
    const companyPatch = {
      name: str(formData, "business_name", 200) || "Unnamed company",
      domain: str(formData, "company_domain", 240)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "") || null,
      business_type: patch.business_type,
      phone: str(formData, "company_phone", 40) || null,
      city: patch.city,
      state: patch.state,
      owner: patch.owner,
      tags,
      notes: str(formData, "company_notes", 4000) || null,
      updated_at: new Date().toISOString(),
    };

    if (current?.company_id) {
      const { error: companyError } = await supabase
        .from("companies")
        .update(companyPatch)
        .eq("id", current.company_id);
      if (companyError) throw new Error(`Client saved, but company could not be saved: ${companyError.message}`);
    } else {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert(companyPatch)
        .select("id")
        .single();
      if (companyError) throw new Error(`Client saved, but company could not be created: ${companyError.message}`);
      if (company?.id) {
        await supabase.from("customers").update({ company_id: company.id }).eq("id", id);
        if (current?.lead_id) {
          await supabase.from("leads").update({ company_id: company.id }).eq("id", current.lead_id);
        }
      }
    }
  }

  if (current?.lead_id) {
    await supabase.from("lead_events").insert({
      lead_id: current.lead_id,
      type: "system",
      body: "Client record updated",
      actor,
    });
  }

  revalidatePath(CLIENTS);
  revalidatePath(`${CLIENTS}/${id}`);
  revalidatePath("/admin/crm");
  if (str(formData, "return_to", 20) === "edit") {
    redirect(`${CLIENTS}/${id}/edit?saved=details`);
  }
}

/**
 * The monthly rate, typed by hand.
 *
 * Only offered for a client with no Stripe subscription attached. When Stripe
 * owns the subscription it also owns the number, and a hand-typed figure
 * would be silently overwritten the next time a subscription event arrives —
 * which is worse than not being able to type it at all.
 */
export async function updateClientBilling(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "customer_id", 40);
  if (!id) return;

  const { data: existing } = await supabase
    .from("customers")
    .select("stripe_subscription_id")
    .eq("id", id)
    .maybeSingle();

  if (existing?.stripe_subscription_id) return;

  const status = str(formData, "status", 20);
  const patch: Record<string, unknown> = {
    mrr_cents: toCents(str(formData, "mrr", 20)),
  };

  if (["active", "paused", "churned"].includes(status)) {
    patch.status = status;
    if (status === "churned") patch.churned_at = new Date().toISOString();
    if (status !== "churned") patch.churned_at = null;
    if (status === "churned") patch.mrr_cents = 0;
  }

  const renews = str(formData, "renews_at", 40);
  if (renews) {
    const d = new Date(renews);
    if (!Number.isNaN(d.getTime())) {
      patch.renews_at = d.toISOString();
      patch.renewal_amount_cents = patch.mrr_cents;
    }
  }

  await supabase.from("customers").update(patch).eq("id", id);

  revalidatePath(CLIENTS);
  revalidatePath(`${CLIENTS}/${id}`);
  if (str(formData, "return_to", 20) === "edit") {
    redirect(`${CLIENTS}/${id}/edit?saved=billing`);
  }
}

/**
 * Record what a client actually said when asked.
 *
 * Appended, never updated. The Clients screen averages each client's most
 * recent rating, so the history stays honest about when opinion changed
 * rather than pretending the current number was always true.
 */
export async function recordSatisfaction(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData, "customer_id", 40);
  const rating = Number.parseInt(str(formData, "rating", 2), 10);
  if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) return;

  const occasion = str(formData, "occasion", 20);

  await supabase.from("client_satisfaction").insert({
    customer_id: id,
    rating,
    note: str(formData, "note", 2000) || null,
    occasion: ["check_in", "launch", "support", "renewal", "ad_hoc"].includes(occasion)
      ? occasion
      : "check_in",
    recorded_by: userId,
  });

  revalidatePath(CLIENTS);
  revalidatePath(`${CLIENTS}/${id}`);
}

export async function addClient(formData: FormData) {
  const { supabase } = await requireAdmin();
  const email = str(formData, "email", 200).toLowerCase();
  if (!email) return;

  const { data } = await supabase
    .from("customers")
    .insert({
      business_name: str(formData, "business_name", 200) || null,
      name: str(formData, "name", 200) || null,
      email,
      phone: str(formData, "phone", 40) || null,
      business_type: str(formData, "business_type", 100) || null,
      city: str(formData, "city", 100) || null,
      state: str(formData, "state", 60) || null,
      owner: str(formData, "owner", 100) || null,
      status: "active",
      won_at: new Date().toISOString(),
      mrr_cents: toCents(str(formData, "mrr", 20)),
    })
    .select("id")
    .single();

  revalidatePath(CLIENTS);
  if (data?.id) redirect(`${CLIENTS}/${data.id}`);
}
