export const SOCIAL_PLATFORMS = [
  "facebook", "instagram", "linkedin", "google_business", "tiktok", "youtube",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  google_business: "Google Business",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export type SocialFilters = {
  tab: "queue" | "calendar" | "analytics" | "engagement" | "media" | "automations";
  q?: string;
  client?: string;
  platform?: string;
  status?: string;
  approval?: string;
  assigned?: string;
  from?: string;
  to?: string;
  post?: string;
  view: "table" | "grid";
};

export type SocialClient = { id: string; name: string };

export type SocialAccountRow = {
  id: string;
  customerId: string | null;
  clientName: string;
  platform: SocialPlatform;
  displayName: string;
  handle: string | null;
  status: "connected" | "expired" | "disconnected" | "error";
  connected: boolean;
  postingEnabled: boolean;
  engagementEnabled: boolean;
  analyticsEnabled: boolean;
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  statsUpdatedAt: string | null;
  followers: number | null;
  reach: number | null;
  engagements: number | null;
  clicks: number | null;
  connectionError: string | null;
};

export type SocialPostRow = {
  id: string;
  customerId: string | null;
  clientName: string;
  title: string;
  body: string;
  platforms: SocialPlatform[];
  status: string;
  approvalStatus: string;
  approvalType: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  timezone: string;
  assignedTo: string | null;
  mediaUrl: string | null;
  mediaAssetId: string | null;
  mediaType: string;
  campaign: string | null;
  error: string | null;
  externalUrl: string | null;
  createdAt: string;
  metrics: { reach: number | null; engagements: number | null; clicks: number | null };
};

export type ServiceUsage = {
  customerId: string;
  clientName: string;
  assignmentId: string;
  postsUsed: number;
  postLimit: number | null;
  videoUsed: number;
  videoLimit: number | null;
  platformsUsed: number;
  platformLimit: number | null;
  manager: string | null;
};

export type SocialBoard = {
  clients: SocialClient[];
  accounts: SocialAccountRow[];
  posts: SocialPostRow[];
  scheduledPreview: SocialPostRow[];
  attentions: Array<{ id: string; href: string; client: string; detail: string; severity: "error" | "warning" | "info" }>;
  platformSummary: Array<{ platform: SocialPlatform; accounts: number; connected: number; lastSync: string | null; errors: number }>;
  kpis: {
    connectedAccounts: number;
    scheduledPosts: number;
    waitingApproval: number;
    publishedThisMonth: number;
    engagementRate: number | null;
    accountsNeedingAttention: number;
  };
  performance: { reach: number | null; engagements: number | null; clicks: number | null; followersGained: number | null };
  topPost: SocialPostRow | null;
  serviceUsage: ServiceUsage[];
  assets: Array<{ id: string; title: string; type: string; path: string; customerId: string | null; createdAt: string }>;
  engagement: Array<{ id: string; client: string; platform: string; type: string; author: string; body: string; occurredAt: string; needsReply: boolean; unread: boolean; assignedTo: string | null }>;
  automations: Array<{ id: string; customerId: string | null; key: string; enabled: boolean }>;
  activity: Array<{ id: string; type: string; client: string; detail: string | null; actor: string | null; at: string }>;
};
