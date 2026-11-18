import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { googleConnection } from "@/lib/google/oauth";
import {
  MAILBOXES, getThread, gmailProfile, inboxUnread, listThreads, mailbox, modifyThread,
  type Address, type Thread, type ThreadSummary,
} from "@/lib/google/gmail";
import { matchEmails, type CrmMatch } from "@/lib/google/crm-match";
import { chicagoDate } from "@/lib/time/chicago";
import {
  archiveThreadAction, markUnreadAction, moveToInboxAction, sendNewEmailAction, sendReplyAction,
  toggleStarAction, trashThreadAction, untrashThreadAction,
} from "@/app/admin/gmail-actions";
import MailFrame from "@/components/admin/cc/inbox/MailFrame";
import SendButton from "@/components/admin/cc/inbox/SendButton";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/inbox/inbox.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

/**
 * Gmail for the business account, inside the admin.
 *
 * Read, reply, compose, archive, star and trash. Every send is a button press
 * and the button locks while it sends. Senders are matched against leads and
 * clients so a thread shows who it is with in CRM terms, and anything sent to
 * a lead from here lands on that lead's timeline.
 */

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

const TZ = "America/Chicago";

/** Today's time, this year's "Nov 12", older "Nov 12, 2025". */
function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  const today = chicagoDate();
  if (chicagoDate(at) === today) {
    return at.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  }
  const sameYear = chicagoDate(at).slice(0, 4) === today.slice(0, 4);
  return at.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function fullWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function names(list: Address[]): string {
  return list.map((a) => a.name || a.email).join(", ");
}

function size(bytes: number): string {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function href(base: Record<string, string>, extra: Record<string, string | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...extra })) if (v) p.set(k, v);
  const qs = p.toString();
  return `/admin/inbox${qs ? `?${qs}` : ""}`;
}

function Hidden({ base, thread }: { base: Record<string, string>; thread?: string }) {
  return (
    <>
      {base.box ? <input type="hidden" name="box" value={base.box} /> : null}
      {base.q ? <input type="hidden" name="q" value={base.q} /> : null}
      {thread ? <input type="hidden" name="thread_id" value={thread} /> : null}
    </>
  );
}

function CrmTag({ match }: { match: CrmMatch | undefined }) {
  if (!match) return null;
  return (
    <span className={`${styles.tag} ${match.kind === "client" ? styles.tagClient : styles.tagLead}`}>
      {match.kind === "client" ? "Client" : "Lead"} · {match.name}
    </span>
  );
}

