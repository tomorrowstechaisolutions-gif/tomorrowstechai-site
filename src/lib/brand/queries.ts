import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BrandStatus = "active" | "draft" | "needs_review" | "incomplete" | "paused" | "archived";
export type BrandHealth = "complete" | "needs_review" | "incomplete" | "unknown";

export type BrandKit = {
  id: string; name: string; internalName: string | null; slug: string;
  clientId: string | null; clientName: string | null; brandType: string;
  status: BrandStatus; industry: string | null; tagline: string | null;
  description: string | null; tone: string | null; audience: string | null;
  primaryCta: string | null; primaryFont: string | null; colors: string[];
  logoUrl: string | null; logoCount: number; assetCount: number; templateCount: number;
  pendingCount: number; health: BrandHealth; completeness: number; missing: string[];
  updatedAt: string;
};

export type BrandAsset = {
  id: string; brandId: string | null; brandName: string | null; title: string;
  assetType: string; category: string | null; role: string | null; mimeType: string | null;
  fileSize: number | null; width: number | null; height: number | null;
  approvalStatus: string; tags: string[]; createdAt: string; updatedAt: string;
  storagePath: string; url: string | null; usageCount: number;
};

export type BrandBoard = {
  brands: BrandKit[]; assets: BrandAsset[];
  templates: { id: string; brandId: string; brandName: string | null; name: string; type: string; width: number | null; height: number | null; status: string; usageCount: number; updatedAt: string }[];
  clients: { id: string; name: string }[]; industries: string[];
  kpis: { total: number; clientBrands: number; logos: number; templates: number; addedThisMonth: number; needsReview: number };
  health: { complete: number; needsReview: number; incomplete: number };
  attention: { id: string; brandId: string; brand: string; message: string; tone: "critical" | "warning" | "info" }[];
  recentAssets: BrandAsset[];
  mostUsed: { brand: BrandKit; total: number; channels: { channel: string; count: number }[] } | null;
};

export type BrandFilters = {
  tab: "kits" | "assets" | "templates" | "approvals" | "guidelines";
  q?: string; status?: string; client?: string; industry?: string; type?: string;
  sort: "name" | "updated" | "used" | "assets" | "review"; view: "grid" | "list";
};

type RawBrand = Record<string, unknown> & { id: string; name: string; slug: string; customer_id: string | null; updated_at: string };
type RawAsset = Record<string, unknown> & { id: string; brand_profile_id: string | null; storage_path: string; title: string; created_at: string; updated_at: string };

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const text = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const number = (value: unknown): number | null => typeof value === "number" ? value : null;

async function signedUrls(sb: SupabaseClient, rows: RawAsset[]) {
  const paths = [...new Set(rows.map((a) => a.storage_path).filter(Boolean))];
  if (!paths.length) return new Map<string, string>();
  const { data } = await sb.storage.from("brand-assets").createSignedUrls(paths, 300);
  return new Map<string, string>((data ?? []).flatMap((v) => v.path && v.signedUrl ? [[v.path, v.signedUrl]] : []));
}

function assetShape(a: RawAsset, names: Map<string, string>, urls: Map<string, string>, usage: Map<string, number>): BrandAsset {
  return {
    id: a.id, brandId: a.brand_profile_id, brandName: a.brand_profile_id ? names.get(a.brand_profile_id) ?? null : null,
    title: a.title, assetType: text(a.asset_type) ?? "other", category: text(a.category), role: text(a.role),
    mimeType: text(a.mime_type), fileSize: number(a.file_size), width: number(a.width), height: number(a.height),
    approvalStatus: text(a.approval_status) ?? "draft", tags: strings(a.tags),
    createdAt: a.created_at, updatedAt: a.updated_at, storagePath: a.storage_path,
    url: urls.get(a.storage_path) ?? null, usageCount: usage.get(a.id) ?? 0,
  };
}

function healthFor(r: RawBrand, colors: string[], logoCount: number, pending: number) {
  const required: [string, boolean][] = [
    ["Primary logo", logoCount > 0], ["Primary color", colors.length > 0],
    ["Secondary color", colors.length > 1 || Boolean(r.secondary_color)], ["Primary font", Boolean(r.primary_font)],
    ["Tagline", Boolean(r.tagline)], ["Short description", Boolean(r.short_description ?? r.description)],
    ["Tone", Boolean(r.tone)], ["Target audience", Boolean(r.audience)], ["Primary CTA", Boolean(r.primary_cta ?? r.cta_style)],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([label]) => label);
  const completeness = Math.round(((required.length - missing.length) / required.length) * 100);
  const health: BrandHealth = missing.length ? "incomplete" : pending ? "needs_review" : "complete";
  return { missing, completeness, health };
}

