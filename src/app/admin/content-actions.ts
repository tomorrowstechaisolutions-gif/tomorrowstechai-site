"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";

/**
 * Writes for the Content Studio.
 *
 * The line that matters in this file: NOTHING here publishes. The furthest a
 * content item can travel is 'scheduled', and scheduling hands it to Social
 * Center as a social_post whose own status is 'scheduled' — the platform API
 * call is Social Center's job and needs a connected account, which is a
 * separate deliberate step. AI-generated content cannot skip review either:
 * approve is a human action with a named actor.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, userId: session.user.id };
}

function str(fd: FormData, key: string, max = 5000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const STUDIO = "/admin/marketing/content";

const STATUSES = [
  "draft", "generating", "needs_review", "approved",
  "scheduled", "published", "failed", "archived",
];

export async function saveContentAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const id = str(formData, "content_id", 40);
  const title = str(formData, "title", 200);
  const body = str(formData, "body", 20000);
  if (!title) return;

  const hashtags = [
    ...new Set(
      str(formData, "hashtags", 500)
        .split(/[,\s]+/)
        .map((h) => h.replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 12);

  const fields = {
    title,
    body: body || null,
    campaign: str(formData, "campaign", 120) || null,
    service: str(formData, "service", 120) || null,
    cta: str(formData, "cta", 200) || null,
    destination_url: str(formData, "destination_url", 500) || null,
    hashtags,
    owner: actor,
  };

  if (id) {
    await supabase.from("content_items").update(fields).eq("id", id);
  } else {
    const brandId = str(formData, "brand_profile_id", 40);
    if (!brandId) return;
    await supabase.from("content_items").insert({
      ...fields,
      brand_profile_id: brandId,
      content_type: str(formData, "content_type", 40) || "social_post",
      platform: str(formData, "platform", 40) || null,
      status: "draft",
    });
  }

  revalidatePath(STUDIO);
}

/**
 * Move a piece through the workflow.
 *
 * Publishing is not reachable from here. 'published' is written by whatever
 * actually publishes — which today is nothing — so an item cannot claim to
 * be live because somebody clicked a button in a review queue.
 */
export async function setContentStatusAction(formData: FormData) {
  const { supabase, actor } = await requireAdmin();

  const id = str(formData, "content_id", 40);
  const status = str(formData, "status", 40);
  if (!id || !STATUSES.includes(status)) return;
  if (status === "published") return;

  const patch: Record<string, unknown> = { status };

  if (status === "scheduled") {
    const when = str(formData, "scheduled_at", 40);
    if (!when) return;
    patch.scheduled_at = new Date(when).toISOString();
  }
  if (status === "archived") patch.is_archived = true;
  if (status === "approved") patch.review_notes = str(formData, "review_notes", 2000) || null;

  patch.owner = actor;

  await supabase.from("content_items").update(patch).eq("id", id);
  revalidatePath(STUDIO);
  revalidatePath("/admin");
}

/**
 * Hand approved social content to Social Center.
 *
 * Creates the social_post that Social Center owns, links it back, and leaves
 * BOTH at 'scheduled'. The actual platform call happens there, against a
 * connected account. If no account for that platform is connected, this
 * refuses rather than creating a post that can never go out.
 */
export async function scheduleToSocialAction(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = str(formData, "content_id", 40);
  const when = str(formData, "scheduled_at", 40);
  if (!id || !when) return;

  const { data: item } = await supabase
    .from("content_items")
    .select("id, title, body, platform, campaign, destination_url, status, social_post_id, ai_generated")
    .eq("id", id)
    .maybeSingle();

  if (!item || !item.platform) return;
  // Only approved content leaves the studio. This is the approval gate.
  if (item.status !== "approved") return;
  if (item.social_post_id) return;

  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("platform", item.platform)
    .eq("connected", true)
    .eq("status", "connected")
    .maybeSingle();

  if (!account) {
    console.warn(`[content] no connected ${item.platform} account — not scheduling`);
    return;
  }

  const { data: post, error } = await supabase
    .from("social_posts")
    .insert({
      account_id: account.id,
      platform: item.platform,
      body: item.body ?? item.title,
      link_url: item.destination_url,
      campaign: item.campaign,
      scheduled_at: new Date(when).toISOString(),
      status: "scheduled",
      generated_by: item.ai_generated ? "ai" : "human",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[content] social handoff failed:", error.message);
    return;
  }

  await supabase
    .from("content_items")
    .update({ status: "scheduled", scheduled_at: new Date(when).toISOString(), social_post_id: post.id })
    .eq("id", id);

  revalidatePath(STUDIO);
  revalidatePath("/admin");
}

export async function updateBrandAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData, "brand_id", 40);
  if (!id) return;

  const list = (key: string) =>
    [
      ...new Set(
        str(formData, key, 1000)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      ),
    ].slice(0, 30);

  await supabase
    .from("brand_profiles")
    .update({
      description: str(formData, "description", 1000) || null,
      tone: str(formData, "tone", 300) || null,
      audience: str(formData, "audience", 500) || null,
      writing_guidance: str(formData, "writing_guidance", 2000) || null,
      cta_style: str(formData, "cta_style", 300) || null,
      preferred_phrases: list("preferred_phrases"),
      prohibited_phrases: list("prohibited_phrases"),
    })
    .eq("id", id);

  revalidatePath(STUDIO);
}

export async function addBrandAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(formData, "name", 160);
  if (!name) return;

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (!slug) return;

  await supabase.from("brand_profiles").insert({
    name,
    slug,
    description: str(formData, "description", 1000) || null,
    tone: str(formData, "tone", 300) || null,
    audience: str(formData, "audience", 500) || null,
    customer_id: str(formData, "customer_id", 40) || null,
  });

  revalidatePath(STUDIO);
}
