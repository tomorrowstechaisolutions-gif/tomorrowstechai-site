"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTemplate } from "@/lib/requests/config";
import {
  cancelRequest, createRequest, extendRequest, getRequestById,
} from "@/lib/requests/service";
import { sendReminderEmail, sendRequestEmail } from "@/lib/requests/emails";

/**
 * Writes for the client action requests.
 *
 * The admin check comes first on every call, then the work runs through the
 * service layer — which uses the service role, the same way the intake
 * actions in actions.ts do. The reason is the same too: these rows are also
 * written by token-keyed routes with no logged-in user, and one code path
 * that behaves identically whether a person or a webhook triggered it is
 * worth more here than a second RLS-scoped copy of every function.
 */
async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return session;
}

function str(fd: FormData, key: string, max = 2000): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const CLIENTS = "/admin/clients";

function revalidateFor(customerId: string | null) {
  revalidatePath(CLIENTS);
  if (customerId) revalidatePath(`${CLIENTS}/${customerId}`);
}

/**
 * The button this whole feature exists for: ask a client for one thing.
 *
 * Creates the row and sends in the same call. A draft that nobody remembers
 * to send is worse than no feature at all — the point is that asking costs
 * one click.
 */
export async function sendClientRequest(formData: FormData) {
  await requireAdmin();

  const templateKey = str(formData, "template_key", 60);
  const template = getTemplate(templateKey);
  if (!template) return;

  const customerId = str(formData, "customer_id", 40) || null;
  const email = str(formData, "to_email", 320).toLowerCase();
  if (!email) return;

  const dueDays = Number.parseInt(str(formData, "due_days", 4), 10);
  const dueAt =
    Number.isInteger(dueDays) && dueDays > 0
      ? new Date(Date.now() + dueDays * 86_400_000).toISOString()
      : null;

  const loaded = await createRequest({
    templateKey: template.key,
    toEmail: email,
    toName: str(formData, "to_name", 200) || null,
    customerId,
    jobId: str(formData, "job_id", 40) || null,
    note: str(formData, "note", 1500) || null,
    dueAt,
  });

  await sendRequestEmail(loaded);
  revalidateFor(customerId);
}

/** The nudge. Same link, shorter message. */
export async function remindClientRequest(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "request_id", 40);
  const loaded = id ? await getRequestById(id) : null;
  if (!loaded) return;

  await sendReminderEmail(loaded);
  revalidateFor(loaded.request.customer_id);
}

/** Sends the original again — for a client who deleted the email. */
export async function resendClientRequest(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "request_id", 40);
  const loaded = id ? await getRequestById(id) : null;
  if (!loaded) return;

  // A link that has gone cold is the most likely reason for a resend, so
  // push the expiry out before the email quotes a date in the past.
  await extendRequest(loaded.request.id);
  const fresh = await getRequestById(id);
  if (fresh) await sendRequestEmail(fresh);

  revalidateFor(loaded.request.customer_id);
}

export async function cancelClientRequest(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "request_id", 40);
  const loaded = id ? await getRequestById(id) : null;
  if (!loaded) return;

  await cancelRequest(id, str(formData, "reason", 500) || "No longer needed");
  revalidateFor(loaded.request.customer_id);
}

/**
 * They did it, just not here.
 *
 * Half of these get done on the phone while John talks someone through it,
 * and a tracker that cannot record that is a tracker people stop trusting.
 * No client email goes out — they already know, they were on the call.
 */
export async function completeRequestForClient(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "request_id", 40);
  const loaded = id ? await getRequestById(id) : null;
  if (!loaded) return;

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  await db
    .from("client_requests")
    .update({ status: "completed", completed_at: now })
    .eq("id", id);

  await db.from("client_request_events").insert({
    request_id: id,
    kind: "submitted",
    detail: str(formData, "how", 300) || "Marked done by John — handled outside the link",
  });

  revalidateFor(loaded.request.customer_id);
}