export async function loadBrandBoard(sb: SupabaseClient, filters: BrandFilters): Promise<BrandBoard> {
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const [brandRes, clientRes, assetRes, colorRes, templateRes, usageRes] = await Promise.all([
    sb.from("brand_profiles").select("*").is("archived_at", null).neq("status", "archived").order("updated_at", { ascending: false }),
    sb.from("customers").select("id, business_name").order("business_name").limit(500),
    sb.from("content_assets").select("*").eq("is_archived", false).order("created_at", { ascending: false }).limit(500),
    sb.from("brand_colors").select("brand_profile_id, hex, role, display_order").eq("is_archived", false).order("display_order"),
    sb.from("brand_templates").select("id, brand_profile_id, name, template_type, width, height, status, usage_count, updated_at, asset_id").neq("status", "archived"),
    sb.from("brand_asset_usage").select("asset_id, channel, used_at").gte("used_at", month.toISOString()).limit(5000),
  ]);
  for (const result of [brandRes, clientRes, assetRes, colorRes, templateRes, usageRes]) {
    if (result.error) throw new Error(`brand assets: ${result.error.message}`);
  }

  const raws = (brandRes.data ?? []) as RawBrand[];
  const rawAssets = (assetRes.data ?? []) as RawAsset[];
  const clients = ((clientRes.data ?? []) as { id: string; business_name: string }[]).map((c) => ({ id: c.id, name: c.business_name }));
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const brandNames = new Map(raws.map((b) => [b.id, b.name]));
  const usageRows = (usageRes.data ?? []) as { asset_id: string; channel: string }[];
  const usageCounts = new Map<string, number>();
  for (const u of usageRows) usageCounts.set(u.asset_id, (usageCounts.get(u.asset_id) ?? 0) + 1);
  const urls = await signedUrls(sb, rawAssets.filter((a) => text(a.mime_type)?.startsWith("image/")).slice(0, 60));
  const assets = rawAssets.map((a) => assetShape(a, brandNames, urls, usageCounts));

  const colorRows = (colorRes.data ?? []) as { brand_profile_id: string; hex: string; role: string }[];
  const templateRows = (templateRes.data ?? []) as { id: string; brand_profile_id: string; name: string; template_type: string; width: number | null; height: number | null; status: string; usage_count: number; updated_at: string }[];
  const templates = templateRows.map((t) => ({ id: t.id, brandId: t.brand_profile_id, brandName: brandNames.get(t.brand_profile_id) ?? null, name: t.name, type: t.template_type, width: t.width, height: t.height, status: t.status, usageCount: t.usage_count, updatedAt: t.updated_at }));
  const kits = raws.map((r): BrandKit => {
    const brandAssets = assets.filter((a) => a.brandId === r.id);
    const colors = colorRows.filter((c) => c.brand_profile_id === r.id).map((c) => c.hex);
    const legacyColors = strings(r.colors);
    const palette = colors.length ? colors : legacyColors;
    const logos = brandAssets.filter((a) => a.assetType === "logo");
    const pending = brandAssets.filter((a) => ["waiting_review", "changes_requested", "rejected"].includes(a.approvalStatus)).length + templates.filter((t) => t.brandId === r.id && t.status === "waiting_review").length;
    const health = healthFor(r, palette, logos.length, pending);
    return {
      id: r.id, name: r.name, internalName: text(r.internal_name), slug: r.slug,
      clientId: r.customer_id, clientName: r.customer_id ? clientNames.get(r.customer_id) ?? null : null,
      brandType: text(r.brand_type) ?? (r.customer_id ? "client" : "internal"), status: (text(r.status) ?? "active") as BrandStatus,
      industry: text(r.industry), tagline: text(r.tagline), description: text(r.short_description ?? r.description),
      tone: text(r.tone), audience: text(r.audience), primaryCta: text(r.primary_cta ?? r.cta_style),
      primaryFont: text(r.primary_font), colors: palette,
      logoUrl: logos.find((a) => a.role === "primary")?.url ?? logos[0]?.url ?? null,
      logoCount: logos.length, assetCount: brandAssets.length, templateCount: templates.filter((t) => t.brandId === r.id).length,
      pendingCount: pending, ...health, updatedAt: r.updated_at,
    };
  });

  const needle = filters.q?.toLowerCase();
  let filtered = kits.filter((b) => {
    if (needle && !`${b.name} ${b.clientName ?? ""} ${b.industry ?? ""} ${b.tagline ?? ""}`.toLowerCase().includes(needle)) return false;
    if (filters.status && b.status !== filters.status) return false;
    if (filters.client && b.clientId !== filters.client) return false;
    if (filters.industry && b.industry !== filters.industry) return false;
    if (filters.type && b.brandType !== filters.type) return false;
    return true;
  });
  filtered = filtered.sort((a, b) => filters.sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : filters.sort === "used" ? usageFor(b.id) - usageFor(a.id) : filters.sort === "assets" ? b.assetCount - a.assetCount : filters.sort === "review" ? b.pendingCount - a.pendingCount : a.name.localeCompare(b.name));

  function usageFor(id: string) { return assets.filter((a) => a.brandId === id).reduce((sum, a) => sum + a.usageCount, 0); }
  const ranked = kits.map((brand) => ({ brand, total: usageFor(brand.id) })).filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  const most = ranked[0];
  const mostUsed = most ? { ...most, channels: Object.entries(usageRows.filter((u) => assets.find((a) => a.id === u.asset_id)?.brandId === most.brand.id).reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.channel]: (acc[u.channel] ?? 0) + 1 }), {})).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count) } : null;

  const attention = kits.flatMap((b) => {
    const items: BrandBoard["attention"] = [];
    if (b.missing.length) items.push({ id: `${b.id}-missing`, brandId: b.id, brand: b.name, message: `${b.missing[0]} missing${b.missing.length > 1 ? ` +${b.missing.length - 1} more` : ""}`, tone: "critical" });
    if (b.pendingCount) items.push({ id: `${b.id}-review`, brandId: b.id, brand: b.name, message: `${b.pendingCount} item${b.pendingCount === 1 ? "" : "s"} awaiting review`, tone: "warning" });
    return items;
  }).slice(0, 4);

  return {
    brands: filtered, assets, templates, clients, industries: [...new Set(kits.map((b) => b.industry).filter((v): v is string => Boolean(v)))].sort(),
    kpis: { total: kits.length, clientBrands: kits.filter((b) => b.clientId).length, logos: assets.filter((a) => a.assetType === "logo").length, templates: templates.length, addedThisMonth: assets.filter((a) => a.createdAt >= month.toISOString()).length, needsReview: kits.filter((b) => b.health !== "complete").length + assets.filter((a) => a.approvalStatus === "waiting_review").length },
    health: { complete: kits.filter((b) => b.health === "complete").length, needsReview: kits.filter((b) => b.health === "needs_review").length, incomplete: kits.filter((b) => b.health === "incomplete").length },
    attention, recentAssets: assets.slice(0, 6), mostUsed,
  };
}

