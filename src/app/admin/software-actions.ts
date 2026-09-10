"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { slugify, versionSortKey } from "@/lib/software/types";

/**
 * Writes for the Software screens.
 *
 * Same posture as every other action file here:
 *   - re-check the admin on every call, because a form post is not a page
 *     view and the session may have gone;
 *   - use the REQUEST-SCOPED client so RLS applies on top of that check;
 *   - never reach for the service role, because nothing in this module needs
 *     to read a secret.
 *
 * A NOTE ON THIS FILE'S SHAPE: a "use server" module may export nothing but
 * async functions. Constants and types that these actions and their forms
 * share live in src/lib/software/types.ts. `export type` is fine — types are
 * erased — but an exported const array here is a build error that only
 * `next build` surfaces, so it does not happen.
 *
 * THE RULE THAT RUNS THROUGH THE WRITES: a price a client agreed to is
 * SNAPSHOTTED onto software_clients and is never recomputed from the plan.
 * Changing a plan's price changes what NEW clients are offered and nothing
 * else. Moving an existing client onto new pricing is a separate, deliberate
 * action (changeClientPlanAction) that says so and logs an event.
 */

const SOFTWARE = "/admin/software";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const supabase = await createSupabaseServerClient();
  return { supabase, actor: session.admin.email, role: session.admin.role };
}

/** Product and pricing writes are owner/admin only. Viewers can look. */
async function requireManager() {
  const session = await requireAdmin();
  if (!["owner", "admin"].includes(session.role)) {
    throw new Error("You do not have permission to change software products.");
  }
  return session;
}

function text(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function required(form: FormData, key: string, label: string): string {
  const value = text(form, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function flag(form: FormData, key: string): boolean {
  const raw = form.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

/** Dollars in the form, cents in the database. Blank stays null, not zero. */
function cents(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return null;
  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Prices must be a positive number.");
  return Math.round(parsed * 100);
}

function whole(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("That value must be a whole number.");
  return parsed;
}

async function logEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  softwareId: string,
  kind: string,
  body: string,
  actor: string,
  customerId?: string | null
) {
  // Activity is a record, not a gate: a failed log must never fail the write
  // it was describing, or an audit trail becomes a reliability problem.
  await supabase.from("software_events").insert({
    software_id: softwareId,
    customer_id: customerId ?? null,
    kind,
    body,
    actor,
  });
}

function refresh(softwareId?: string) {
  revalidatePath(SOFTWARE);
  if (softwareId) revalidatePath(`${SOFTWARE}/${softwareId}`);
}

/* ── Products ──────────────────────────────────────────────────────── */

export async function createSoftwareAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();

  const name = required(form, "name", "Product name");
  const slug = slugify(text(form, "slug") ?? name);
  if (!slug) throw new Error("That name does not produce a usable slug. Add a slug by hand.");

  const { data, error } = await supabase
    .from("software_products")
    .insert({
      name,
      internal_name: text(form, "internal_name"),
      slug,
      description: text(form, "description"),
      logo_url: text(form, "logo_url"),
      product_type: text(form, "product_type") ?? "saas_platform",
      industry: text(form, "industry"),
      status: text(form, "status") ?? "planning",
      owner: text(form, "owner"),
      technical_owner: text(form, "technical_owner"),
      sales_owner: text(form, "sales_owner"),
      billing_model: text(form, "billing_model") ?? "subscription",
      default_monthly_price_cents: cents(form, "default_monthly_price"),
      setup_fee_cents: cents(form, "setup_fee"),
      trial_available: flag(form, "trial_available"),
      trial_days: whole(form, "trial_days"),
      currency: text(form, "currency") ?? "usd",
      release_channel: text(form, "release_channel") ?? "stable",
      default_service_id: text(form, "default_service_id"),
      default_task_template_id: text(form, "default_task_template_id"),
      default_intake_key: text(form, "default_intake_key"),
      website_id: text(form, "website_id"),
      launch_date: text(form, "launch_date"),
      notes: text(form, "notes"),
      created_by: actor,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`Another product already uses the slug "${slug}".`);
    throw new Error(error.message);
  }

  await logEvent(supabase, data.id, "created", `${name} was created.`, actor);

  // An opening version is recorded when one was given, so the product does
  // not start life claiming a production version it never shipped.
  const version = text(form, "current_version");
  if (version) {
    await supabase.from("software_versions").insert({
      software_id: data.id,
      version,
      channel: text(form, "release_channel") ?? "stable",
      status: text(form, "status") === "live" ? "production" : "draft",
      is_current_production: text(form, "status") === "live",
      created_by: actor,
    });
  }

  // Apps chosen in the sheet are claimed by this product.
  const appIds = form.getAll("app_ids").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (appIds.length > 0) {
    await supabase.from("apps").update({ software_id: data.id }).in("id", appIds);
    await logEvent(supabase, data.id, "app_linked", `${appIds.length} app(s) linked to ${name}.`, actor);
  }

  refresh(data.id);
  redirect(`${SOFTWARE}/${data.id}`);
}

export async function updateSoftwareAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = required(form, "software_id", "Product");

  const patch: Record<string, unknown> = {
    name: required(form, "name", "Product name"),
    internal_name: text(form, "internal_name"),
    description: text(form, "description"),
    logo_url: text(form, "logo_url"),
    product_type: text(form, "product_type") ?? "saas_platform",
    industry: text(form, "industry"),
    owner: text(form, "owner"),
    technical_owner: text(form, "technical_owner"),
    sales_owner: text(form, "sales_owner"),
    billing_model: text(form, "billing_model") ?? "subscription",
    default_monthly_price_cents: cents(form, "default_monthly_price"),
    setup_fee_cents: cents(form, "setup_fee"),
    trial_available: flag(form, "trial_available"),
    trial_days: whole(form, "trial_days"),
    release_channel: text(form, "release_channel") ?? "stable",
    default_service_id: text(form, "default_service_id"),
    default_task_template_id: text(form, "default_task_template_id"),
    default_intake_key: text(form, "default_intake_key"),
    website_id: text(form, "website_id"),
    launch_date: text(form, "launch_date"),
    notes: text(form, "notes"),
  };

  const slug = text(form, "slug");
  if (slug) patch.slug = slugify(slug);

  const { error } = await supabase.from("software_products").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Another product already uses that slug.");
    throw new Error(error.message);
  }

  await logEvent(supabase, id, "updated", `${patch.name} was updated.`, actor);
  refresh(id);
}

