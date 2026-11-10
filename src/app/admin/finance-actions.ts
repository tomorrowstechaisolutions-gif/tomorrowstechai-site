"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { syncMercury } from "@/lib/finance/mercury";

const FINANCE = "/admin/finance";
const CLASSES = ["revenue", "expense", "transfer", "ignore", "auto"] as const;

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return session;
}

function back(fd: FormData, message: string, error = false): never {
  revalidatePath(FINANCE);
  const range = fd.get("range");
  const params = new URLSearchParams({ [error ? "error" : "notice"]: message });
  if (typeof range === "string" && range) params.set("range", range);
  redirect(`${FINANCE}?${params}`);
}

/** Pulls Mercury now instead of waiting for the 3-hourly cron. */
export async function syncBankAction(fd: FormData) {
  await requireAdmin();
  let message: string;
  let failed = false;
  try {
    const r = await syncMercury();
    message = `Mercury synced: ${r.accounts} account${r.accounts === 1 ? "" : "s"}, ${r.transactions} transactions (${r.inserted} new).`;
  } catch (cause) {
    failed = true;
    message = cause instanceof Error ? cause.message : "Mercury sync failed.";
  }
  back(fd, message, failed);
}

/** Overrides how Finance counts one bank transaction. "auto" clears the override. */
export async function reclassifyBankTxnAction(fd: FormData) {
  await requireAdmin();
  const id = fd.get("id");
  const value = fd.get("class");
  if (typeof id !== "string" || !id || typeof value !== "string" || !(CLASSES as readonly string[]).includes(value)) back(fd, "That change isn't valid.", true);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("bank_transactions").update({ class_override: value === "auto" ? null : value }).eq("id", id);
  if (error) back(fd, error.message, true);
  back(fd, value === "auto" ? "Back to automatic." : `Counted as ${value}.`);
}
