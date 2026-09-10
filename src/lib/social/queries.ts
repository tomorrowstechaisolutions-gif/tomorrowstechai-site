import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialAccountRow, type SocialBoard, type SocialFilters, type SocialPlatform, type SocialPostRow } from "./types";

const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? (value[0] ?? null) : value;
const clientName = (value: { business_name: string | null; name: string | null } | { business_name: string | null; name: string | null }[] | null) => {
  const client = one(value);
  return client?.business_name || client?.name || "Tomorrow's Tech AI";
};
const sumKnown = (values: Array<number | null | undefined>) => {
  const known = values.filter((v): v is number => typeof v === "number");
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};

export async function loadSocialCenter(sb: SupabaseClient, filters: SocialFilters): Promise<SocialBoard> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const next30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  const [accountsResult, postsResult, platformResult, metricsResult, clientsResult, assignmentsResult, inclusionsResult, assetsResult, engagementResult, automationsResult, activityResult] = await Promise.all([
    sb.from("social_accounts").select("id, customer_id, platform, handle, display_name, connected, status, posting_enabled, engagement_enabled, analytics_enabled, token_expires_at, last_synced_at, stats_updated_at, followers, reach_30d, engagement_30d, clicks_30d, connection_error, customers(business_name,name)").order("updated_at", { ascending: false }),
    sb.from("social_posts").select("id, customer_id, account_id, platform, title, body, media_url, scheduled_at, published_at, status, external_url, campaign, error, approval_status, approval_type, timezone, assigned_to, media_asset_id, media_type, created_at, customers(business_name,name), social_post_platforms(platform), social_analytics_snapshots(reach,engagements,clicks,captured_for)").is("deleted_at", null).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(500),
    sb.from("social_post_platforms").select("post_id, platform"),
    sb.from("social_analytics_snapshots").select("post_id, reach, engagements, clicks, followers_gained, captured_for").gte("captured_for", monthStart.slice(0, 10)),
    sb.from("customers").select("id, business_name, name").order("business_name"),
    sb.from("client_services").select("id, customer_id, service_id, status, assigned_manager, customers(business_name,name), catalog_items(name)").eq("status", "active"),
    sb.from("service_inclusions").select("service_id, name, quantity, is_included").eq("is_included", true),
    sb.from("content_assets").select("id, title, asset_type, storage_path, customer_id, created_at").eq("is_archived", false).eq("approval_status", "approved").order("created_at", { ascending: false }).limit(40),
    sb.from("social_engagement_items").select("id, customer_id, platform, item_type, author_name, body, occurred_at, needs_reply, unread, assigned_to, customers(business_name,name)").is("resolved_at", null).order("occurred_at", { ascending: false }).limit(50),
    sb.from("social_automation_settings").select("id, customer_id, automation_key, enabled").order("automation_key"),
    sb.from("social_activity_events").select("id, event_type, detail, actor, created_at, customers(business_name,name)").order("created_at", { ascending: false }).limit(20),
  ]);

  const firstError = [accountsResult, postsResult, platformResult, metricsResult, clientsResult, assignmentsResult, inclusionsResult, assetsResult, engagementResult, automationsResult, activityResult].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  type AccountRaw = NonNullable<typeof accountsResult.data>[number];
  const accounts: SocialAccountRow[] = (accountsResult.data ?? []).map((row: AccountRaw) => ({
    id: row.id,
    customerId: row.customer_id,
    clientName: clientName(row.customers),
    platform: row.platform as SocialPlatform,
    displayName: row.display_name || row.handle || PLATFORM_LABELS[row.platform as SocialPlatform],
    handle: row.handle,
    status: row.status as SocialAccountRow["status"],
    connected: row.connected,
    postingEnabled: row.posting_enabled,
    engagementEnabled: row.engagement_enabled,
    analyticsEnabled: row.analytics_enabled,
    tokenExpiresAt: row.token_expires_at,
    lastSyncedAt: row.last_synced_at,
    statsUpdatedAt: row.stats_updated_at,
    followers: row.followers,
    reach: row.reach_30d,
    engagements: row.engagement_30d,
    clicks: row.clicks_30d,
    connectionError: row.connection_error,
  }));

  const platformByPost = new Map<string, SocialPlatform[]>();
  for (const row of platformResult.data ?? []) {
    const list = platformByPost.get(row.post_id) ?? [];
    if (!list.includes(row.platform as SocialPlatform)) list.push(row.platform as SocialPlatform);
    platformByPost.set(row.post_id, list);
  }
  const metricByPost = new Map<string, { reach: number | null; engagements: number | null; clicks: number | null }>();
  for (const row of metricsResult.data ?? []) {
    if (!row.post_id) continue;
    const current = metricByPost.get(row.post_id) ?? { reach: null, engagements: null, clicks: null };
    metricByPost.set(row.post_id, {
      reach: sumKnown([current.reach, row.reach]),
      engagements: sumKnown([current.engagements, row.engagements]),
      clicks: sumKnown([current.clicks, row.clicks]),
    });
  }

  type PostRaw = NonNullable<typeof postsResult.data>[number];
  const allPosts: SocialPostRow[] = (postsResult.data ?? []).map((row: PostRaw) => ({
    id: row.id,
    customerId: row.customer_id,
    clientName: clientName(row.customers),
    title: row.title || row.body.slice(0, 54) || "Untitled post",
    body: row.body,
    platforms: platformByPost.get(row.id) ?? [row.platform as SocialPlatform],
    status: row.status,
    approvalStatus: row.approval_status,
    approvalType: row.approval_type,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    timezone: row.timezone,
    assignedTo: row.assigned_to,
    mediaUrl: row.media_url,
    mediaAssetId: row.media_asset_id,
    mediaType: row.media_type,
    campaign: row.campaign,
    error: row.error,
    externalUrl: row.external_url,
    createdAt: row.created_at,
    metrics: metricByPost.get(row.id) ?? { reach: null, engagements: null, clicks: null },
  }));

  const needle = filters.q?.toLowerCase();
  const posts = allPosts.filter((post) => {
    if (needle && !`${post.title} ${post.body} ${post.clientName} ${post.campaign ?? ""}`.toLowerCase().includes(needle)) return false;
    if (filters.client && post.customerId !== filters.client) return false;
    if (filters.platform && !post.platforms.includes(filters.platform as SocialPlatform)) return false;
    if (filters.status && post.status !== filters.status) return false;
    if (filters.approval && post.approvalStatus !== filters.approval) return false;
    if (filters.assigned && post.assignedTo !== filters.assigned) return false;
    const effectiveDate = post.scheduledAt || post.publishedAt || post.createdAt;
    if (filters.from && effectiveDate < `${filters.from}T00:00:00`) return false;
    if (filters.to && effectiveDate > `${filters.to}T23:59:59.999`) return false;
    return true;
  });

  const scheduled = allPosts.filter((post) => post.status === "scheduled" && post.scheduledAt && post.scheduledAt >= now.toISOString() && post.scheduledAt <= next30).length;
  const waiting = allPosts.filter((post) => post.approvalStatus === "waiting").length;
  const published = allPosts.filter((post) => post.status === "published" && post.publishedAt && post.publishedAt >= monthStart).length;
  const connected = accounts.filter((account) => account.connected && account.status === "connected");
  const aggregateReach = sumKnown(connected.map((account) => account.reach));
  const aggregateEngagements = sumKnown(connected.map((account) => account.engagements));
  const engagementRate = aggregateReach && aggregateEngagements !== null ? aggregateEngagements / aggregateReach * 100 : null;

  const attentions: SocialBoard["attentions"] = [];
  for (const account of accounts) {
    if (account.status !== "connected" || !account.connected) attentions.push({ id: `account-${account.id}`, href: `?tab=queue&client=${account.customerId ?? ""}`, client: account.clientName, detail: `${PLATFORM_LABELS[account.platform]} ${account.status}${account.connectionError ? ` — ${account.connectionError}` : ""}`, severity: "error" });
    else if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < now.getTime() + 7 * 86_400_000) attentions.push({ id: `expires-${account.id}`, href: `?tab=queue&client=${account.customerId ?? ""}`, client: account.clientName, detail: `${PLATFORM_LABELS[account.platform]} credentials expire soon`, severity: "warning" });
  }
  for (const post of allPosts.filter((item) => item.status === "failed")) attentions.push({ id: `post-${post.id}`, href: `?tab=queue&status=failed`, client: post.clientName, detail: post.error || "A post failed to publish", severity: "error" });
  const waitingByClient = new Map<string, { name: string; count: number }>();
  for (const post of allPosts.filter((item) => item.approvalStatus === "waiting")) {
    const key = post.customerId ?? "internal";
    const value = waitingByClient.get(key) ?? { name: post.clientName, count: 0 };
    value.count += 1;
    waitingByClient.set(key, value);
  }
  for (const [id, value] of waitingByClient) attentions.push({ id: `approval-${id}`, href: `?tab=queue&approval=waiting&client=${id === "internal" ? "" : id}`, client: value.name, detail: `${value.count} post${value.count === 1 ? "" : "s"} waiting approval`, severity: "warning" });

  const platformSummary = SOCIAL_PLATFORMS.map((platform) => {
    const rows = accounts.filter((account) => account.platform === platform);
    return { platform, accounts: rows.length, connected: rows.filter((account) => account.connected && account.status === "connected").length, lastSync: rows.map((account) => account.lastSyncedAt || account.statsUpdatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null, errors: rows.filter((account) => account.status !== "connected").length };
  });

  const serviceName = (value: { name: string } | { name: string }[] | null) => one(value)?.name ?? "";
  const inclusionByService = new Map<string, Array<{ name: string; quantity: number | null }>>();
  for (const inclusion of inclusionsResult.data ?? []) {
    const list = inclusionByService.get(inclusion.service_id) ?? [];
    list.push({ name: inclusion.name, quantity: inclusion.quantity === null ? null : Number(inclusion.quantity) });
    inclusionByService.set(inclusion.service_id, list);
  }
  const serviceUsage = (assignmentsResult.data ?? []).filter((row) => /social management/i.test(serviceName(row.catalog_items))).map((row) => {
    const inclusions = inclusionByService.get(row.service_id) ?? [];
    const quantityFor = (pattern: RegExp) => inclusions.find((item) => pattern.test(item.name))?.quantity ?? null;
    const clientPosts = allPosts.filter((post) => post.customerId === row.customer_id && (post.scheduledAt || post.publishedAt || post.createdAt) >= monthStart);
    return { customerId: row.customer_id, clientName: clientName(row.customers), assignmentId: row.id, postsUsed: clientPosts.length, postLimit: quantityFor(/social posts?/i), videoUsed: clientPosts.filter((post) => post.mediaType === "video").length, videoLimit: quantityFor(/video|reel/i), platformsUsed: new Set(accounts.filter((account) => account.customerId === row.customer_id).map((account) => account.platform)).size, platformLimit: quantityFor(/platform/i), manager: row.assigned_manager };
  });

  const scored = allPosts.filter((post) => post.status === "published" && post.metrics.engagements !== null).sort((a, b) => (b.metrics.engagements ?? -1) - (a.metrics.engagements ?? -1));
  const engagement = (engagementResult.data ?? []).map((row) => ({ id: row.id, client: clientName(row.customers), platform: row.platform, type: row.item_type, author: row.author_name || "Unknown", body: row.body || "", occurredAt: row.occurred_at, needsReply: row.needs_reply, unread: row.unread, assignedTo: row.assigned_to }));
  const accountAttentionCount = new Set(attentions.filter((item) => item.id.startsWith("account-") || item.id.startsWith("expires-")).map((item) => item.id.replace(/^(account|expires)-/, ""))).size;

  return {
    clients: (clientsResult.data ?? []).map((row) => ({ id: row.id, name: row.business_name || row.name || "Unnamed client" })),
    accounts,
    posts: posts.slice(0, 100),
    scheduledPreview: allPosts.filter((post) => post.status === "scheduled" && post.scheduledAt && post.scheduledAt >= now.toISOString()).slice(0, 8),
    attentions: attentions.slice(0, 12),
    platformSummary,
    kpis: { connectedAccounts: connected.length, scheduledPosts: scheduled, waitingApproval: waiting, publishedThisMonth: published, engagementRate, accountsNeedingAttention: accountAttentionCount },
    performance: { reach: aggregateReach, engagements: aggregateEngagements, clicks: sumKnown(connected.map((account) => account.clicks)), followersGained: sumKnown((metricsResult.data ?? []).map((row) => row.followers_gained)) },
    topPost: scored[0] ?? null,
    serviceUsage,
    assets: (assetsResult.data ?? []).map((row) => ({ id: row.id, title: row.title, type: row.asset_type, path: row.storage_path, customerId: row.customer_id, createdAt: row.created_at })),
    engagement,
    automations: (automationsResult.data ?? []).map((row) => ({ id: row.id, customerId: row.customer_id, key: row.automation_key, enabled: row.enabled })),
    activity: (activityResult.data ?? []).map((row) => ({ id: row.id, type: row.event_type, client: clientName(row.customers), detail: row.detail, actor: row.actor, at: row.created_at })),
  };
}
