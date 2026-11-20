"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { removeNote, saveTessSettings } from "@/lib/crew/profile";
import { confirmPlaybook, setAgentPaused, setCrewPaused } from "@/lib/crew/setup";
import { summarizeDay } from "@/lib/crew/summaries";
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

async function requireAdminUser() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { sb: supabaseAdmin(), userId: session.user.id };
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

/** The mode and dials on Tess's profile, for the admin who is signed in. */
export async function setTessSettingsAction(fd: FormData): Promise<CrewActionResult> {
  const { sb, userId } = await requireAdminUser();
  try {
    await saveTessSettings(sb, userId, { mode: text(fd, "mode"), length: text(fd, "length"), bluntness: text(fd, "bluntness"), pushback: text(fd, "pushback") });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save that." };
  }
  touch();
  return { ok: true };
}

/** Remove one line Tess saved: something she learned, or an idea she parked. */
export async function removeTessNoteAction(fd: FormData): Promise<CrewActionResult> {
  const { sb, userId } = await requireAdminUser();
  const list = text(fd, "list");
  const id = text(fd, "id");
  if ((list !== "learned" && list !== "parked") || !id) return { ok: false, error: "No such note." };
  try {
    await removeNote(sb, userId, list, id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not remove that." };
  }
  touch();
  return { ok: true };
}

/** Summarise one day of chat now, from the archive page. Does nothing for a date that is not a date. */
export async function summarizeDayAction(fd: FormData): Promise<void> {
  const { sb, userId } = await requireAdminUser();
  const date = text(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  try {
    await summarizeDay(sb, userId, date);
  } catch (err) {
    console.error("[tess] could not summarise the day:", err instanceof Error ? err.message : err);
  }
  revalidatePath("/admin/ai/archive");
}