export type BrandDetail = BrandKit & {
  ownership: string; longDescription: string | null; mission: string | null; vision: string | null;
  coreMessage: string | null; idealCustomer: string | null; coreServices: string[]; differentiators: string[];
  secondaryCta: string | null; toneGuidance: string | null; preferredPhrases: string[]; prohibitedPhrases: string[];
  colorsDetailed: { id: string; name: string; hex: string; role: string; usageNotes: string | null }[];
  typography: { id: string; fontName: string; weight: string | null; style: string | null; role: string; fallback: string | null; usageNotes: string | null }[];
  assets: BrandAsset[]; templates: Record<string, unknown>[]; guidelines: Record<string, unknown>[]; activity: Record<string, unknown>[];
};

export async function loadBrandDetail(sb: SupabaseClient, id: string): Promise<BrandDetail | null> {
  const board = await loadBrandBoard(sb, { tab: "kits", sort: "name", view: "grid" });
  const base = board.brands.find((b) => b.id === id);
  if (!base) return null;
  const [brandRes, colorRes, typeRes, templateRes, guideRes, activityRes] = await Promise.all([
    sb.from("brand_profiles").select("*").eq("id", id).maybeSingle(),
    sb.from("brand_colors").select("*").eq("brand_profile_id", id).eq("is_archived", false).order("display_order"),
    sb.from("brand_typography").select("*").eq("brand_profile_id", id).eq("is_archived", false).order("display_order"),
    sb.from("brand_templates").select("*").eq("brand_profile_id", id).neq("status", "archived").order("updated_at", { ascending: false }),
    sb.from("brand_guidelines").select("*").eq("brand_profile_id", id).order("display_order"),
    sb.from("brand_activity").select("*").eq("brand_profile_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!brandRes.data) return null;
  const r = brandRes.data as Record<string, unknown>;
  return {
    ...base, ownership: text(r.ownership) ?? "internal", longDescription: text(r.long_description), mission: text(r.mission), vision: text(r.vision),
    coreMessage: text(r.core_message), idealCustomer: text(r.ideal_customer), coreServices: strings(r.core_services), differentiators: strings(r.differentiators),
    secondaryCta: text(r.secondary_cta), toneGuidance: text(r.tone_guidance), preferredPhrases: strings(r.preferred_phrases), prohibitedPhrases: strings(r.prohibited_phrases),
    colorsDetailed: ((colorRes.data ?? []) as Record<string, unknown>[]).map((c) => ({ id: String(c.id), name: String(c.name), hex: String(c.hex), role: String(c.role), usageNotes: text(c.usage_notes) })),
    typography: ((typeRes.data ?? []) as Record<string, unknown>[]).map((t) => ({ id: String(t.id), fontName: String(t.font_name), weight: text(t.weight), style: text(t.style), role: String(t.role), fallback: text(t.fallback_stack), usageNotes: text(t.usage_notes) })),
    assets: board.assets.filter((a) => a.brandId === id), templates: templateRes.data ?? [], guidelines: guideRes.data ?? [], activity: activityRes.data ?? [],
  };
}
