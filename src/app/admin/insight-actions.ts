"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateInsights } from "@/lib/insights/generate";

const PAGE = "/admin/ai/insights";

async function requireAdmin() {
  if (!(await getAdminUser())) redirect("/admin/login");
}

function back(message: string, error = false): never {
  revalidatePath(PAGE);
  revalidatePath("/admin");
  redirect(`${PAGE}?${new URLSearchParams({ [error ? "error" : "notice"]: message })}`);
}

/** Runs the generator now instead of waiting for Monday. */
export async function generateInsightsAction() {
  await requireAdmin();
  let msg: string;
  try {
    const r = await generateInsights(supabaseAdmin());
    msg = r.created
      ? `${r.created} new insight${r.created === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} repeat${r.skipped === 1 ? "" : "s"} skipped)` : ""}.`
      : r.skipped ? "Nothing new: everything it found was already said in the last two weeks." : "Nothing worth saying right now. That's a valid answer.";
  } catch (cause) {
    back(cause instanceof Error ? cause.message : "Generating insights failed.", true);
  }
  back(msg);
}

/** Sets an insight's status: dismissed, seen, or back to new. */
export async function setInsightStatusAction(fd: FormData) {
  await requireAdmin();
  const id = fd.get("id");
  const status = fd.get("status");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || typeof status !== "string" || !["new", "seen", "dismissed"].includes(status)) back("That change isn't valid.", true);
  const { error } = await supabaseAdmin().from("ai_insights").update({ status }).eq("id", id);
  if (error) back(error.message, true);
  back(status === "dismissed" ? "Dismissed." : status === "new" ? "Restored." : "Marked as done.");
}
