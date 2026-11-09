import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartnerConnection, PartnerSettlement, PartnerWorkOrder } from "./types";

export async function listPartners(sb: SupabaseClient): Promise<PartnerConnection[]> {
  const { data } = await sb.from("partner_connections").select("*").order("name");
  return (data ?? []) as PartnerConnection[];
}

export async function getPartner(sb: SupabaseClient, key: string): Promise<PartnerConnection | null> {
  const { data } = await sb.from("partner_connections").select("*").eq("partner_key", key).maybeSingle();
  return (data as PartnerConnection | null) ?? null;
}

export type PartnerOverview = {
  partner: PartnerConnection;
  orders: (PartnerWorkOrder & { jobStage: string | null })[];
  settlements: PartnerSettlement[];
  totals: {
    salesCents: number; feesCents: number; ourCents: number; theirCents: number;
    paidCents: number; pendingCents: number; monthOurCents: number;
  };
  client: { id: string; name: string | null; email: string | null; mrrCents: number } | null;
  website: { id: string; name: string; domain: string | null } | null;
  invoices: { id: string; invoice_number: string; status: string; recurring_cents: number; title: string }[];
};

export async function partnerOverview(sb: SupabaseClient, p: PartnerConnection): Promise<PartnerOverview> {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

  const [orders, settlements, client, website, invoices] = await Promise.all([
    sb.from("partner_work_orders").select("*").eq("partner_id", p.id)
      .order("first_seen_at", { ascending: false }).limit(200),
    sb.from("partner_settlements").select("*").eq("partner_id", p.id)
      .order("sold_at", { ascending: false }).limit(500),
    p.customer_id
      ? sb.from("customers").select("id, name, email, mrr_cents").eq("id", p.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    p.website_id
      ? sb.from("websites").select("id, name, domain").eq("id", p.website_id).maybeSingle()
      : Promise.resolve({ data: null }),
    p.customer_id
      ? sb.from("invoices").select("id, invoice_number, status, recurring_cents, title")
          .eq("customer_id", p.customer_id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const orderRows = (orders.data ?? []) as PartnerWorkOrder[];
  const jobIds = orderRows.map((o) => o.job_id).filter((v): v is string => Boolean(v));
  const stages = new Map<string, string>();
  if (jobIds.length) {
    const { data } = await sb.from("jobs").select("id, stage").in("id", jobIds);
    for (const j of (data ?? []) as { id: string; stage: string }[]) stages.set(j.id, j.stage);
  }

  const rows = (settlements.data ?? []) as PartnerSettlement[];
  const live = rows.filter((s) => s.status !== "reversed");
  const sum = (f: (s: PartnerSettlement) => number, list = live) => list.reduce((a, s) => a + f(s), 0);

  const c = client.data as { id: string; name: string | null; email: string | null; mrr_cents: number } | null;
  return {
    partner: p,
    orders: orderRows.map((o) => ({ ...o, jobStage: o.job_id ? stages.get(o.job_id) ?? null : null })),
    settlements: rows,
    totals: {
      salesCents: sum((s) => s.sale_cents),
      feesCents: sum((s) => s.fee_cents),
      ourCents: sum((s) => s.our_share_cents - s.reversed_cents),
      theirCents: sum((s) => s.partner_share_cents),
      paidCents: sum((s) => s.our_share_cents - s.reversed_cents, live.filter((s) => s.status === "paid")),
      pendingCents: sum((s) => s.our_share_cents, live.filter((s) => s.status === "pending")),
      monthOurCents: sum((s) => s.our_share_cents - s.reversed_cents, live.filter((s) => s.sold_at >= monthStart)),
    },
    client: c ? { id: c.id, name: c.name, email: c.email, mrrCents: c.mrr_cents } : null,
    website: (website.data as { id: string; name: string; domain: string | null } | null) ?? null,
    invoices: (invoices.data ?? []) as PartnerOverview["invoices"],
  };
}
