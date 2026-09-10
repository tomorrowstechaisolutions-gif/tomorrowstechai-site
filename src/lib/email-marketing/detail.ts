import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/dashboard/panel";
import { describeFilters, sanitizeFilters } from "./audience";
import { preSendChecks, type PreSendIssue } from "./render";
import { loadSendingHealth } from "./health";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  rate,
  type ApprovalMode,
  type ApprovalStatus,
  type AudienceType,
  type CampaignStatus,
  type CampaignType,
  type EmailBlock,
  type EmailTone,
  type EnrollmentTrigger,
  type RecipientStatus,
  type SequenceStatus,
  type SkipReason,
  type TemplateCategory,
} from "./types";

/**
 * One campaign, and everything its detail screen needs.
 *
 * The recipient list is DELIBERATELY NOT loaded in full. §29 asks for
 * recipient activity and §47 forbids loading every recipient — both are
 * satisfied by loading a bounded, most-recent page of them and letting the
 * aggregate view supply the totals. A campaign to 18,000 people must not
 * make its own detail page unopenable.
 */

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export type CampaignStats = {
  targeted: number; skipped: number; sent: number; delivered: number;
  bounced: number; complained: number; failed: number; pending: number;
  uniqueOpens: number; totalOpens: number;
  uniqueClicks: number; totalClicks: number; unsubscribes: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  clickToOpenRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
  complaintRate: number | null;
};

export type CampaignDetail = {
  id: string;
  name: string;
  internalName: string | null;
  slug: string;
  description: string | null;
  campaignType: CampaignType;
  campaignTypeLabel: string;
  status: CampaignStatus;
  statusLabel: string;

  subject: string | null;
  previewText: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  blocks: EmailBlock[];
  tone: EmailTone;

  client: { id: string; name: string } | null;
  audience: {
    id: string; name: string; audienceType: AudienceType;
    description: string; cachedSize: number | null; cachedAt: string | null;
  } | null;
  templateId: string | null;
  brandProfileId: string | null;
  sendingDomainId: string | null;
  contentItemId: string | null;
  serviceId: string | null;
  jobId: string | null;

  owner: string | null;
  createdBy: string | null;

  approvalMode: ApprovalMode;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;

  scheduledAt: string | null;
  timezone: string;
  sentAt: string | null;
  failureReason: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;

  stats: CampaignStats;
  /** Attributed invoices — real billing rows, never an invented number. */
  conversions: { count: number; revenueCents: number | null };

  /** A bounded page of recipients, most recently active first. */
  recipients: {
    id: string;
    email: string;
    name: string | null;
    status: RecipientStatus;
    skipReason: SkipReason | null;
    sentAt: string | null;
    openCount: number;
    clickCount: number;
    firstOpenedAt: string | null;
    bounceType: string | null;
    leadId: string | null;
    customerId: string | null;
  }[];
  recipientSample: number;

  /** Where the clicks went. */
  topLinks: { url: string; clicks: number }[];
  /** Opens and clicks per day since the send. */
  timeline: { label: string; opens: number; clicks: number }[];

  events: { id: string; kind: string; body: string; actor: string | null; createdAt: string }[];

  /** Everything standing between this campaign and a send. */
  issues: PreSendIssue[];
  canSendNow: boolean;
};

const CAMPAIGN_SELECT =
  "id, name, internal_name, slug, description, campaign_type, status, subject, preview_text, from_name, from_email, reply_to, blocks, tone, customer_id, audience_id, template_id, brand_profile_id, sending_domain_id, content_item_id, service_id, job_id, owner, created_by, approval_mode, approval_status, approved_by, approved_at, approval_notes, scheduled_at, timezone, sent_at, failure_reason, is_archived, created_at, updated_at, customers(id, name, business_name), email_audiences(id, name, audience_type, filters, cached_size, cached_at)";

