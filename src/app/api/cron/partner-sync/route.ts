import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { syncPartner } from "@/lib/partners/sync";
import type { PartnerConnection } from "@/lib/partners/types";
import { withCronRun } from "@/lib/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every 15 minutes: pull each partner's assigned work and settlements. */
export function GET(req: Request) {
  return withCronRun("partner-sync", req, run);
}

async function run(): Promise<Response> {
  if (!supabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const db = supabaseAdmin();
  const { data } = await db.from("partner_connections").select("*")
    .in("status", ["pending_configuration", "active"]);

  const results: Record<string, unknown> = {};
  for (const p of (data ?? []) as PartnerConnection[]) {
    if (!p.api_key_env || !process.env[p.api_key_env]) {
      results[p.partner_key] = { skipped: "no API key configured" };
      continue;
    }
    const r = await syncPartner(db, p);
    results[p.partner_key] = { ok: r.ok, orders: r.orders, newOrders: r.newOrders, error: r.error };
  }
  return NextResponse.json({ ok: true, results });
}
