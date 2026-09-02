"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 4000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

const REVALIDATE = ["/admin/proposals", "/admin/pipeline", "/admin/crm", "/admin"];

export async function saveProposalAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const dealId = str(formData, "deal_id", 40);
  if (!dealId) return;

  const amount = cents(str(formData, "amount", 30));
  const hosting = cents(str(formData, "hosting", 30)) ?? 0;
  const billing = str(formData, "billing", 20) === "monthly" ? "monthly" : "one_time";
  const title = str(formData, "title", 200);
  const scope = str(formData, "scope", 6000);
  const nextAction = str(formData, "next_action", 300);
  const nextActionAt = str(formData, "next_action_at", 40);
  const expectedClose = str(formData, "expected_close", 20);

  const { data: deal } = await supabase
    .from("deals")
    .select("id, lead_id, stage")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;

  await supabase.from("deals").update({
    title: title || undefined,
    stage: ["won", "lost"].includes(deal.stage) ? deal.stage : "proposal",
    value_cents: amount,
    billing,
    notes: scope || null,
    next_action: nextAction || null,
    next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
    expected_close: expectedClose || null,
    last_activity_at: new Date().toISOString(),
  }).eq("id", dealId);

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, kind")
    .eq("deal_id", dealId)
    .in("status", ["draft", "sent"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isLaunch = invoice?.kind === "launch" || hosting > 0;
  const invoicePatch = {
    lead_id: deal.lead_id,
    deal_id: dealId,
    kind: isLaunch ? "launch" : "upsell",
    amount_cents: isLaunch ? 0 : amount ?? 0,
    launch_cents: isLaunch ? amount ?? 0 : 0,
    hosting_cents: isLaunch ? hosting : 0,
    billing: isLaunch ? "one_time" : billing,
    description: scope || title || "Custom proposal",
    notes: amount ? null : "Pricing intentionally left open until scope is confirmed.",
  };
  if (invoice) await supabase.from("invoices").update(invoicePatch).eq("id", invoice.id);
  else await supabase.from("invoices").insert({ ...invoicePatch, status: "draft" });

  for (const path of REVALIDATE) revalidatePath(path);
}

/** Imports the supplied Facebook conversation once, without claiming a sale. */
export async function syncKeyKonnectConversationAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();
  const dealId = str(formData, "deal_id", 40);
  const leadId = str(formData, "lead_id", 40);
  if (!dealId || !leadId) return;

  const { data: lead } = await supabase
    .from("leads")
    .select("first_name, last_name, business_name, services_interested")
    .eq("id", leadId)
    .maybeSingle();
  const identity = `${lead?.first_name ?? ""} ${lead?.last_name ?? ""} ${lead?.business_name ?? ""}`.toLowerCase();
  if (!lead || (!identity.includes("cory simek") && !identity.includes("key konnect"))) return;

  const nextFollowup = new Date("2026-09-02T14:00:00.000Z");
  const services = Array.from(new Set([...(lead.services_interested ?? []), "Website", "CRM", "E-commerce"]));
  // Keep the factual contact update separate so a pre-existing duplicate
  // email cannot prevent the rest of the proposal sync from saving.
  await supabase.from("leads").update({ email: "corywiththekeys@gmail.com" }).eq("id", leadId);
  await supabase.from("leads").update({
    services_interested: services,
    source: "facebook",
    last_contacted_at: "2026-09-01T12:39:00.000Z",
    next_followup_at: nextFollowup.toISOString(),
  }).eq("id", leadId);

  const brief = [
    "The Key Konnect — $399 website launch + $29/month hosting.",
    "Agreed scope: 4–5 pages, working vehicle inventory, an initial merchandise shop, and a music experience.",
    "Working preview delivered: https://corywiththekeys.vercel.app/",
    "Music direction confirmed: ‘13 Years Old.’ Cory has the MP3; file requested by email.",
    "Company logo/assets requested. Awaiting MP3, logo, vehicle details/photos, merchandise catalog, and preview feedback.",
    "Contact originated through Facebook. Do not mark Won until acceptance or payment is recorded.",
  ].join("\n");

  await supabase.from("deals").update({
    title: "The Key Konnect website launch",
    stage: "proposal",
    value_cents: 39900,
    billing: "one_time",
    notes: brief,
    next_action: "Send proposal and collect MP3, logo, vehicle inventory, merch catalog, and preview feedback",
    next_action_at: nextFollowup.toISOString(),
    last_activity_at: "2026-09-01T12:39:00.000Z",
  }).eq("id", dealId);

  const { data: existingEvent } = await supabase
    .from("lead_events")
    .select("id, meta")
    .eq("lead_id", leadId)
    .eq("type", "note")
    .order("created_at", { ascending: false })
    .limit(30);
  const alreadyImported = (existingEvent ?? []).some((event) =>
    (event.meta as { import_key?: string } | null)?.import_key === "key-konnect-facebook-2026-09-01"
  );
  if (!alreadyImported) {
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "note",
      body: brief,
      actor,
      meta: { import_key: "key-konnect-facebook-2026-09-01", channel: "facebook" },
      created_at: "2026-09-01T12:39:00.000Z",
    });
  }

  const { data: openTask } = await supabase
    .from("tasks")
    .select("id")
    .eq("lead_id", leadId)
    .eq("done", false)
    .in("kind", ["followup", "callback"])
    .limit(1)
    .maybeSingle();
  const task = {
    title: "Follow up with Cory Simek",
    notes: "Send the formal proposal. Ask for the ‘13 Years Old’ MP3, company logo, vehicle photos/details, merchandise products/prices, and preview feedback.",
    kind: "followup",
    priority: "high",
    due_at: nextFollowup.toISOString(),
    owner: actor,
    lead_id: leadId,
    source: "manual",
  };
  if (openTask) await supabase.from("tasks").update(task).eq("id", openTask.id);
  else await supabase.from("tasks").insert(task);

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("deal_id", dealId)
    .in("status", ["draft", "sent"])
    .limit(1)
    .maybeSingle();
  const proposalInvoice = {
    deal_id: dealId,
    lead_id: leadId,
    kind: "launch",
    amount_cents: 0,
    launch_cents: 39900,
    hosting_cents: 2900,
    billing: "one_time",
    description: "4–5 page website for The Key Konnect with vehicle inventory, merchandise shop, music experience, and starter CRM.",
    notes: "$399 one-time build and $29/month hosting. Assets and final content are still being collected.",
  };
  if (invoice) await supabase.from("invoices").update(proposalInvoice).eq("id", invoice.id);
  else await supabase.from("invoices").insert({ ...proposalInvoice, status: "draft" });

  for (const path of REVALIDATE) revalidatePath(path);
  revalidatePath(`/admin/leads/${leadId}`);
}