export async function setSoftwareStatusAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = required(form, "software_id", "Product");
  const status = required(form, "status", "Status");

  const { error } = await supabase.from("software_products").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, id, "status_change", `Lifecycle status set to ${status}.`, actor);
  refresh(id);
}

/**
 * Archiving is never a delete.
 *
 * A product with client assignments, versions and invoices behind it holds
 * history that other screens still read. §31 is explicit about this, and the
 * database agrees: there is no delete path in this file for a product.
 */
export async function archiveSoftwareAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = required(form, "software_id", "Product");

  const { count } = await supabase
    .from("software_clients")
    .select("id", { count: "exact", head: true })
    .eq("software_id", id)
    .in("status", ["active", "trial", "onboarding", "past_due"]);

  if ((count ?? 0) > 0) {
    throw new Error(
      `${count} client${count === 1 ? " is" : "s are"} still on this product. Cancel or move them before archiving it.`
    );
  }

  const { error } = await supabase.from("software_products").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, id, "archived", "Product archived.", actor);
  refresh(id);
}

export async function restoreSoftwareAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const id = required(form, "software_id", "Product");

  // The trigger moves an un-archived product to 'paused' rather than
  // guessing that it went back to live.
  const { error } = await supabase.from("software_products").update({ is_archived: false }).eq("id", id);
  if (error) throw new Error(error.message);

  await logEvent(supabase, id, "status_change", "Product restored from archive, and is paused.", actor);
  refresh(id);
}

/* ── Plans ─────────────────────────────────────────────────────────── */

