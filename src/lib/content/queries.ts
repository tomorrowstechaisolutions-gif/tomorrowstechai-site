import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { lastNDays } from "@/lib/dashboard/period";
import { listBrands, type BrandProfile } from "./brand";
import { PLATFORM_LABELS, STATUS_LABELS, TYPE_LABELS, type ContentType, type Platform } from "./formats";

/**
 * Everything the Content Studio shows.
 *
 * The honest line here runs between what we WROTE and what a platform DID
 * with it. Counts, statuses, the queue, the calendar and campaign grouping
 * are all ours and are true. Engagement, reach and CTR belong to the
 * platforms, and social_accounts.connected is the only thing allowed to say
 * they are reachable — no account is connected today, so those render as
 * not connected rather than zero.
 */

export type ContentRow = {
  id: string;
  title: string;
  body: string | null;
  contentType: ContentType;
  typeLabel: string;
  platform: Platform | null;
  platformLabel: string | null;
  status: string;
  statusLabel: string;
  campaign: string | null;
  service: string | null;
  goal: string | null;
  hashtags: string[];
  cta: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  aiGenerated: boolean;
  sourceContentId: string | null;
  owner: string | null;
  updatedAt: string;
  brand: { id: string; name: string } | null;
  assetCount: number;
};

export type CampaignRollup = {
  name: string;
  total: number;
  scheduled: number;
  published: number;
  needsReview: number;
  leads: number;
};

export type ActivityRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  at: string;
  actor: string | null;
};

export type AssetRow = {
  id: string;
  title: string;
  assetType: string;
  storagePath: string;
  mimeType: string | null;
  fileSize: number | null;
  tags: string[];
  campaign: string | null;
  createdAt: string;
};

export type ContentFilters = {
  q?: string;
  tab: "all" | "draft" | "needs_review" | "approved" | "scheduled";
  brand?: string;
  platform?: string;
  type?: string;
  campaign?: string;
  ai?: boolean;
};

export type ContentBoard = {
  brands: BrandProfile[];
  activeBrand: BrandProfile | null;

  kpis: {
    total: number;
    scheduledThisWeek: number;
    publishedThisMonth: number;
    contentLeads: number | null;
    activeCampaigns: number;
    needsReview: number;
  };

  tabCounts: Record<ContentFilters["tab"], number>;
  queue: ContentRow[];
  calendar: ContentRow[];
  campaigns: CampaignRollup[];
  assets: AssetRow[];
  assetCount: number;
  activity: ActivityRow[];
  repurposeSources: ContentRow[];

  /** Only true when a social_accounts row actually says connected. */
  social: { connected: boolean; connectedCount: number; totalAccounts: number };
  campaignNames: string[];
};

const CONTENT_SELECT =
  "id, title, body, content_type, platform, status, campaign, service, goal, hashtags, cta, scheduled_at, published_at, ai_generated, source_content_id, owner, updated_at, brand_profile_id, brand_profiles(id, name)";

