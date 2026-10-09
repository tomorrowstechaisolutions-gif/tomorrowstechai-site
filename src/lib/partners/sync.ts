import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrders, fetchSettlements, partnerKeyConfigured, PartnerApiError } from "./client";
import type { RemoteOrder, RemoteSettlement } from "./client";
import { splitSale } from "./config";
import type { PartnerConnection, PartnerWorkOrder } from "./types";

/**
 * Pulls a partner's assigned work and settlements into this admin.
 *
 *   orders       → partner_work_orders (upsert by their id), and a project in
 *                  `jobs` the first time an order is seen. The project's stage
 *                  is ours after that; their status is mirrored on the order.
 *   settlements  → partner_settlements (upsert by their ref). A settlement
 *                  that becomes PAID writes exactly one revenue_events row.
 *
 * Idempotent: running it twice changes nothing the second time.
 */

export type SyncResult = {
  ok: boolean;
  orders: number;
  newOrders: number;
  projectsCreated: number;
  settlements: number | null;
  error?: string;
};

function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(v);
  return m ? m[0] : null;
}

function orderRow(partnerId: string, o: RemoteOrder) {
  return {
    partner_id: partnerId,
    external_id: String(o.romar_service_order_id),
    order_code: o.order_code ?? null,
    service: o.service ?? null,
    campaign_type: o.campaign_type ?? null,
    scope: o.scope ?? null,
    partner_status: o.status ?? null,
    platforms: Array.isArray(o.platforms) ? o.platforms.map(String).slice(0, 20) : [],
    posts_per_week: typeof o.posts_per_week === "number" ? o.posts_per_week : null,
    starts_on: dateOnly(o.starts_on),
    ends_on: dateOnly(o.ends_on),
    renews_on: dateOnly(o.renews_on),
    external_author_id: o.romar_author_id ?? null,
    author_name: o.author_name ?? null,
    external_book_id: o.romar_book_id ?? null,
    book_title: o.book_title ?? null,
    brief: o.brief ?? null,
    ...(Array.isArray(o.campaigns)
      ? { campaigns: o.campaigns.filter((c) => c && c.id).map((c) => ({ id: String(c.id), name: c.name ?? null, status: c.status ?? null })) }
      : {}),
    raw: o as unknown as Record<string, unknown>,
    last_synced_at: new Date().toISOString(),
    removed_at: null,
  };
}

function projectTitle(p: PartnerConnection, o: PartnerWorkOrder): string {
  const what = o.service || o.campaign_type || "Marketing";
  const about = o.book_title || o.author_name;
  return `${p.name} · ${o.order_code ? `${o.order_code} · ` : ""}${what}${about ? ` — ${about}` : ""}`.slice(0, 200);
}

async function ensureProject(sb: SupabaseClient, p: PartnerConnection, o: PartnerWorkOrder): Promise<boolean> {
  if (o.job_id) return false;
  const notes = [
    `White-label work for ${p.name}. Deliver under ${p.name}'s brand; do not contact the author directly — route anything for the author through ${p.name}.`,
    o.brief ? `Brief: ${o.brief}` : null,
    o.platforms.length ? `Platforms: ${o.platforms.join(", ")}${o.posts_per_week ? ` · ${o.posts_per_week} posts/week` : ""}` : null,
    o.starts_on || o.ends_on ? `Window: ${o.starts_on ?? "?"} → ${o.ends_on ?? "open"}` : null,
    `Partner order: ${o.order_code ?? o.external_id}`,
  ].filter(Boolean).join("\n");

  const { data, error } = await sb.from("jobs").insert({
    customer_id: p.customer_id,
    title: projectTitle(p, o),
    business_name: p.name,
    stage: "Intake",
    package: "partner_marketing",
    project_type: "other",
    due_at: o.ends_on ? `${o.ends_on}T17:00:00Z` : null,
    notes,
    next_milestone: "Review the brief and plan the campaign",
  }).select("id").single();

  if (error || !data) {
    console.error("Partner project create failed:", error?.message);
    return false;
  }
  await sb.from("partner_work_orders").update({ job_id: data.id }).eq("id", o.id);
  await sb.from("job_events").insert({
    job_id: data.id, kind: "note", actor: "system",
    body: `Created from ${p.name} work order ${o.order_code ?? o.external_id}.`,
  });
  return true;
}

async function upsertSettlement(
  sb: SupabaseClient, p: PartnerConnection, s: RemoteSettlement, orderIds: Map<string, string>
): Promise<void> {
  const share = Number.isFinite(s.share_pct) ? s.share_pct : p.our_share_pct;
  // Trust the partner's figure for our share, but keep the split adding up.
  const computed = splitSale(s.sale_cents, s.fee_cents, share);
  const ours = Number.isFinite(s.partner_share_cents)
    ? Math.min(computed.netCents, Math.max(0, Math.round(s.partner_share_cents)))
    : computed.ourCents;

  await sb.from("partner_settlements").upsert({
    partner_id: p.id,
    work_order_id: s.romar_service_order_id ? orderIds.get(String(s.romar_service_order_id)) ?? null : null,
    external_ref: String(s.settlement_id),
    source: "partner_feed",
    description: s.description ?? null,
    currency: (s.currency || "usd").toLowerCase(),
    sale_cents: Math.round(s.sale_cents),
    fee_cents: Math.round(s.fee_cents),
    share_pct: share,
    our_share_cents: ours,
    partner_share_cents: computed.netCents - ours,
    sold_at: s.sold_at,
    status: s.status ?? "pending",
    paid_at: s.paid_at ?? null,
    reversed_cents: Math.max(0, Math.round(s.reversed_cents ?? 0)),
  }, { onConflict: "partner_id,external_ref" });
}