export async function savePlanAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const planId = text(form, "plan_id");
  const name = required(form, "name", "Plan name");

  const row = {
    software_id: softwareId,
    name,
    description: text(form, "description"),
    monthly_price_cents: cents(form, "monthly_price"),
    annual_price_cents: cents(form, "annual_price"),
    setup_fee_cents: cents(form, "setup_fee"),
    trial_days: whole(form, "trial_days"),
    status: text(form, "status") ?? "draft",
    is_default: flag(form, "is_default"),
    display_order: whole(form, "display_order") ?? 0,
  };

  // Only one plan per product may be the default, and the partial unique
  // index enforces it — so the previous holder is stood down first rather
  // than letting the insert fail with a constraint violation.
  if (row.is_default) {
    await supabase
      .from("software_plans")
      .update({ is_default: false })
      .eq("software_id", softwareId)
      .eq("is_default", true);
  }

  if (planId) {
    const { error } = await supabase.from("software_plans").update(row).eq("id", planId);
    if (error) {
      if (error.code === "23505") throw new Error(`This product already has a plan called "${name}".`);
      throw new Error(error.message);
    }
    // The price-history trigger has already recorded any change; this is the
    // human-readable half of the same fact.
    await logEvent(
      supabase, softwareId, "plan_updated",
      `Plan "${name}" updated. Existing clients keep the price they agreed to.`, actor
    );
  } else {
    const { error } = await supabase.from("software_plans").insert(row);
    if (error) {
      if (error.code === "23505") throw new Error(`This product already has a plan called "${name}".`);
      throw new Error(error.message);
    }
    await logEvent(supabase, softwareId, "plan_created", `Plan "${name}" created.`, actor);
  }

  refresh(softwareId);
}

/**
 * Retiring a plan, not deleting it.
 *
 * A plan with clients on it cannot be removed: their snapshot would survive
 * but the name beside it would vanish, and the Clients tab would start
 * showing a price with no plan. Retire keeps it readable.
 */
export async function retirePlanAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const planId = required(form, "plan_id", "Plan");

  const { count } = await supabase
    .from("software_clients")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .neq("status", "canceled");

  const status = (count ?? 0) > 0 ? "grandfathered" : "retired";
  const { error } = await supabase
    .from("software_plans")
    .update({ status, is_default: false })
    .eq("id", planId);
  if (error) throw new Error(error.message);

  await logEvent(
    supabase, softwareId, "plan_updated",
    status === "grandfathered"
      ? `Plan closed to new clients. ${count} existing client${count === 1 ? "" : "s"} stay on it at the price they agreed to.`
      : "Plan retired.",
    actor
  );
  refresh(softwareId);
}

export async function deletePlanAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const planId = required(form, "plan_id", "Plan");

  const { count } = await supabase
    .from("software_clients")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);

  if ((count ?? 0) > 0) {
    throw new Error(
      "This plan has clients against it, so deleting it would leave their history without a name. Retire it instead."
    );
  }

  const { error } = await supabase.from("software_plans").delete().eq("id", planId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "plan_updated", "An unused plan was deleted.", actor);
  refresh(softwareId);
}

export async function savePlanLimitAction(form: FormData): Promise<void> {
  const { supabase } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const planId = required(form, "plan_id", "Plan");
  const limitType = text(form, "limit_type") ?? "numeric";
  const value = whole(form, "limit_value");

  // The database check says limit_value exists exactly when the type is
  // numeric. Saying so here gives a sentence instead of a constraint error.
  if (limitType === "numeric" && value === null) {
    throw new Error("A numeric limit needs a number. Choose Unlimited or Not included instead.");
  }

  const key = slugify(text(form, "limit_key") ?? required(form, "label", "Limit"));
  const { error } = await supabase.from("software_plan_limits").upsert(
    {
      plan_id: planId,
      limit_key: key,
      label: required(form, "label", "Limit"),
      limit_type: limitType,
      limit_value: limitType === "numeric" ? value : null,
      unit: text(form, "unit"),
      sort_order: whole(form, "sort_order") ?? 0,
    },
    { onConflict: "plan_id,limit_key" }
  );
  if (error) throw new Error(error.message);

  refresh(softwareId);
}

