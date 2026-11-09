"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getPartner } from "@/lib/partners/queries";
import { bookPaidSettlements, syncPartner } from "@/lib/partners/sync";
import type { SyncResult } from "@/lib/partners/sync";
import { pushCampaignStatus, raiseTask, PartnerApiError } from "@/lib/partners/client";
import { PARTNER_CAMPAIGN_STATUSES, splitSale } from "@/lib/partners/config";
import type { PartnerWorkOrder } from "@/lib/partners/types";

/**
 * Partner Center writes. Results are returned, not thrown, so the screen can
 * say exactly what the partner's API answered.
 */

export type PartnerResult = { ok: boolean; message?: string; error?: string; sync?: SyncResult };

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function touch(key: string) {
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${key}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
}

export async function syncPartnerAction(fd: FormData): Promise<PartnerResult> {
  const { supabase } = await requireAdmin();
  const p = await getPartner(supabase, str(fd, "partner_key", 80));
  if (!p) return { ok: false, error: "That partner no longer exists." };
  const sync = await syncPartner(supabase, p);
  touch(p.partner_key);
  return sync.ok
    ? {
        ok: true, sync,
        message: `Synced ${sync.orders} order${sync.orders === 1 ? "" : "s"}`
          + (sync.newOrders ? ` · ${sync.newOrders} new` : "")
          + (sync.projectsCreated ? ` · ${sync.projectsCreated} project${sync.projectsCreated === 1 ? "" : "s"} created` : "")
          + (sync.settlements === null ? " · settlement feed not published yet" : ` · ${sync.settlements} settlements`)
          + ".",
      }
    : { ok: false, sync, error: sync.error };
}

export async function pushOrderStatusAction(fd: FormData): Promise<PartnerResult> {
  const { supabase } = await requireAdmin();
  const p = await getPartner(supabase, str(fd, "partner_key", 80));
  if (!p) return { ok: false, error: "That partner no longer exists." };

  const { data } = await supabase.from("partner_work_orders").select("*")
    .eq("id", str(fd, "order_id", 40)).eq("partner_id", p.id).maybeSingle();
  const order = data as PartnerWorkOrder | null;
  if (!order) return { ok: false, error: "That work order no longer exists." };

  const campaignId = str(fd, "campaign_id", 80);
  const campaign = order.campaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    return { ok: false, error: `${p.name}'s feed has not provided a campaign id for this order yet, so its status cannot be updated from here.` };
  }
  const status = str(fd, "status", 40);
  if (!(PARTNER_CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Pick one of the listed statuses." };
  }

  try {
    const result = await pushCampaignStatus(p, campaignId, status, campaign.status ?? null, str(fd, "note", 500) || null);
    if (!result.ok) {
      touch(p.partner_key);
      return { ok: false, error: `${result.message} ${p.name} has it as "${result.theirStatus ?? "unknown"}" — sync, then try again.` };
    }
    await supabase.from("partner_work_orders").update({
      campaigns: order.campaigns.map((c) => (c.id === campaignId ? { ...c, status } : c)),
    }).eq("id", order.id);
    if (order.job_id) {
      await supabase.from("job_events").insert({
        job_id: order.job_id, kind: "note", actor: "system",
        body: `Reported "${status}" to ${p.name} for ${campaign.name ?? "the campaign"}.`,
      });
    }
    touch(p.partner_key);
    return { ok: true, message: `${p.name} now shows "${status}".` };
  } catch (error) {
    return { ok: false, error: error instanceof PartnerApiError ? error.message : "The update did not go through." };
  }
}

export async function raisePartnerTaskAction(fd: FormData): Promise<PartnerResult> {
  const { supabase } = await requireAdmin();
  const p = await getPartner(supabase, str(fd, "partner_key", 80));
  if (!p) return { ok: false, error: "That partner no longer exists." };
  const title = str(fd, "title", 200);
  if (!title) return { ok: false, error: "Give the task a title." };
  try {
    await raiseTask(p, { title, description: str(fd, "description", 2000) || null });
    return { ok: true, message: `Task raised in ${p.name}'s marketing queue.` };
  } catch (error) {
    return { ok: false, error: error instanceof PartnerApiError ? error.message : "The task was not raised." };
  }
}

/** A settlement entered by hand — used until the automatic feed is live. */
export async function recordSettlementAction(fd: FormData): Promise<PartnerResult> {
  const { supabase, actor } = await requireAdmin();
  const p = await getPartner(supabase, str(fd, "partner_key", 80));
  if (!p) return { ok: false, error: "That partner no longer exists." };

  const sale = cents(str(fd, "sale", 20));
  const fee = cents(str(fd, "fee", 20) || "0");
  if (sale === null || sale === 0) return { ok: false, error: "Enter the sale amount." };
  if (fee === null || fee > sale) return { ok: false, error: "The fee must be between $0 and the sale amount." };

  const pctRaw = Number(str(fd, "share_pct", 8) || p.our_share_pct);
  const pct = Number.isFinite(pctRaw) && pctRaw >= 0 && pctRaw <= 100 ? pctRaw : p.our_share_pct;
  const split = splitSale(sale, fee, pct);
  const paid = fd.get("paid") === "on";
  const soldOn = /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "sold_on", 10)) ? str(fd, "sold_on", 10) : null;
  const ref = str(fd, "reference", 120) || `manual-${Date.now()}`;

  const { error } = await supabase.from("partner_settlements").insert({
    partner_id: p.id,
    work_order_id: str(fd, "order_id", 40) || null,
    external_ref: ref,
    source: "manual",
    description: str(fd, "description", 300) || null,
    sale_cents: sale,
    fee_cents: fee,
    share_pct: pct,
    our_share_cents: split.ourCents,
    partner_share_cents: split.theirCents,
    sold_at: soldOn ? `${soldOn}T17:00:00Z` : new Date().toISOString(),
    status: paid ? "paid" : "pending",
    paid_at: paid ? new Date().toISOString() : null,
    notes: str(fd, "notes", 1000) || null,
    created_by: actor,
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "A settlement with that reference already exists." : `Could not save: ${error.message}` };
  }
  if (paid) await bookPaidSettlements(supabase, p);
  touch(p.partner_key);
  return { ok: true, message: `Recorded: your share ${(split.ourCents / 100).toFixed(2)} of ${(split.netCents / 100).toFixed(2)} net.` };
}

export async function markSettlementPaidAction(fd: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const p = await getPartner(supabase, str(fd, "partner_key", 80));
  if (!p) return;
  await supabase.from("partner_settlements").update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", str(fd, "settlement_id", 40)).eq("partner_id", p.id).eq("status", "pending");
  await bookPaidSettlements(supabase, p);
  touch(p.partner_key);
}
