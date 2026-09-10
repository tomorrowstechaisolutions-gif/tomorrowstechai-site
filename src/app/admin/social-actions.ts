"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";

const SOCIAL = "/admin/marketing/social";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { supabase: await createSupabaseServerClient(), actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 5000) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function values(fd: FormData, key: string): string[] {
  return [...new Set(fd.getAll(key).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function go(message: string, error = false): never {
  revalidatePath(SOCIAL);
  revalidatePath("/admin");
  const params = new URLSearchParams({ [error ? "error" : "notice"]: message });
  redirect(`${SOCIAL}?${params}`);
}

async function activity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: { event_type: string; actor: string; detail?: string | null; customer_id?: string | null; account_id?: string | null; post_id?: string | null; platform?: string | null }
) {
  await supabase.from("social_activity_events").insert(input);
}

export async function createSocialPostAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const customerId = str(fd, "customer_id", 40) || null;
  const title = str(fd, "title", 180);
  const body = str(fd, "body", 10000);
  const platforms = values(fd, "platforms").filter((value): value is SocialPlatform => SOCIAL_PLATFORMS.includes(value as SocialPlatform));
  if (!title || !body || platforms.length === 0) go("A title, caption, and at least one platform are required.", true);

  const intent = str(fd, "publish_intent", 20);
  const approvalType = ["internal", "client"].includes(str(fd, "approval_type", 20)) ? str(fd, "approval_type", 20) : "none";
  const scheduledRaw = str(fd, "scheduled_at", 50);
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) go("Choose a valid publishing date and time.", true);

  let accountQuery = supabase
    .from("social_accounts")
    .select("id, platform, connected, status, posting_enabled")
    .in("platform", platforms);
  accountQuery = customerId ? accountQuery.eq("customer_id", customerId) : accountQuery.is("customer_id", null);
  const { data: accountRows, error: accountError } = await accountQuery;
  if (accountError) go(accountError.message, true);

  const accountByPlatform = new Map((accountRows ?? []).map((row) => [row.platform, row]));
  const wantsDelivery = intent === "schedule" || intent === "publish_now";
  if (wantsDelivery) {
    const unavailable = platforms.filter((platform) => {
      const account = accountByPlatform.get(platform);
      return !account || !account.connected || account.status !== "connected" || !account.posting_enabled;
    });
    if (unavailable.length) go(`Connect a publishing-enabled account before scheduling: ${unavailable.join(", ")}.`, true);
  }

  let serviceAssignmentId: string | null = null;
  if (customerId) {
    const { data: assignments } = await supabase
      .from("client_services")
      .select("id, services(name)")
      .eq("customer_id", customerId)
      .eq("status", "active");
    serviceAssignmentId = (assignments ?? []).find((row) => {
      const service = Array.isArray(row.services) ? row.services[0] : row.services;
      return /social management/i.test(service?.name ?? "");
    })?.id ?? null;
  }

  const approvalStatus = approvalType === "none" ? "not_required" : "waiting";
  const status = approvalType !== "none" ? "needs_approval" : wantsDelivery ? "scheduled" : "draft";
  const when = intent === "publish_now" ? new Date().toISOString() : scheduledAt?.toISOString() ?? null;
  if (status === "scheduled" && !when) go("Scheduled posts need a date and time.", true);

  const { data: post, error } = await supabase.from("social_posts").insert({
    customer_id: customerId,
    account_id: accountByPlatform.get(platforms[0])?.id ?? null,
    platform: platforms[0],
    title,
    body,
    headline: str(fd, "headline", 300) || null,
    description: str(fd, "description", 2000) || null,
    cta: str(fd, "cta", 120) || null,
    link_url: str(fd, "destination_url", 1000) || null,
    hashtags: values(fd, "hashtags").flatMap((value) => value.split(/[\s,]+/)).map((value) => value.replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 30),
    first_comment: str(fd, "first_comment", 2000) || null,
    location: str(fd, "location", 300) || null,
    alt_text: str(fd, "alt_text", 1000) || null,
    scheduled_at: when,
    status,
    approval_type: approvalType,
    approval_status: approvalStatus,
    timezone: str(fd, "timezone", 80) || "America/Chicago",
    assigned_to: str(fd, "assigned_to", 200) || actor,
    campaign: str(fd, "campaign", 160) || null,
    service_assignment_id: serviceAssignmentId,
    media_asset_id: str(fd, "media_asset_id", 40) || null,
    media_type: ["image", "video", "carousel"].includes(str(fd, "media_type", 20)) ? str(fd, "media_type", 20) : "none",
    generated_by: "human",
  }).select("id").single();
  if (error || !post) go(error?.message || "The post could not be saved.", true);

  const { error: platformError } = await supabase.from("social_post_platforms").insert(platforms.map((platform) => ({
    post_id: post.id,
    social_account_id: accountByPlatform.get(platform)?.id ?? null,
    platform,
    platform_status: status === "scheduled" ? "scheduled" : "draft",
  })));
  if (platformError) go(platformError.message, true);

  if (approvalType !== "none") await supabase.from("social_post_approvals").insert({ post_id: post.id, decision: "requested", approval_type: approvalType, actor });
  await activity(supabase, { event_type: status === "scheduled" ? "post_scheduled" : "post_created", actor, detail: title, customer_id: customerId, post_id: post.id, platform: platforms.join(",") });
  go(status === "scheduled" ? "Post scheduled." : approvalType !== "none" ? "Post sent for approval." : "Draft saved.");
}