export async function deletePlanLimitAction(form: FormData): Promise<void> {
  const { supabase } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const limitId = required(form, "limit_id", "Limit");

  const { error } = await supabase.from("software_plan_limits").delete().eq("id", limitId);
  if (error) throw new Error(error.message);
  refresh(softwareId);
}

/* ── Features and the matrix ───────────────────────────────────────── */

export async function saveFeatureAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const featureId = text(form, "feature_id");
  const name = required(form, "name", "Feature name");

  const row = {
    software_id: softwareId,
    name,
    category: text(form, "category") ?? "other",
    description: text(form, "description"),
    status: text(form, "status") ?? "planned",
    owner: text(form, "owner"),
    introduced_version_id: text(form, "introduced_version_id"),
    sort_order: whole(form, "sort_order") ?? 0,
  };

  if (featureId) {
    const { error } = await supabase.from("software_features").update(row).eq("id", featureId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, softwareId, "feature_updated", `Feature "${name}" updated.`, actor);
  } else {
    const { error } = await supabase.from("software_features").insert(row);
    if (error) {
      if (error.code === "23505") throw new Error(`This product already has a feature called "${name}".`);
      throw new Error(error.message);
    }
    // Deliberately NOT granted to every plan. A missing plan_feature row
    // means not included, which is the safe default for a new feature.
    await logEvent(
      supabase, softwareId, "feature_added",
      `Feature "${name}" added. It is not included in any plan until it is added to one.`, actor
    );
  }

  refresh(softwareId);
}

export async function setPlanFeatureAction(form: FormData): Promise<void> {
  const { supabase } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const planId = required(form, "plan_id", "Plan");
  const featureId = required(form, "feature_id", "Feature");
  const inclusion = required(form, "inclusion", "Inclusion");

  // "Not included" is the absence of a row, so setting it removes the row
  // rather than storing a negative. One representation, not two.
  if (inclusion === "not_included") {
    const { error } = await supabase
      .from("software_plan_features")
      .delete()
      .eq("plan_id", planId)
      .eq("feature_id", featureId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("software_plan_features").upsert(
      { plan_id: planId, feature_id: featureId, inclusion, note: text(form, "note") },
      { onConflict: "plan_id,feature_id" }
    );
    if (error) throw new Error(error.message);
  }

  refresh(softwareId);
}

export async function deleteFeatureAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const featureId = required(form, "feature_id", "Feature");

  const { error } = await supabase.from("software_features").delete().eq("id", featureId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "feature_updated", "A feature was removed.", actor);
  refresh(softwareId);
}

/* ── Versions ──────────────────────────────────────────────────────── */

export async function createVersionAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const version = required(form, "version", "Version");

  const { error } = await supabase.from("software_versions").insert({
    software_id: softwareId,
    version,
    channel: text(form, "channel") ?? "stable",
    status: text(form, "status") ?? "draft",
    environment: text(form, "environment"),
    release_notes: text(form, "release_notes"),
    is_breaking: flag(form, "is_breaking"),
    created_by: actor,
  });

  if (error) {
    if (error.code === "23505") throw new Error(`Version ${version} already exists for this product.`);
    throw new Error(error.message);
  }

  await logEvent(supabase, softwareId, "version_created", `Version ${version} recorded.`, actor);
  refresh(softwareId);
}

/**
 * Promote a version to staging or production.
 *
 * §17: no accidental rollback. Promoting a version OLDER than the one
 * currently live is a legitimate thing to do — it is how a bad release gets
 * pulled — but it is never a thing to do by misclick, so it requires an
 * explicit confirm and says what it is about to undo.
 *
 * The demotion of the previous holder happens in the database trigger, so
 * this is one update and the product can never end up with two live
 * versions or none.
 */
