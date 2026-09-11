import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogSnapshot, CreativeBrief } from "./types";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function priceFor(row: Row) {
  const mode = text(row.pricing_mode);
  if (mode === "custom_quote") return "Custom quote";
  if (mode === "free") return "Free";
  const cents = Number(row.from_cents ?? 0);
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const prefix = mode === "starting_at" ? "Starting at " : "";
  return `${prefix}${amount}${row.billing_type === "recurring" ? "/month" : " one time"}`;
}

export async function loadCatalogSnapshot(db: SupabaseClient, id: string): Promise<CatalogSnapshot> {
  const { data, error } = await db.from("catalog_items").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Catalog item not found.");
  const row = data as Row;
  let features: string[] = [];
  if (row.offer_kind === "package") {
    const result = await db.from("service_package_relationships")
      .select("feature_label,feature_description,service:catalog_items!service_id(name)")
      .eq("package_id", id).eq("included", true).order("sort_order").limit(8);
    features = (result.data ?? []).map((entry: Row) => text(entry.feature_label) || text(entry.feature_description) || text((entry.service as Row | null)?.name)).filter(Boolean);
  } else {
    const result = await db.from("service_inclusions").select("name,client_facing_description").eq("service_id", id).order("sort_order").limit(8);
    features = (result.data ?? []).map((entry: Row) => text(entry.name) || text(entry.client_facing_description)).filter(Boolean);
  }
  return {
    id, kind: row.offer_kind === "package" ? "package" : "service", name: text(row.name),
    slug: text(row.slug) || id, description: text(row.short_description) || text(row.description),
    price: priceFor(row), features, cta: text(row.cta_label) || "Get Started Today",
    route: text(row.cta_route) || text(row.public_route) || null, updatedAt: text(row.updated_at),
  };
}

export function snapshotFingerprint(snapshot: CatalogSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function briefFromSnapshot(snapshot: CatalogSnapshot, input: Partial<CreativeBrief>): CreativeBrief {
  return {
    headline: text(input.headline) || snapshot.name,
    subheadline: text(input.subheadline) || snapshot.description,
    features: Array.isArray(input.features) && input.features.length ? input.features.map(text).filter(Boolean).slice(0, 8) : snapshot.features.slice(0, 8),
    cta: text(input.cta) || snapshot.cta,
    templateKey: text(input.templateKey) || "premium-product",
    visualConcept: text(input.visualConcept), imageStyle: text(input.imageStyle),
    audience: text(input.audience), objective: text(input.objective),
  };
}

export function backgroundPrompt(snapshot: CatalogSnapshot, brief: CreativeBrief, guidance: string) {
  return [
    "Create a premium commercial advertising background for a technology services company.",
    `Offer: ${snapshot.name}. Context: ${snapshot.description}.`,
    `Art direction: ${guidance}`,
    brief.visualConcept ? `Visual concept: ${brief.visualConcept}.` : "",
    brief.imageStyle ? `Image style: ${brief.imageStyle}.` : "",
    brief.audience ? `Intended audience: ${brief.audience}.` : "",
    brief.objective ? `Campaign objective: ${brief.objective}.` : "",
    "Near-black navy environment, electric blue rim lighting, cinematic depth, realistic premium product photography.",
    "Reserve clean dark negative space on the left/top for copy and a clear lower zone for price and CTA.",
    "IMPORTANT: no words, letters, numbers, logos, watermarks, UI labels, prices, buttons, or readable text anywhere in the image.",
    "Use believable screens only as abstract interface shapes. Crisp, modern, trustworthy, suitable for a high-end business ad.",
  ].join(" ");
}
