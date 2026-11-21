import "server-only";
import { launchPrice } from "@/lib/catalog/launch";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/admin";
import { guideOfferSlugs } from "./script";

/** What the guide shows about an offer it recommends. Read from the catalog, so it follows the live prices. */
export type GuideOffer = { slug: string; name: string; blurb: string | null; price: string; regular: string | null; setup: string | null };

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

type Row = { slug: string | null; name: string; short_description: string | null; subtitle: string | null; from_cents: number | null; setup_fee_cents: number | null; billing_type: string | null; pricing_mode: string | null };

/** One catalog row, as the price a visitor reads. Kept apart from the query so it can be tested. */
export function offerFromRow(row: Row): GuideOffer {
  const launch = launchPrice(row.slug, row.from_cents ?? 0);
  const cents = launch ? launch.chargeCents : (row.from_cents ?? 0);
  const per = row.billing_type === "recurring" ? "/month" : "";
  const quote = row.pricing_mode === "custom_quote" || !cents;
  return {
    slug: String(row.slug),
    name: row.name,
    blurb: row.short_description || row.subtitle || null,
    price: quote ? "Custom quote" : `${row.pricing_mode === "starting_at" ? "From " : ""}${usd(cents)}${per}`,
    regular: launch ? `${usd(launch.listCents)}${per}` : null,
    setup: row.setup_fee_cents ? `${usd(row.setup_fee_cents)} one-time setup` : null,
  };
}

/** The offers the script can recommend, by slug. An offer that is not active is left out, and the page falls back to "talk to John". */
export async function loadGuideOffers(): Promise<Record<string, GuideOffer>> {
  if (!supabaseConfigured()) return {};
  try {
    const { data, error } = await supabaseAdmin()
      .from("catalog_items")
      .select("slug, name, short_description, subtitle, from_cents, setup_fee_cents, billing_type, pricing_mode")
      .in("slug", guideOfferSlugs())
      .eq("status", "active")
      .is("archived_at", null);
    if (error || !data) return {};
    return Object.fromEntries((data as Row[]).filter((r) => r.slug).map((r) => [r.slug as string, offerFromRow(r)]));
  } catch {
    return {};
  }
}