export async function promoteVersionAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const versionId = required(form, "version_id", "Version");
  const target = text(form, "target") ?? "production";

  const { data: rows, error: readError } = await supabase
    .from("software_versions")
    .select("id, version, is_current_production")
    .eq("software_id", softwareId);
  if (readError) throw new Error(readError.message);

  const moving = rows?.find((r) => r.id === versionId);
  if (!moving) throw new Error("That version does not belong to this product.");

  if (target === "production") {
    const live = rows?.find((r) => r.is_current_production && r.id !== versionId);
    const isRollback =
      live !== undefined &&
      versionSortKey(moving.version).localeCompare(versionSortKey(live.version)) < 0;

    if (isRollback && !flag(form, "confirm_rollback")) {
      throw new Error(
        `${moving.version} is older than the live version ${live.version}. Confirm the rollback if that is what you mean to do.`
      );
    }

    const { error } = await supabase
      .from("software_versions")
      .update({ is_current_production: true, status: "production" })
      .eq("id", versionId);
    if (error) throw new Error(error.message);

    await logEvent(
      supabase, softwareId, "version_promoted",
      isRollback
        ? `Rolled production back from ${live?.version} to ${moving.version}.`
        : `${moving.version} promoted to production${live ? `, replacing ${live.version}` : ""}.`,
      actor
    );
  } else {
    const { error } = await supabase
      .from("software_versions")
      .update({ is_current_staging: true, status: "staging" })
      .eq("id", versionId);
    if (error) throw new Error(error.message);

    await logEvent(supabase, softwareId, "version_promoted", `${moving.version} promoted to staging.`, actor);
  }

  refresh(softwareId);
}

export async function deprecateVersionAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const versionId = required(form, "version_id", "Version");

  const { data: version } = await supabase
    .from("software_versions")
    .select("version, is_current_production")
    .eq("id", versionId)
    .maybeSingle();

  if (version?.is_current_production) {
    throw new Error(
      "That version is currently in production. Promote its replacement first, then deprecate this one."
    );
  }

  const { error } = await supabase
    .from("software_versions")
    .update({ status: "deprecated", is_current_staging: false })
    .eq("id", versionId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "version_promoted", `Version ${version?.version ?? ""} deprecated.`.trim(), actor);
  refresh(softwareId);
}

/* ── Clients ───────────────────────────────────────────────────────── */

/**
 * Put a client on a product.
 *
 * The price is SNAPSHOTTED here, from the plan if one was chosen and from
 * the typed override if one was given. After this moment the plan can move
 * and this client does not.
 */
export async function addSoftwareClientAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const customerId = required(form, "customer_id", "Client");
  const planId = text(form, "plan_id");

  let monthly = cents(form, "monthly_price");
  let setup = cents(form, "setup_fee");

  if (planId && (monthly === null || setup === null)) {
    const { data: plan } = await supabase
      .from("software_plans")
      .select("monthly_price_cents, setup_fee_cents")
      .eq("id", planId)
      .maybeSingle();
    if (monthly === null) monthly = plan?.monthly_price_cents ?? null;
    if (setup === null) setup = plan?.setup_fee_cents ?? null;
  }

  const { error } = await supabase.from("software_clients").insert({
    software_id: softwareId,
    customer_id: customerId,
    plan_id: planId,
    client_service_id: text(form, "client_service_id"),
    job_id: text(form, "job_id"),
    status: text(form, "status") ?? "onboarding",
    monthly_price_snapshot_cents: monthly,
    setup_fee_snapshot_cents: setup,
    onboarding_status: text(form, "onboarding_status") ?? "not_started",
    onboarding_due_at: text(form, "onboarding_due_at"),
    current_version_id: text(form, "current_version_id"),
    start_date: text(form, "start_date") ?? undefined,
    trial_ends_on: text(form, "trial_ends_on"),
    notes: text(form, "notes"),
  });

  if (error) {
    if (error.code === "23505") throw new Error("That client is already on this product. Change their plan instead.");
    throw new Error(error.message);
  }

  await logEvent(supabase, softwareId, "client_added", "A client was added to this product.", actor, customerId);
  refresh(softwareId);
}