export async function registerSocialAccountAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const platform = str(fd, "platform", 40) as SocialPlatform;
  const customerId = str(fd, "customer_id", 40) || null;
  if (!SOCIAL_PLATFORMS.includes(platform)) go("Choose a supported platform.", true);
  const handle = str(fd, "handle", 180);
  if (!handle) go("Enter the account or page handle.", true);

  const { data, error } = await supabase.from("social_accounts").insert({
    customer_id: customerId,
    platform,
    handle,
    display_name: str(fd, "display_name", 200) || handle,
    external_id: str(fd, "external_id", 300) || null,
    external_page_id: str(fd, "external_page_id", 300) || null,
    timezone: str(fd, "timezone", 80) || "America/Chicago",
    connected: false,
    status: "disconnected",
    posting_enabled: false,
    analytics_enabled: false,
    engagement_enabled: false,
    notes: "Registered in Social Center. OAuth provider credentials are not configured yet.",
  }).select("id").single();
  if (error || !data) go(error?.message || "The account could not be registered.", true);
  await activity(supabase, { event_type: "account_registered", actor, customer_id: customerId, account_id: data.id, platform, detail: `${platform} account registered; OAuth not configured.` });
  go("Account registered. OAuth connection is not configured yet.");
}

export async function reviewSocialPostAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(fd, "post_id", 40);
  const decision = str(fd, "decision", 30);
  if (!id || !["approved", "changes_requested", "rejected"].includes(decision)) go("That approval action is invalid.", true);
  const { data: post } = await supabase.from("social_posts").select("id, customer_id, approval_type, scheduled_at, title").eq("id", id).maybeSingle();
  if (!post) go("Post not found.", true);
  const status = decision === "approved" ? (post.scheduled_at ? "scheduled" : "approved") : "needs_approval";
  const patch: Record<string, unknown> = { approval_status: decision, status, approval_notes: str(fd, "notes", 2000) || null };
  if (decision === "approved") { patch.approved_by = actor; patch.approved_at = new Date().toISOString(); }
  const { error } = await supabase.from("social_posts").update(patch).eq("id", id).eq("approval_status", "waiting");
  if (error) go(error.message, true);
  if (decision === "approved" && post.scheduled_at) {
    await supabase.from("social_post_platforms").update({ platform_status: "scheduled" }).eq("post_id", id);
  }
  await supabase.from("social_post_approvals").insert({ post_id: id, decision, approval_type: post.approval_type === "client" ? "client" : "internal", actor, notes: str(fd, "notes", 2000) || null });
  await activity(supabase, { event_type: `post_${decision}`, actor, customer_id: post.customer_id, post_id: id, detail: post.title });
  go(`Post ${decision.replace("_", " ")}.`);
}

