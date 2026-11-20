"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmPlaybook, setAgentPaused, setCrewPaused } from "@/lib/crew/setup";
import type { AgentSlug } from "@/lib/crew/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

/**
 * The switches on the Tess tab: confirm the playbook, pause the crew, pause
 * one bot.
 *
 * The crew's tables are written with the service role, so the admin check
 * here is the only thing standing between a request and those writes. Every
 * action makes it first.
 */

const SLUGS: AgentSlug[] = ["tess", "follow-through", "content", "finance"];

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return supabaseAdmin();
}

function touch() {
  revalidatePath("/admin/ai");
  revalidatePath("/admin/ai/floor");
}

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, 100) : "";
}

export type CrewActionResult = { ok: true } | { ok: false; error: string };

export async function confirmPlaybookAction(fd: FormData): Promise<CrewActionResult> {
  const sb = await requireAdmin();
  const businessId = text(fd, "business_id");
  if (!businessId) return { ok: false, error: "No business was given." };
  try {
    await confirmPlaybook(sb, businessId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not confirm the playbook." };
  }
  touch();
  return { ok: true };
}

export async function setCrewPausedAction(fd: FormData): Promise<CrewActionResult> {
  const sb = await requireAdmin();
  try {
    await setCrewPaused(sb, text(fd, "paused") === "true");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not change the pause." };
  }
  touch();
  return { ok: true };
}

export async function setAgentPausedAction(fd: FormData): Promise<CrewActionResult> {
  const sb = await requireAdmin();
  const slug = text(fd, "slug") as AgentSlug;
  if (!SLUGS.includes(slug)) return { ok: false, error: "No such bot." };
  try {
    await setAgentPaused(sb, slug, text(fd, "paused") === "true");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not change the pause." };
  }
  touch();
  return { ok: true };
}