export async function updateSoftwareClientAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const rowId = required(form, "assignment_id", "Assignment");

  // NOTE what is absent: plan_id and the price snapshots. Editing status,
  // onboarding and dates must not be able to silently reprice anyone —
  // that is changeClientPlanAction's job and it says so out loud.
  const { error } = await supabase
    .from("software_clients")
    .update({
      status: text(form, "status") ?? "active",
      onboarding_status: text(form, "onboarding_status") ?? "not_started",
      onboarding_due_at: text(form, "onboarding_due_at"),
      current_version_id: text(form, "current_version_id"),
      client_service_id: text(form, "client_service_id"),
      job_id: text(form, "job_id"),
      end_date: text(form, "end_date"),
      trial_ends_on: text(form, "trial_ends_on"),
      notes: text(form, "notes"),
    })
    .eq("id", rowId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "client_changed", "A client assignment was updated.", actor);
  refresh(softwareId);
}

/**
 * Move a client onto a different plan, at a stated price.
 *
 * This is the ONLY path that rewrites a price snapshot, and it records what
 * the old one was. §36: a plan price change must never retroactively alter
 * an existing subscription unless somebody explicitly migrates it. This is
 * that explicit migration.
 */
export async function changeClientPlanAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const rowId = required(form, "assignment_id", "Assignment");
  const planId = required(form, "plan_id", "Plan");

  const [{ data: current }, { data: plan }] = await Promise.all([
    supabase
      .from("software_clients")
      .select("customer_id, monthly_price_snapshot_cents, plan_id")
      .eq("id", rowId)
      .maybeSingle(),
    supabase
      .from("software_plans")
      .select("name, monthly_price_cents, setup_fee_cents")
      .eq("id", planId)
      .maybeSingle(),
  ]);

  if (!current) throw new Error("That assignment no longer exists.");

  // An explicit override wins; otherwise the new plan's list price becomes
  // the new snapshot. Either way it is written down once, here.
  const override = cents(form, "monthly_price");
  const monthly = override ?? plan?.monthly_price_cents ?? null;

  const { error } = await supabase
    .from("software_clients")
    .update({ plan_id: planId, monthly_price_snapshot_cents: monthly })
    .eq("id", rowId);
  if (error) throw new Error(error.message);

  const was = current.monthly_price_snapshot_cents;
  const money = (v: number | null) => (v === null ? "no recorded price" : `$${(v / 100).toFixed(0)}/mo`);

  await logEvent(
    supabase, softwareId, "price_change",
    `Moved to plan "${plan?.name ?? "unknown"}" — ${money(was)} → ${money(monthly)}.`,
    actor, current.customer_id
  );
  refresh(softwareId);
}

export async function cancelSoftwareClientAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const rowId = required(form, "assignment_id", "Assignment");

  const { data: current } = await supabase
    .from("software_clients")
    .select("customer_id")
    .eq("id", rowId)
    .maybeSingle();

  const { error } = await supabase
    .from("software_clients")
    .update({ status: "canceled", end_date: new Date().toISOString().slice(0, 10) })
    .eq("id", rowId);
  if (error) throw new Error(error.message);

  // The row is kept, not deleted: the price they paid and the dates they
  // paid it for are history the Revenue tab still reads.
  await logEvent(
    supabase, softwareId, "client_canceled",
    "A client was canceled. Their assignment is kept so past revenue stays attributable.",
    actor, current?.customer_id
  );
  refresh(softwareId);
}

/* ── Apps ──────────────────────────────────────────────────────────── */

export async function linkAppAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const appId = required(form, "app_id", "App");

  const { error } = await supabase.from("apps").update({ software_id: softwareId }).eq("id", appId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "app_linked", "An app was linked to this product.", actor);
  refresh(softwareId);
}

export async function unlinkAppAction(form: FormData): Promise<void> {
  const { supabase, actor } = await requireManager();
  const softwareId = required(form, "software_id", "Product");
  const appId = required(form, "app_id", "App");

  // The app is not touched otherwise — it goes back to being a standalone
  // app, which is what it was before it was claimed.
  const { error } = await supabase.from("apps").update({ software_id: null }).eq("id", appId);
  if (error) throw new Error(error.message);

  await logEvent(supabase, softwareId, "app_linked", "An app was unlinked from this product.", actor);
  refresh(softwareId);
}