function Setup({ state }: { state: "unconfigured" | "disconnected" | "nogmail" }) {
  return (
    <section className={`cc-panel ${styles.setup}`} style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Connect Gmail</h2>
      {state === "unconfigured" ? (
        <p className={fin.note}>The Google app keys are not set in Vercel yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
      ) : (
        <>
          <p className={fin.note}>
            {state === "nogmail"
              ? "Google is connected for the calendar only. Reconnect once to add Gmail."
              : "Sign in with tomorrowstechaisolutions@gmail.com to bring your inbox and calendar in here."}
          </p>
          <ol>
            <li>Click Connect and choose <b>tomorrowstechaisolutions@gmail.com</b>.</li>
            <li>Google says it hasn&apos;t verified the app. It&apos;s your own app: click <b>Advanced</b>, then <b>Go to Tomorrows Tech AI Admin</b>.</li>
            <li>Tick every permission and click <b>Continue</b>. You&apos;ll land back here.</li>
          </ol>
          <Link href="/api/google/oauth/start?next=/admin/inbox" className={styles.btnPrimary}>
            {state === "nogmail" ? "Reconnect Google" : "Connect Google"}
          </Link>
        </>
      )}
    </section>
  );
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const google = await googleConnection();
  const flash = (
    <>
      {one(params, "google") === "connected" ? <div className={fin.flashOk}>Google connected. Your inbox is below.</div> : null}
      {one(params, "google") && one(params, "google") !== "connected" ? (
        <div className={fin.flashErr}>{one(params, "detail") || "Google did not finish connecting. Try again."}</div>
      ) : null}
      {one(params, "notice") ? <div className={fin.flashOk}>{one(params, "notice")}</div> : null}
      {one(params, "error") ? <div className={fin.flashErr}>{one(params, "error")}</div> : null}
    </>
  );

  const header = (account?: string | null, unread?: number) => (
    <div className="cc-greet">
      <div>
        <h1>Inbox</h1>
        <p>{account ? `${account}${typeof unread === "number" ? ` · ${unread} unread in Inbox` : ""}` : "Your business Gmail, matched to your leads and clients."}</p>
      </div>
    </div>
  );

  if (!google.configured || !google.connected || !google.gmail) {
    return (
      <>
        {header()}
        {flash}
        <Setup state={!google.configured ? "unconfigured" : !google.connected ? "disconnected" : "nogmail"} />
      </>
    );
  }

  const box = mailbox(one(params, "box"));
  const q = one(params, "q").slice(0, 300);
  const pt = one(params, "pt");
  const threadId = one(params, "t");
  const compose = one(params, "compose") === "1";
  const images = one(params, "images") === "1";
  const base: Record<string, string> = { box: box.key === "inbox" ? "" : box.key, q };

  let me = google.account ?? "";
  let unread: number | undefined;
  let list: { threads: ThreadSummary[]; nextPageToken: string | null; estimate: number } = { threads: [], nextPageToken: null, estimate: 0 };
  let thread: Thread | null = null;
  let loadError: string | null = null;
  let threadError: string | null = null;

  try {
    const profile = await gmailProfile();
    me = profile.emailAddress.toLowerCase();
    const [l, u] = await Promise.all([
      listThreads({ box: box.key, q, pageToken: pt || undefined, me }),
      inboxUnread().catch(() => undefined),
    ]);
    list = l;
    unread = u;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Gmail could not be loaded.";
  }

  if (threadId && !loadError) {
    try {
      thread = await getThread(threadId);
      // Opening a conversation reads it, the same as Gmail.
      if (thread.unread) {
        await modifyThread(thread.id, [], ["UNREAD"]).catch(() => undefined);
        list.threads = list.threads.map((t) => (t.id === thread!.id ? { ...t, unread: false } : t));
      }
    } catch (err) {
      threadError = err instanceof Error ? err.message : "That conversation could not be opened.";
    }
  }

  const sb = await createSupabaseServerClient();
  const emails = [
    ...list.threads.flatMap((t) => [...t.from.map((a) => a.email), ...t.participants]),
    ...(thread?.messages.flatMap((m) => [...m.from, ...m.to, ...m.cc].map((a) => a.email)) ?? []),
  ].filter((e) => e !== me);
  const crm = await matchEmails(sb, emails).catch(() => new Map<string, CrmMatch>());

  const threadMatches = thread
    ? [...new Map(
        thread.messages.flatMap((m) => [...m.from, ...m.to, ...m.cc])
          .map((a) => crm.get(a.email))
          .filter((x): x is CrmMatch => Boolean(x))
          .map((x) => [x.id, x])
      ).values()]
    : [];

  const last = thread?.messages[thread.messages.length - 1];
  const others = new Set(
    (thread?.messages ?? []).flatMap((m) => [...m.from, ...m.to, ...m.cc]).map((a) => a.email).filter((e) => e !== me)
  );

  return (
    <>
      {header(me, unread)}
      {flash}

      <div className={styles.bar}>
        <nav className={styles.tabs} aria-label="Mailboxes">
          {MAILBOXES.map((m) => (
            <Link
              key={m.key}
              href={href({}, { box: m.key === "inbox" ? null : m.key })}
              className={`cc-chip ${box.key === m.key ? "t-info" : "t-muted"}`}
              style={{ textDecoration: "none" }}
            >
              {m.label}{m.key === "inbox" && unread ? ` · ${unread}` : ""}
            </Link>
          ))}
        </nav>
        <form className={styles.search} action="/admin/inbox">
          {base.box ? <input type="hidden" name="box" value={base.box} /> : null}
          <input type="search" name="q" defaultValue={q} placeholder="Search mail (Gmail search works: from:, has:attachment)" aria-label="Search mail" />
        </form>
        <Link href={href(base, { compose: "1" })} className={styles.btnPrimary}>Compose</Link>
      </div>

      {loadError ? <div className={fin.flashErr}>{loadError}</div> : null}

      <div className={styles.grid}>
        <section className={`${styles.list} ${thread || compose ? styles.hideNarrow : ""}`} aria-label="Conversations">
          <div className={styles.listHead}>
            <span>{box.label}{q ? ` · “${q}”` : ""}</span>
            <span>{list.threads.length ? `${list.threads.length} shown` : ""}</span>
          </div>
          {list.threads.length === 0 && !loadError ? (
            <div className={styles.empty}>{q ? "Nothing matches that search." : `Nothing in ${box.label}.`}</div>
          ) : null}
          {list.threads.map((t) => {
            const match = t.from.map((a) => crm.get(a.email)).find(Boolean)
              ?? t.participants.map((e) => crm.get(e)).find(Boolean);
            return (
              <Link
                key={t.id}
                href={href({ ...base, pt }, { t: t.id })}
                className={`${styles.row} ${t.unread ? styles.unread : ""} ${t.id === threadId ? styles.on : ""}`}
              >
                <span className={styles.who}>
                  {box.key === "sent" ? "To: " : ""}{names(t.from) || "(unknown)"}{t.count > 1 ? ` (${t.count})` : ""}
                </span>
                <span className={styles.when}>{t.starred ? "★ " : ""}{when(t.date)}</span>
                <span className={styles.subj}>{t.subject}</span>
                <span className={styles.snip}>{t.snippet}</span>
                {match || t.hasAttachment ? (
                  <span className={styles.meta}>
                    <CrmTag match={match} />
                    {t.hasAttachment ? <span className={styles.tag}>Attachment</span> : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
          {pt || list.nextPageToken ? (
            <div className={styles.pager}>
              {pt ? <Link href={href(base, {})} className="cc-link">← Newest</Link> : <span />}
              {list.nextPageToken ? <Link href={href(base, { pt: list.nextPageToken })} className="cc-link">Older →</Link> : null}
            </div>
          ) : null}
        </section>

        <section className={styles.reader} aria-label="Conversation">
          {compose ? (
            <>
              <div className={styles.readerHead}>
                <h2>New email</h2>
                <Link href={href(base, {})} className={styles.btn}>Cancel</Link>
              </div>
              <form action={sendNewEmailAction} className={styles.form}>
                <Hidden base={base} />
                <label>To<input type="text" name="to" defaultValue={one(params, "to")} placeholder="name@company.com, other@company.com" required /></label>
                <label>Cc<input type="text" name="cc" defaultValue={one(params, "cc")} /></label>
                <label>Subject<input type="text" name="subject" defaultValue={one(params, "subject")} required /></label>
                <label>Message<textarea name="body" rows={12} required /></label>
                <div className={styles.sendRow}>
                  <SendButton label="Send" busy="Sending…" className={styles.btnPrimary} />
                  <small>Sends from {me} through Gmail, so it shows in your Sent folder.</small>
                </div>
              </form>
            </>
          ) : threadError ? (
            <p className={fin.flashErr}>{threadError}</p>
          ) : thread ? (
            <>
              <div className={styles.readerHead}>
                <h2>{thread.subject}</h2>
                <div className={styles.actions}>
                  <Link href={href({ ...base, pt }, {})} className={styles.btn}>← Back</Link>
                  {thread.inTrash ? (
                    <form action={untrashThreadAction}><Hidden base={base} thread={thread.id} /><button className={styles.btn}>Restore</button></form>
                  ) : thread.inInbox ? (
                    <form action={archiveThreadAction}><Hidden base={base} thread={thread.id} /><button className={styles.btn}>Archive</button></form>
                  ) : (
                    <form action={moveToInboxAction}><Hidden base={base} thread={thread.id} /><button className={styles.btn}>Move to Inbox</button></form>
                  )}
                  <form action={toggleStarAction}>
                    <Hidden base={base} thread={thread.id} />
                    <input type="hidden" name="starred" value={thread.starred ? "1" : "0"} />
                    <button className={styles.btn}>{thread.starred ? "★ Starred" : "☆ Star"}</button>
                  </form>
                  <form action={markUnreadAction}><Hidden base={base} thread={thread.id} /><button className={styles.btn}>Mark unread</button></form>
                  {!thread.inTrash ? (
                    <form action={trashThreadAction}><Hidden base={base} thread={thread.id} /><button className={styles.btn}>Trash</button></form>
                  ) : null}
                </div>
              </div>

              {threadMatches.length ? (
                <div className={styles.crm}>
                  In your CRM:
                  {threadMatches.map((m) => (
                    <Link key={m.id} href={m.href} className={`${styles.tag} ${m.kind === "client" ? styles.tagClient : styles.tagLead}`} style={{ textDecoration: "none" }}>
                      {m.kind === "client" ? "Client" : "Lead"} · {m.name} →
                    </Link>
                  ))}
                </div>
              ) : null}

              {thread.messages.some((m) => m.html) && !images ? (
                <p className={styles.imgNote}>
                  Remote images are blocked so senders can&apos;t tell you opened this.{" "}
                  <Link href={href({ ...base, pt }, { t: thread.id, images: "1" })} className="cc-link">Show images</Link>
                </p>
              ) : null}

              {thread.messages.map((m, i) => (
                <details key={m.id} className={styles.msg} open={i === thread!.messages.length - 1 || m.unread}>
                  <summary>
                    <span className={styles.msgFrom}>
                      {m.from[0]?.name || m.from[0]?.email || "(unknown)"}
                      {m.from[0]?.name ? <span>{m.from[0].email}</span> : null}
                    </span>
                    <span className={styles.msgDate}>{fullWhen(m.date)}</span>
                    <span className={styles.msgTo}>
                      to {names(m.to) || "(no recipients)"}{m.cc.length ? ` · cc ${names(m.cc)}` : ""}
                    </span>
                    <span className={styles.msgSnip}>{(m.text || "").replace(/\s+/g, " ").slice(0, 140)}</span>
                  </summary>
                  <div className={styles.msgBody}>
                    {m.html ? <MailFrame html={m.html} images={images} /> : <pre className={styles.plain}>{m.text || "(no text)"}</pre>}
                    {m.attachments.length ? (
                      <div className={styles.files}>
                        {m.attachments.map((a) => (
                          <a
                            key={a.attachmentId}
                            className={styles.file}
                            href={`/api/admin/gmail/attachment?t=${encodeURIComponent(thread!.id)}&m=${encodeURIComponent(m.id)}&a=${encodeURIComponent(a.attachmentId)}`}
                          >
                            📎 {a.filename} · {size(a.size)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}

              {last && !thread.inTrash ? (
                <form action={sendReplyAction} className={styles.form}>
                  <Hidden base={base} thread={thread.id} />
                  <label>
                    Reply to {names(last.from.some((a) => a.email === me) ? last.to : last.replyTo.length ? last.replyTo : last.from)}
                    <textarea name="body" rows={7} required placeholder="Write your reply…" />
                  </label>
                  {others.size > 1 ? (
                    <label className={styles.check}><input type="checkbox" name="reply_all" value="1" /> Reply to everyone on the thread ({others.size} people)</label>
                  ) : null}
                  <div className={styles.sendRow}>
                    <SendButton label="Send reply" busy="Sending…" className={styles.btnPrimary} />
                    <small>Goes out from {me} in this same Gmail thread.</small>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>
              Pick a conversation to read it, or <Link href={href(base, { compose: "1" })} className="cc-link">write a new email</Link>.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