/** Books every PAID settlement that has no revenue row yet. Exactly once each. */
export async function bookPaidSettlements(sb: SupabaseClient, p: PartnerConnection): Promise<number> {
  const { data } = await sb.from("partner_settlements")
    .select("id, external_ref, description, our_share_cents, reversed_cents, currency, paid_at, sold_at")
    .eq("partner_id", p.id).eq("status", "paid").is("revenue_event_id", null).limit(200);
  let booked = 0;
  for (const s of (data ?? []) as {
    id: string; external_ref: string; description: string | null; our_share_cents: number;
    reversed_cents: number; currency: string; paid_at: string | null; sold_at: string;
  }[]) {
    const externalId = `partner:${p.partner_key}:${s.external_ref}`;
    // revenue_events.external_id is unique: a repeat run finds the first row.
    const { data: existing } = await sb.from("revenue_events").select("id").eq("external_id", externalId).maybeSingle();
    let revenueId = (existing?.id as string | undefined) ?? null;
    if (!revenueId) {
      const { data: inserted, error } = await sb.from("revenue_events").insert({
        customer_id: p.customer_id,
        kind: "initial",
        category: "marketing",
        description: `${p.name} revenue share — ${s.description ?? s.external_ref}`,
        amount_cents: Math.max(0, s.our_share_cents - s.reversed_cents),
        currency: s.currency,
        campaign: p.partner_key,
        occurred_at: s.paid_at ?? s.sold_at,
        external_id: externalId,
      }).select("id").single();
      if (error || !inserted) { console.error("Revenue booking failed:", error?.message); continue; }
      revenueId = inserted.id as string;
    }
    await sb.from("partner_settlements").update({ revenue_event_id: revenueId }).eq("id", s.id);
    booked += 1;
  }
  return booked;
}

export async function syncPartner(sb: SupabaseClient, p: PartnerConnection): Promise<SyncResult> {
  const finish = async (result: SyncResult) => {
    await sb.from("partner_connections").update({
      last_sync_at: new Date().toISOString(),
      last_sync_ok: result.ok,
      last_sync_error: result.error ? result.error.slice(0, 500) : null,
      last_sync_count: result.orders,
      ...(result.ok && p.status === "pending_configuration" ? { status: "active" } : {}),
    }).eq("id", p.id);
    return result;
  };

  if (!partnerKeyConfigured(p)) {
    return finish({
      ok: false, orders: 0, newOrders: 0, projectsCreated: 0, settlements: null,
      error: `${p.api_key_env ?? "The API key"} is not set in Vercel yet.`,
    });
  }

  try {
    const remote = await fetchOrders(p);
    const seen = new Set<string>();
    let newOrders = 0;

    const { data: before } = await sb.from("partner_work_orders")
      .select("external_id").eq("partner_id", p.id);
    const known = new Set(((before ?? []) as { external_id: string }[]).map((r) => r.external_id));

    for (const o of remote) {
      if (!o?.romar_service_order_id) continue;
      const row = orderRow(p.id, o);
      seen.add(row.external_id);
      if (!known.has(row.external_id)) newOrders += 1;
      const { error } = await sb.from("partner_work_orders").upsert(row, { onConflict: "partner_id,external_id" });
      if (error) throw new Error(`Could not save order ${row.order_code ?? row.external_id}: ${error.message}`);
    }

    // Orders that left their feed are marked, never deleted.
    const gone = [...known].filter((id) => !seen.has(id));
    if (gone.length > 0) {
      await sb.from("partner_work_orders").update({ removed_at: new Date().toISOString() })
        .eq("partner_id", p.id).in("external_id", gone).is("removed_at", null);
    }

    const { data: open } = await sb.from("partner_work_orders").select("*")
      .eq("partner_id", p.id).is("job_id", null).is("removed_at", null).limit(100);
    let projectsCreated = 0;
    for (const o of (open ?? []) as PartnerWorkOrder[]) {
      if (await ensureProject(sb, p, o)) projectsCreated += 1;
    }

    // Settlements: optional until the partner publishes the feed.
    let settlements: number | null = null;
    const { data: latest } = await sb.from("partner_settlements").select("updated_at")
      .eq("partner_id", p.id).eq("source", "partner_feed").order("updated_at", { ascending: false }).limit(1);
    const since = (latest?.[0]?.updated_at as string | undefined)
      ? new Date(new Date(latest![0].updated_at as string).getTime() - 7 * 86_400_000).toISOString()
      : null;
    const feed = await fetchSettlements(p, since);
    if (feed) {
      const { data: orders } = await sb.from("partner_work_orders").select("id, external_id").eq("partner_id", p.id);
      const ids = new Map(((orders ?? []) as { id: string; external_id: string }[]).map((r) => [r.external_id, r.id]));
      for (const s of feed) if (s?.settlement_id) await upsertSettlement(sb, p, s, ids);
      settlements = feed.length;
    }
    await bookPaidSettlements(sb, p);

    return finish({ ok: true, orders: remote.length, newOrders, projectsCreated, settlements });
  } catch (error) {
    const message = error instanceof PartnerApiError || error instanceof Error ? error.message : "Sync failed.";
    return finish({ ok: false, orders: 0, newOrders: 0, projectsCreated: 0, settlements: null, error: message });
  }
}