export async function loadCampaignDetail(
  sb: SupabaseClient,
  id: string
): Promise<CampaignDetail | null> {
  const { data: raw, error } = await sb
    .from("email_campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`campaign: ${error.message}`);
  if (!raw) return null;

  const campaign = raw as Record<string, unknown>;

  const [statsRow, recipients, events, clickEvents, engagementEvents, invoices, health] =
    await Promise.all([
      sb.from("email_campaign_stats").select("*").eq("campaign_id", id).maybeSingle(),
      sb
        .from("email_campaign_recipients")
        .select(
          "id, email, first_name, last_name, status, skip_reason, sent_at, open_count, click_count, first_opened_at, bounce_type, lead_id, customer_id"
        )
        .eq("campaign_id", id)
        .order("last_opened_at", { ascending: false, nullsFirst: false })
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(100)
        .then((r) => unwrap<Record<string, unknown>[]>(r, "recipients")),
      sb
        .from("email_campaign_events")
        .select("id, kind, body, actor, created_at")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(30)
        .then((r) => unwrap<{ id: string; kind: string; body: string; actor: string | null; created_at: string }[]>(r, "campaign events")),
      sb
        .from("email_events")
        .select("url")
        .eq("campaign_id", id)
        .eq("event_type", "clicked")
        .not("url", "is", null)
        .limit(5000)
        .then((r) => unwrap<{ url: string }[]>(r, "click events")),
      sb
        .from("email_events")
        .select("event_type, occurred_at")
        .eq("campaign_id", id)
        .in("event_type", ["opened", "clicked"])
        .order("occurred_at", { ascending: true })
        .limit(5000)
        .then((r) => unwrap<{ event_type: string; occurred_at: string }[]>(r, "engagement events")),
      sb
        .from("invoices")
        .select("amount_paid_cents, status")
        .eq("email_campaign_id", id)
        .then((r) => unwrap<{ amount_paid_cents: number | null; status: string }[]>(r, "attributed invoices")),
      loadSendingHealth(sb),
    ]);

  const s = (statsRow.data ?? {}) as Record<string, number | null>;
  const n = (key: string): number => Number(s[key] ?? 0);

  const sent = n("sent");
  const delivered = n("delivered");
  const uniqueOpens = n("unique_opens");
  const uniqueClicks = n("unique_clicks");

  const stats: CampaignStats = {
    targeted: n("targeted"), skipped: n("skipped"), sent, delivered,
    bounced: n("bounced"), complained: n("complained"),
    failed: n("failed"), pending: n("pending"),
    uniqueOpens, totalOpens: n("total_opens"),
    uniqueClicks, totalClicks: n("total_clicks"),
    unsubscribes: n("unsubscribes"),
    deliveryRate: rate(delivered, sent),
    openRate: rate(uniqueOpens, delivered),
    clickRate: rate(uniqueClicks, delivered),
    // Of the people who opened it, how many clicked — the number that says
    // whether the CONTENT worked, as opposed to the subject line.
    clickToOpenRate: rate(uniqueClicks, uniqueOpens),
    bounceRate: rate(n("bounced"), sent),
    unsubscribeRate: rate(n("unsubscribes"), delivered),
    complaintRate: rate(n("complained"), delivered),
  };

  // ── Top clicked links ──────────────────────────────────────────────
  const byUrl = new Map<string, number>();
  for (const event of clickEvents) {
    byUrl.set(event.url, (byUrl.get(event.url) ?? 0) + 1);
  }
  const topLinks = [...byUrl.entries()]
    .map(([url, clicks]) => ({ url, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // ── Opens and clicks over time ─────────────────────────────────────
  const byDay = new Map<string, { opens: number; clicks: number }>();
  for (const event of engagementEvents) {
    const day = event.occurred_at.slice(0, 10);
    const held = byDay.get(day) ?? { opens: 0, clicks: 0 };
    if (event.event_type === "opened") held.opens += 1;
    else held.clicks += 1;
    byDay.set(day, held);
  }
  const timeline = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([day, counts]) => ({
      label: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      opens: counts.opens,
      clicks: counts.clicks,
    }));

  // ── Conversions ────────────────────────────────────────────────────
  // Attributed invoices only. If none are linked the count is 0 and the
  // revenue is NULL — "nothing attributed" is not "nothing earned", and the
  // screen prints a dash for the second.
  const paid = invoices.filter((i) => (i.amount_paid_cents ?? 0) > 0);
  const conversions = {
    count: invoices.length,
    revenueCents: paid.length > 0 ? paid.reduce((sum, i) => sum + (i.amount_paid_cents ?? 0), 0) : null,
  };

  const audienceRaw = one<Record<string, unknown>>(campaign.email_audiences as never);
  const customer = one<{ id: string; name: string | null; business_name: string | null }>(
    campaign.customers as never
  );

  const approvalMode = campaign.approval_mode as ApprovalMode;
  const approvalStatus = campaign.approval_status as ApprovalStatus;

  const issues = preSendChecks({
    subject: (campaign.subject as string | null) ?? null,
    previewText: (campaign.preview_text as string | null) ?? null,
    fromEmail: (campaign.from_email as string | null) ?? health.fromEmail,
    fromName: (campaign.from_name as string | null) ?? null,
    blocks: ((campaign.blocks as EmailBlock[]) ?? []),
    audienceSize: audienceRaw ? ((audienceRaw.cached_size as number | null) ?? 0) : null,
    domainAuthenticated: health.authenticated,
    approvalSatisfied: approvalMode === "none" || approvalStatus === "approved",
  });

  return {
    id: campaign.id as string,
    name: campaign.name as string,
    internalName: (campaign.internal_name as string | null) ?? null,
    slug: campaign.slug as string,
    description: (campaign.description as string | null) ?? null,
    campaignType: campaign.campaign_type as CampaignType,
    campaignTypeLabel: CAMPAIGN_TYPE_LABELS[campaign.campaign_type as CampaignType],
    status: campaign.status as CampaignStatus,
    statusLabel: CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus],
    subject: (campaign.subject as string | null) ?? null,
    previewText: (campaign.preview_text as string | null) ?? null,
    fromName: (campaign.from_name as string | null) ?? null,
    fromEmail: (campaign.from_email as string | null) ?? null,
    replyTo: (campaign.reply_to as string | null) ?? null,
    blocks: ((campaign.blocks as EmailBlock[]) ?? []),
    tone: (campaign.tone as EmailTone) ?? "default",
    client: customer
      ? { id: customer.id, name: customer.business_name || customer.name || "Client" }
      : null,
    audience: audienceRaw
      ? {
          id: audienceRaw.id as string,
          name: audienceRaw.name as string,
          audienceType: audienceRaw.audience_type as AudienceType,
          description: describeFilters(sanitizeFilters(audienceRaw.filters)),
          cachedSize: (audienceRaw.cached_size as number | null) ?? null,
          cachedAt: (audienceRaw.cached_at as string | null) ?? null,
        }
      : null,
    templateId: (campaign.template_id as string | null) ?? null,
    brandProfileId: (campaign.brand_profile_id as string | null) ?? null,
    sendingDomainId: (campaign.sending_domain_id as string | null) ?? null,
    contentItemId: (campaign.content_item_id as string | null) ?? null,
    serviceId: (campaign.service_id as string | null) ?? null,
    jobId: (campaign.job_id as string | null) ?? null,
    owner: (campaign.owner as string | null) ?? null,
    createdBy: (campaign.created_by as string | null) ?? null,
    approvalMode,
    approvalStatus,
    approvedBy: (campaign.approved_by as string | null) ?? null,
    approvedAt: (campaign.approved_at as string | null) ?? null,
    approvalNotes: (campaign.approval_notes as string | null) ?? null,
    scheduledAt: (campaign.scheduled_at as string | null) ?? null,
    timezone: (campaign.timezone as string) ?? "America/Chicago",
    sentAt: (campaign.sent_at as string | null) ?? null,
    failureReason: (campaign.failure_reason as string | null) ?? null,
    isArchived: Boolean(campaign.is_archived),
    createdAt: campaign.created_at as string,
    updatedAt: campaign.updated_at as string,

    stats,
    conversions,
    recipients: recipients.map((r) => {
      const first = (r.first_name as string | null) ?? "";
      const last = (r.last_name as string | null) ?? "";
      const name = [first, last].filter(Boolean).join(" ");
      return {
        id: r.id as string,
        email: r.email as string,
        name: name || null,
        status: r.status as RecipientStatus,
        skipReason: (r.skip_reason as SkipReason | null) ?? null,
        sentAt: (r.sent_at as string | null) ?? null,
        openCount: Number(r.open_count ?? 0),
        clickCount: Number(r.click_count ?? 0),
        firstOpenedAt: (r.first_opened_at as string | null) ?? null,
        bounceType: (r.bounce_type as string | null) ?? null,
        leadId: (r.lead_id as string | null) ?? null,
        customerId: (r.customer_id as string | null) ?? null,
      };
    }),
    recipientSample: recipients.length,
    topLinks,
    timeline,
    events: events.map((e) => ({
      id: e.id, kind: e.kind, body: e.body, actor: e.actor, createdAt: e.created_at,
    })),
    issues,
    canSendNow: !issues.some((i) => i.severity === "error"),
  };
}

/* ── Tab lists ─────────────────────────────────────────────────────── */

export type SequenceRow = {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  clientName: string | null;
  trigger: EnrollmentTrigger;
  steps: number;
  active: number;
  completed: number;
  exited: number;
  owner: string | null;
  updatedAt: string;
};

export async function loadSequences(sb: SupabaseClient): Promise<SequenceRow[]> {
  const [sequences, steps, enrollments] = await Promise.all([
    sb
      .from("email_sequences")
      .select("id, name, description, status, enrollment_trigger, owner, updated_at, is_archived, customers(id, name, business_name)")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .then((r) => unwrap<Record<string, unknown>[]>(r, "sequences")),
    sb.from("email_sequence_steps").select("sequence_id").then((r) => unwrap<{ sequence_id: string }[]>(r, "steps")),
    sb
      .from("email_sequence_enrollments")
      .select("sequence_id, status")
      .then((r) => unwrap<{ sequence_id: string; status: string }[]>(r, "enrollments")),
  ]);

  const stepsBy = new Map<string, number>();
  for (const step of steps) stepsBy.set(step.sequence_id, (stepsBy.get(step.sequence_id) ?? 0) + 1);

  return sequences.map((row) => {
    const id = row.id as string;
    const mine = enrollments.filter((e) => e.sequence_id === id);
    const customer = one<{ id: string; name: string | null; business_name: string | null }>(row.customers as never);
    return {
      id,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      status: row.status as SequenceStatus,
      clientName: customer ? customer.business_name || customer.name || "Client" : null,
      trigger: row.enrollment_trigger as EnrollmentTrigger,
      steps: stepsBy.get(id) ?? 0,
      active: mine.filter((e) => e.status === "active").length,
      completed: mine.filter((e) => e.status === "completed").length,
      exited: mine.filter((e) => e.status === "exited").length,
      owner: (row.owner as string | null) ?? null,
      updatedAt: row.updated_at as string,
    };
  });
}

export type AudienceRow = {
  id: string;
  name: string;
  clientName: string | null;
  audienceType: AudienceType;
  description: string;
  members: number | null;
  cachedSize: number | null;
  cachedAt: string | null;
  suppressed: number | null;
  usedIn: number;
  updatedAt: string;
};

export async function loadAudiences(sb: SupabaseClient): Promise<AudienceRow[]> {
  const [audiences, memberCounts, campaigns] = await Promise.all([
    sb
      .from("email_audiences")
      .select("id, name, audience_type, filters, cached_size, cached_at, updated_at, is_archived, customers(id, name, business_name)")
      .eq("is_archived", false)
      .order("name")
      .then((r) => unwrap<Record<string, unknown>[]>(r, "audiences")),
    sb
      .from("email_audience_members")
      .select("audience_id, subscribed")
      .then((r) => unwrap<{ audience_id: string; subscribed: boolean }[]>(r, "members")),
    sb
      .from("email_campaigns")
      .select("audience_id")
      .not("audience_id", "is", null)
      .then((r) => unwrap<{ audience_id: string }[]>(r, "campaign audiences")),
  ]);

  const membersBy = new Map<string, { total: number; unsubscribed: number }>();
  for (const member of memberCounts) {
    const held = membersBy.get(member.audience_id) ?? { total: 0, unsubscribed: 0 };
    held.total += 1;
    if (!member.subscribed) held.unsubscribed += 1;
    membersBy.set(member.audience_id, held);
  }

  const usedBy = new Map<string, number>();
  for (const c of campaigns) usedBy.set(c.audience_id, (usedBy.get(c.audience_id) ?? 0) + 1);

  return audiences.map((row) => {
    const id = row.id as string;
    const type = row.audience_type as AudienceType;
    const counts = membersBy.get(id);
    const customer = one<{ id: string; name: string | null; business_name: string | null }>(row.customers as never);
    const isList = type === "static_list" || type === "imported_list";
    return {
      id,
      name: row.name as string,
      clientName: customer ? customer.business_name || customer.name || "Client" : null,
      audienceType: type,
      description: describeFilters(sanitizeFilters(row.filters)),
      // A dynamic segment has no members of its own — its size is whatever
      // the CRM says right now, which is why it shows the cached figure with
      // its timestamp rather than pretending to be live.
      members: isList ? (counts?.total ?? 0) : null,
      cachedSize: (row.cached_size as number | null) ?? null,
      cachedAt: (row.cached_at as string | null) ?? null,
      suppressed: isList ? (counts?.unsubscribed ?? 0) : null,
      usedIn: usedBy.get(id) ?? 0,
      updatedAt: row.updated_at as string,
    };
  });
}

export type TemplateRow = {
  id: string;
  name: string;
  clientName: string | null;
  category: TemplateCategory;
  subject: string | null;
  status: string;
  blocks: number;
  createdBy: string | null;
  updatedAt: string;
};

export async function loadTemplates(sb: SupabaseClient): Promise<TemplateRow[]> {
  const rows = await sb
    .from("email_templates")
    .select("id, name, category, subject, status, blocks, created_by, updated_at, is_archived, customers(id, name, business_name)")
    .eq("is_archived", false)
    .order("name")
    .then((r) => unwrap<Record<string, unknown>[]>(r, "templates"));

  return rows.map((row) => {
    const customer = one<{ id: string; name: string | null; business_name: string | null }>(row.customers as never);
    return {
      id: row.id as string,
      name: row.name as string,
      clientName: customer ? customer.business_name || customer.name || "Client" : null,
      category: row.category as TemplateCategory,
      subject: (row.subject as string | null) ?? null,
      status: row.status as string,
      blocks: Array.isArray(row.blocks) ? (row.blocks as unknown[]).length : 0,
      createdBy: (row.created_by as string | null) ?? null,
      updatedAt: row.updated_at as string,
    };
  });
}

/* ── Choices every form shares ─────────────────────────────────────── */

export type EmailChoices = {
  clients: { id: string; name: string }[];
  audiences: { id: string; name: string; audienceType: AudienceType }[];
  templates: { id: string; name: string }[];
  brandProfiles: { id: string; name: string }[];
  sendingDomains: { id: string; domain: string; fromEmail: string | null }[];
  services: { id: string; name: string }[];
  people: string[];
  leadStatuses: string[];
  businessTypes: string[];
  sources: string[];
};

export async function loadEmailChoices(sb: SupabaseClient): Promise<EmailChoices> {
  const [customers, audiences, templates, brands, domains, services, admins, leadFacets] =
    await Promise.all([
      sb.from("customers").select("id, name, business_name, status").neq("status", "churned")
        .then((r) => unwrap<{ id: string; name: string | null; business_name: string | null }[]>(r, "customers")),
      sb.from("email_audiences").select("id, name, audience_type").eq("is_archived", false).order("name")
        .then((r) => unwrap<{ id: string; name: string; audience_type: AudienceType }[]>(r, "audiences")),
      sb.from("email_templates").select("id, name").eq("is_archived", false).order("name")
        .then((r) => unwrap<{ id: string; name: string }[]>(r, "templates")),
      sb.from("brand_profiles").select("id, name, active").eq("active", true).order("name")
        .then((r) => unwrap<{ id: string; name: string }[]>(r, "brand profiles")),
      sb.from("email_sending_domains").select("id, domain, from_email").order("is_default", { ascending: false })
        .then((r) => unwrap<{ id: string; domain: string; from_email: string | null }[]>(r, "sending domains")),
      sb.from("catalog_items").select("id, name, active").eq("active", true).order("name")
        .then((r) => unwrap<{ id: string; name: string }[]>(r, "services")),
      sb.from("admin_users").select("email").order("email")
        .then((r) => unwrap<{ email: string }[]>(r, "people")),
      // The facets the segment builder offers come from the DATA, not from a
      // hard-coded list — so a select can never offer a value that matches
      // nobody, and a new lead source appears without a code change.
      sb.from("leads").select("lead_status, business_type, source").limit(5000)
        .then((r) => unwrap<{ lead_status: string | null; business_type: string | null; source: string | null }[]>(r, "lead facets")),
    ]);

  const distinct = (values: (string | null)[]): string[] =>
    [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort();

  return {
    clients: customers
      .map((c) => ({ id: c.id, name: c.business_name || c.name || "Client" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    audiences: audiences.map((a) => ({ id: a.id, name: a.name, audienceType: a.audience_type })),
    templates,
    brandProfiles: brands,
    sendingDomains: domains.map((d) => ({ id: d.id, domain: d.domain, fromEmail: d.from_email })),
    services,
    people: admins.map((a) => a.email),
    leadStatuses: distinct(leadFacets.map((l) => l.lead_status)),
    businessTypes: distinct(leadFacets.map((l) => l.business_type)),
    sources: distinct(leadFacets.map((l) => l.source)),
  };
}