export async function updateSocialPostAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(fd, "post_id", 40);
  const action = str(fd, "post_action", 30);
  const { data: post } = await supabase.from("social_posts").select("id, customer_id, title, status, publish_attempts, account_id, platform").eq("id", id).maybeSingle();
  if (!post) go("Post not found.", true);
  if (action === "save_edit" && !["published", "publishing"].includes(post.status)) {
    const title = str(fd, "title", 180);
    const body = str(fd, "body", 10000);
    if (!title || !body) go("A title and caption are required.", true);
    const { error } = await supabase.from("social_posts").update({ title, body, cta: str(fd, "cta", 120) || null, link_url: str(fd, "destination_url", 1000) || null }).eq("id", id);
    if (error) go(error.message, true);
    await activity(supabase, { event_type: "post_edited", actor, customer_id: post.customer_id, post_id: id, detail: title });
    go("Post updated.");
  }
  if (action === "duplicate") {
    const { data: source, error: sourceError } = await supabase.from("social_posts").select("customer_id,account_id,platform,title,body,headline,description,cta,link_url,hashtags,first_comment,location,alt_text,timezone,assigned_to,campaign,service_assignment_id,media_asset_id,media_type,generated_by").eq("id", id).single();
    if (sourceError || !source) go(sourceError?.message || "Post not found.", true);
    const { data: copy, error: copyError } = await supabase.from("social_posts").insert({ ...source, title: `Copy of ${source.title || post.title}`, status: "draft", approval_type: "none", approval_status: "not_required", scheduled_at: null, published_at: null }).select("id").single();
    if (copyError || !copy) go(copyError?.message || "Post could not be duplicated.", true);
    const { data: children } = await supabase.from("social_post_platforms").select("social_account_id,platform").eq("post_id", id);
    if (children?.length) await supabase.from("social_post_platforms").insert(children.map((child) => ({ ...child, post_id: copy.id, platform_status: "draft" })));
    await activity(supabase, { event_type: "post_duplicated", actor, customer_id: post.customer_id, post_id: copy.id, detail: source.title });
    go("Draft duplicated.");
  }
  if (action === "publish_now" && ["draft", "approved", "scheduled"].includes(post.status)) {
    const { data: destinations } = await supabase.from("social_post_platforms").select("social_account_id, social_accounts(connected,status,posting_enabled)").eq("post_id", id);
    const unavailable = (destinations ?? []).some((destination) => {
      const account = Array.isArray(destination.social_accounts) ? destination.social_accounts[0] : destination.social_accounts;
      return !account?.connected || account.status !== "connected" || !account.posting_enabled;
    });
    if (!destinations?.length || unavailable) go("Every destination needs a publishing-enabled account before publishing.", true);
    const when = new Date().toISOString();
    await supabase.from("social_posts").update({ status: "scheduled", scheduled_at: when }).eq("id", id);
    await supabase.from("social_post_platforms").update({ platform_status: "scheduled" }).eq("post_id", id);
    await activity(supabase, { event_type: "publish_queued", actor, customer_id: post.customer_id, post_id: id, detail: post.title });
    go("Post queued for immediate publishing.");
  }
  if (action === "cancel" && ["scheduled", "needs_approval", "approved"].includes(post.status)) {
    await supabase.from("social_posts").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("social_post_platforms").update({ platform_status: "canceled" }).eq("post_id", id);
    await activity(supabase, { event_type: "post_canceled", actor, customer_id: post.customer_id, post_id: id, detail: post.title });
    go("Schedule canceled.");
  }
  if (action === "archive" && post.status === "draft") {
    await supabase.from("social_posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    await activity(supabase, { event_type: "draft_archived", actor, customer_id: post.customer_id, post_id: id, detail: post.title });
    go("Draft archived.");
  }
  if (action === "reschedule") {
    const raw = str(fd, "scheduled_at", 50);
    const when = new Date(raw);
    if (!raw || Number.isNaN(when.getTime())) go("Choose a valid date and time.", true);
    await supabase.from("social_posts").update({ scheduled_at: when.toISOString(), status: post.status === "canceled" ? "scheduled" : post.status }).eq("id", id);
    if (post.status === "canceled") await supabase.from("social_post_platforms").update({ platform_status: "scheduled" }).eq("post_id", id);
    await activity(supabase, { event_type: "post_rescheduled", actor, customer_id: post.customer_id, post_id: id, detail: post.title });
    go("Post rescheduled.");
  }
  if (action === "retry" && post.status === "failed") {
    const attempt = (post.publish_attempts ?? 0) + 1;
    await supabase.from("social_publish_attempts").insert({ post_id: id, social_account_id: post.account_id, platform: post.platform, idempotency_key: `${id}:${attempt}`, attempt_number: attempt, status: "queued" });
    await supabase.from("social_posts").update({ status: "scheduled", error: null, error_details: null, publish_attempts: attempt, scheduled_at: new Date().toISOString() }).eq("id", id);
    await activity(supabase, { event_type: "publish_retry_queued", actor, customer_id: post.customer_id, post_id: id, detail: post.title });
    go("Publish retry queued.");
  }
  go("That action is not available for this post.", true);
}

export async function toggleSocialAutomationAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const key = str(fd, "automation_key", 100);
  const customerId = str(fd, "customer_id", 40) || null;
  const enabled = str(fd, "enabled", 10) === "true";
  if (!key) go("Automation key is required.", true);
  let existingQuery = supabase.from("social_automation_settings").select("id").eq("automation_key", key);
  existingQuery = customerId ? existingQuery.eq("customer_id", customerId) : existingQuery.is("customer_id", null);
  const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) go(lookupError.message, true);
  const result = existing
    ? await supabase.from("social_automation_settings").update({ enabled, created_by: actor }).eq("id", existing.id)
    : await supabase.from("social_automation_settings").insert({ customer_id: customerId, automation_key: key, enabled, created_by: actor });
  if (result.error) go(result.error.message, true);
  await activity(supabase, { event_type: "automation_updated", actor, customer_id: customerId, detail: `${key}: ${enabled ? "enabled" : "disabled"}` });
  go(`Automation ${enabled ? "enabled" : "disabled"}.`);
}

export async function resolveEngagementAction(fd: FormData) {
  const { supabase, actor } = await requireAdmin();
  const id = str(fd, "engagement_id", 40);
  const { data: item } = await supabase.from("social_engagement_items").select("id, customer_id, social_account_id, platform").eq("id", id).maybeSingle();
  if (!item) go("Engagement item not found.", true);
  await supabase.from("social_engagement_items").update({ resolved_at: new Date().toISOString(), unread: false, assigned_to: actor }).eq("id", id);
  await activity(supabase, { event_type: "engagement_resolved", actor, customer_id: item.customer_id, account_id: item.social_account_id, platform: item.platform });
  go("Engagement item resolved.");
}
