"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  getThread, gmailProfile, modifyThread, parseAddresses, sendMail, trashThread, untrashThread,
  type Address,
} from "@/lib/google/gmail";
import { matchEmails } from "@/lib/google/crm-match";

/**
 * Every write the Inbox page makes. Each one runs because a button was
 * clicked; nothing here is called by a cron or an AI step.
 *
 * Reply headers are rebuilt from the thread on the server rather than taken
 * from the form, so a reply always threads correctly and always goes to the
 * people actually on the thread.
 */

const PAGE = "/admin/inbox";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return { actor: session.admin.email };
}

function str(fd: FormData, key: string, max = 20000): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Back to where the click came from, keeping the mailbox and search. */
function back(fd: FormData, extra: Record<string, string>): never {
  const params = new URLSearchParams();
  for (const key of ["box", "q"]) {
    const v = str(fd, key, 500);
    if (v) params.set(key, v);
  }
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  redirect(`${PAGE}${qs ? `?${qs}` : ""}`);
}

function fail(fd: FormData, err: unknown, keep: Record<string, string> = {}): never {
  const message = err instanceof Error ? err.message : "Gmail did not accept that.";
  back(fd, { ...keep, error: message.slice(0, 300) });
}

function addresses(value: string): Address[] {
  return parseAddresses(value.replace(/;/g, ","));
}

/** Writes the sent email onto every matching lead's timeline. */
async function logToLeads(recipients: string[], subject: string, threadId: string, actor: string) {
  try {
    const sb = await createSupabaseServerClient();
    const matches = await matchEmails(sb, recipients);
    const leads = [...matches.values()].filter((m) => m.kind === "lead");
    if (!leads.length) return;
    await sb.from("lead_events").insert(
      leads.map((m) => ({
        lead_id: m.id,
        type: "email_sent",
        body: `Emailed from Gmail: ${subject}`.slice(0, 500),
        actor,
        meta: { source: "gmail", thread_id: threadId },
      }))
    );
  } catch {
    // The email went; the timeline note is a courtesy.
  }
}

// ── Thread state ──────────────────────────────────────────────────────

export async function archiveThreadAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  try {
    await modifyThread(id, [], ["INBOX"]);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { notice: "Archived." });
}

export async function moveToInboxAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  try {
    await modifyThread(id, ["INBOX"], []);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { t: id, notice: "Moved to Inbox." });
}

export async function markUnreadAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  try {
    await modifyThread(id, ["UNREAD"], []);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { notice: "Marked unread." });
}

export async function toggleStarAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  const starred = str(fd, "starred", 5) === "1";
  try {
    await modifyThread(id, starred ? [] : ["STARRED"], starred ? ["STARRED"] : []);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { t: id });
}

export async function trashThreadAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  try {
    await trashThread(id);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { notice: "Moved to Trash. Gmail keeps it there for 30 days." });
}

export async function untrashThreadAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "thread_id", 100);
  try {
    await untrashThread(id);
  } catch (err) {
    fail(fd, err, { t: id });
  }
  revalidatePath(PAGE);
  back(fd, { t: id, notice: "Restored from Trash." });
}

// ── Sending ───────────────────────────────────────────────────────────

export async function sendReplyAction(fd: FormData) {
  const { actor } = await requireAdmin();
  const id = str(fd, "thread_id", 100);
  const text = str(fd, "body");
  const replyAll = str(fd, "reply_all", 5) === "1";
  if (!text) back(fd, { t: id, error: "The reply is empty." });

  let sentSubject = "";
  let recipients: string[] = [];
  try {
    const [thread, profile] = await Promise.all([getThread(id), gmailProfile()]);
    const me = profile.emailAddress.toLowerCase();
    const last = thread.messages[thread.messages.length - 1];
    if (!last) throw new Error("That thread has no messages to reply to.");

    const fromMe = last.from.some((a) => a.email === me);
    const primary = fromMe ? last.to : last.replyTo.length ? last.replyTo : last.from;
    const to = primary.filter((a) => a.email !== me);
    const cc = replyAll
      ? [...(fromMe ? [] : last.to), ...last.cc].filter(
          (a) => a.email !== me && !to.some((t) => t.email === a.email)
        )
      : [];
    if (!to.length) throw new Error("There is nobody to reply to on this thread.");

    const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
    await sendMail({
      from: { name: null, email: me },
      to,
      cc,
      subject,
      text,
      threadId: thread.id,
      inReplyTo: last.messageIdHeader || undefined,
      references: last.references || undefined,
    });
    sentSubject = subject;
    recipients = [...to, ...cc].map((a) => a.email);
  } catch (err) {
    fail(fd, err, { t: id });
  }

  await logToLeads(recipients, sentSubject, id, actor);
  revalidatePath(PAGE);
  back(fd, { t: id, notice: "Reply sent." });
}

export async function sendNewEmailAction(fd: FormData) {
  const { actor } = await requireAdmin();
  const to = addresses(str(fd, "to", 2000));
  const cc = addresses(str(fd, "cc", 2000));
  const subject = str(fd, "subject", 300);
  const text = str(fd, "body");

  const keep = { compose: "1", to: str(fd, "to", 2000), cc: str(fd, "cc", 2000), subject };
  if (!to.length) back(fd, { ...keep, error: "Add at least one recipient." });
  if (!subject) back(fd, { ...keep, error: "Add a subject." });
  if (!text) back(fd, { ...keep, error: "The message is empty." });

  let threadId = "";
  try {
    const profile = await gmailProfile();
    const sent = await sendMail({
      from: { name: null, email: profile.emailAddress },
      to,
      cc,
      subject,
      text,
    });
    threadId = sent.threadId;
  } catch (err) {
    fail(fd, err, keep);
  }

  await logToLeads([...to, ...cc].map((a) => a.email), subject, threadId, actor);
  revalidatePath(PAGE);
  back(fd, { t: threadId, notice: "Sent." });
}
