import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadCatalogSnapshot } from "@/lib/ad-studio/core";

export async function POST(request: Request) {
  const session = await getAdminUser(); if (!session || !["owner", "admin"].includes(session.admin.role)) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  const key = process.env.OPENAI_API_KEY; if (!key) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { catalogId?: string; instruction?: string };
  if (!body.catalogId) return NextResponse.json({ error: "Choose a catalog item first." }, { status: 400 });
  const snapshot = await loadCatalogSnapshot(await createSupabaseServerClient(), body.catalogId).catch(() => null);
  if (!snapshot) return NextResponse.json({ error: "Catalog item not found." }, { status: 404 });
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_COPY_MODEL || "gpt-5-mini", response_format: { type: "json_object" }, messages: [{ role: "system", content: "You write concise, premium B2B ad copy. Return JSON only with headline, subheadline, body, features (array of 4-8 strings), and cta. Never alter or invent prices, capabilities, or claims. Use only the supplied record." }, { role: "user", content: JSON.stringify({ instruction: body.instruction || "benefit focused", record: snapshot }) }] }), signal: AbortSignal.timeout(45_000) });
  const json = await response.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!response.ok) return NextResponse.json({ error: json.error?.message || "Copy generation failed." }, { status: response.status === 429 ? 429 : 502 });
  try { const copy = JSON.parse(json.choices?.[0]?.message?.content || "{}"); return NextResponse.json({ copy: { headline: String(copy.headline || snapshot.name).slice(0, 70), subheadline: String(copy.subheadline || snapshot.description).slice(0, 180), body: String(copy.body || "").slice(0, 500), features: Array.isArray(copy.features) ? copy.features.map(String).slice(0, 8) : snapshot.features, cta: String(copy.cta || snapshot.cta).slice(0, 36), price: snapshot.price } }); }
  catch { return NextResponse.json({ error: "The copy response was not valid." }, { status: 502 }); }
}
