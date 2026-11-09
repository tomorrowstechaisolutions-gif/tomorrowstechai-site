import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { syncPartner } from "@/lib/partners/sync";
import type { PartnerConnection } from "@/lib/partners/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every 15 minutes: pull each partner's assigned work and settlements. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