type ContentRaw = {
  id: string;
  title: string;
  body: string | null;
  content_type: ContentType;
  platform: Platform | null;
  status: string;
  campaign: string | null;
  service: string | null;
  goal: string | null;
  hashtags: string[] | null;
  cta: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  ai_generated: boolean;
  source_content_id: string | null;
  owner: string | null;
  updated_at: string;
  brand_profile_id: string;
  brand_profiles: { id: string; name: string } | { id: string; name: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function shape(r: ContentRaw, assetCounts: Map<string, number>): ContentRow {
  const brand = one<{ id: string; name: string }>(r.brand_profiles);
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    contentType: r.content_type,
    typeLabel: TYPE_LABELS[r.content_type] ?? r.content_type,
    platform: r.platform,
    platformLabel: r.platform ? (PLATFORM_LABELS[r.platform] ?? r.platform) : null,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    campaign: r.campaign,
    service: r.service,
    goal: r.goal,
    hashtags: r.hashtags ?? [],
    cta: r.cta,
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
    aiGenerated: r.ai_generated,
    sourceContentId: r.source_content_id,
    owner: r.owner,
    updatedAt: r.updated_at,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    assetCount: assetCounts.get(r.id) ?? 0,
  };
}

export async function loadContentBoard(
  sb: SupabaseClient,
  filters: ContentFilters
): Promise<ContentBoard> {
  const month = lastNDays(30);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const now = new Date().toISOString();

  const [brands, items, assetLinks, assets, socialAccounts, leads] = await Promise.all([
    listBrands(sb),
    sb
      .from("content_items")
      .select(CONTENT_SELECT)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(500)
      .then((r) => unwrap(r, "content")),
    sb.from("content_asset_links").select("content_id").then((r) => (r.error ? [] : (r.data ?? []))),
    sb
      .from("content_assets")
      .select("id, title, asset_type, storage_path, mime_type, file_size, tags, campaign, created_at")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(24)
      .then((r) => unwrap(r, "assets")),
    sb
      .from("social_accounts")
      .select("id, platform, connected, status")
      .then((r) => unwrap(r, "social accounts")),
    // Leads carrying a campaign, so campaign rollups can show what content
    // actually produced rather than only what we published.
    sb
      .from("leads")
      .select("id, campaign, utm_campaign, created_at")
      .gte("created_at", month.fromIso)
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  const assetCounts = new Map<string, number>();
  for (const l of assetLinks as { content_id: string }[]) {
    assetCounts.set(l.content_id, (assetCounts.get(l.content_id) ?? 0) + 1);
  }

  const all = (items as ContentRaw[]).map((r) => shape(r, assetCounts));

  const brandFiltered = filters.brand ? all.filter((c) => c.brand?.id === filters.brand) : all;

  // ── KPIs ───────────────────────────────────────────────────────────
  const scheduledThisWeek = brandFiltered.filter(
    (c) => c.scheduledAt && c.scheduledAt >= now && c.scheduledAt <= weekAhead
  ).length;
  const publishedThisMonth = brandFiltered.filter(
    (c) => c.publishedAt && c.publishedAt >= month.fromIso
  ).length;
  const needsReview = brandFiltered.filter((c) => c.status === "needs_review").length;

  const campaignNames = [
    ...new Set(brandFiltered.map((c) => c.campaign).filter((c): c is string => Boolean(c))),
  ].sort();

  // Leads whose campaign matches a campaign we have content for. Real, and
  // the closest honest thing to "content leads" without analytics.
  type LeadRow = { campaign: string | null; utm_campaign: string | null };
  const leadRows = leads as LeadRow[];
  const contentLeads =
    campaignNames.length === 0
      ? null
      : leadRows.filter((l) =>
          campaignNames.some(
            (name) => l.campaign === name || l.utm_campaign === name
          )
        ).length;

  const campaigns: CampaignRollup[] = campaignNames
    .map((name) => {
      const inCampaign = brandFiltered.filter((c) => c.campaign === name);
      return {
        name,
        total: inCampaign.length,
        scheduled: inCampaign.filter((c) => c.status === "scheduled").length,
        published: inCampaign.filter((c) => c.status === "published").length,
        needsReview: inCampaign.filter((c) => c.status === "needs_review").length,
        leads: leadRows.filter((l) => l.campaign === name || l.utm_campaign === name).length,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // ── Tabs and filters ───────────────────────────────────────────────
  const tabCounts: Record<ContentFilters["tab"], number> = {
    all: brandFiltered.length,
    draft: brandFiltered.filter((c) => c.status === "draft").length,
    needs_review: needsReview,
    approved: brandFiltered.filter((c) => c.status === "approved").length,
    scheduled: brandFiltered.filter((c) => c.status === "scheduled").length,
  };

  const needle = filters.q?.toLowerCase().trim();

  const queue = brandFiltered.filter((c) => {
    if (filters.tab !== "all" && c.status !== filters.tab) return false;
    if (needle) {
      const hay = `${c.title} ${c.body ?? ""} ${c.campaign ?? ""} ${c.service ?? ""} ${c.hashtags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.platform && c.platform !== filters.platform) return false;
    if (filters.type && c.contentType !== filters.type) return false;
    if (filters.campaign && c.campaign !== filters.campaign) return false;
    if (filters.ai && !c.aiGenerated) return false;
    return true;
  });

  // ── Calendar: what is actually dated, soonest first ────────────────
  const calendar = brandFiltered
    .filter((c) => c.scheduledAt)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
    .slice(0, 8);

  // ── Repurpose: things substantial enough to be worth reworking ─────
  const repurposeSources = brandFiltered
    .filter(
      (c) =>
        ["blog", "email", "landing_copy", "video_concept"].includes(c.contentType) ||
        (c.body?.length ?? 0) > 500
    )
    .slice(0, 6);

  // ── Activity: derived from the content itself ──────────────────────
  // No separate activity table — every event here is a fact already recorded
  // on the row that changed, so this cannot drift out of sync with reality.
  const activity: ActivityRow[] = brandFiltered
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      kind: c.status,
      title:
        c.status === "published"
          ? `Published: ${c.title}`
          : c.status === "scheduled"
            ? `Scheduled: ${c.title}`
            : c.status === "approved"
              ? `Approved: ${c.title}`
              : c.status === "needs_review"
                ? `Sent for review: ${c.title}`
                : c.aiGenerated
                  ? `AI draft created: ${c.title}`
                  : `Draft saved: ${c.title}`,
      detail: [c.platformLabel, c.campaign].filter(Boolean).join(" · ") || null,
      at: c.updatedAt,
      actor: c.aiGenerated ? "AI" : c.owner,
    }));

  type AssetRaw = {
    id: string; title: string; asset_type: string; storage_path: string;
    mime_type: string | null; file_size: number | null; tags: string[] | null;
    campaign: string | null; created_at: string;
  };
  const assetRows: AssetRow[] = (assets as AssetRaw[]).map((a) => ({
    id: a.id,
    title: a.title,
    assetType: a.asset_type,
    storagePath: a.storage_path,
    mimeType: a.mime_type,
    fileSize: a.file_size,
    tags: a.tags ?? [],
    campaign: a.campaign,
    createdAt: a.created_at,
  }));

  const accounts = socialAccounts as { connected: boolean; status: string }[];
  const connectedCount = accounts.filter((a) => a.connected && a.status === "connected").length;

  const activeBrand = filters.brand
    ? (brands.find((b) => b.id === filters.brand) ?? null)
    : (brands.find((b) => b.isDefault) ?? brands[0] ?? null);

  return {
    brands,
    activeBrand,
    kpis: {
      total: brandFiltered.length,
      scheduledThisWeek,
      publishedThisMonth,
      contentLeads,
      activeCampaigns: campaigns.length,
      needsReview,
    },
    tabCounts,
    queue: queue.slice(0, 40),
    calendar,
    campaigns,
    assets: assetRows,
    assetCount: assetRows.length,
    activity,
    repurposeSources,
    social: {
      connected: connectedCount > 0,
      connectedCount,
      totalAccounts: accounts.length,
    },
    campaignNames,
  };
}
