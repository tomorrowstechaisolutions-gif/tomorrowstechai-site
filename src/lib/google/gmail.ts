import "server-only";
import { googleAccessToken } from "@/lib/google/oauth";

/**
 * Gmail, over plain fetch like the rest of the Google code.
 *
 * Everything runs server-side with the stored token; the browser never sees
 * a token or talks to Google. Nothing here sends or changes mail on its own:
 * every write is called from a server action that a person clicked.
 */

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {}

async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = await googleAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Gmail returned ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep the status message
    }
    if (res.status === 403 && /insufficient/i.test(message)) {
      message = "This Google connection has no Gmail permission. Reconnect Google in Settings.";
    }
    throw new GmailError(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Mailboxes ─────────────────────────────────────────────────────────

export const MAILBOXES = [
  { key: "inbox", label: "Inbox", labelIds: ["INBOX"], q: "" },
  { key: "unread", label: "Unread", labelIds: ["INBOX", "UNREAD"], q: "" },
  { key: "starred", label: "Starred", labelIds: ["STARRED"], q: "" },
  { key: "sent", label: "Sent", labelIds: ["SENT"], q: "" },
  { key: "all", label: "All mail", labelIds: [], q: "-in:spam -in:trash" },
  { key: "trash", label: "Trash", labelIds: ["TRASH"], q: "" },
] as const;

export type MailboxKey = (typeof MAILBOXES)[number]["key"];

export function mailbox(key: string | undefined) {
  return MAILBOXES.find((m) => m.key === key) ?? MAILBOXES[0];
}

// ── Parsing ───────────────────────────────────────────────────────────

type Header = { name: string; value: string };
type Part = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
};
type RawMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};
type RawThread = { id: string; snippet?: string; historyId?: string; messages?: RawMessage[] };

function header(headers: Header[] | undefined, name: string): string {
  const lower = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

function decode(data: string | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export type Address = { name: string | null; email: string };

/** "Dana Ortiz" <dana@x.com>, other@y.com → two addresses. */
export function parseAddresses(value: string): Address[] {
  const out: Address[] = [];
  // Split on commas that are not inside quotes.
  const parts = value.match(/(?:"[^"]*"|[^,])+/g) ?? [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const angle = part.match(/^(.*)<([^>]+)>\s*$/);
    if (angle) {
      const name = angle[1].trim().replace(/^"|"$/g, "").trim();
      out.push({ name: name || null, email: angle[2].trim().toLowerCase() });
    } else if (part.includes("@")) {
      out.push({ name: null, email: part.toLowerCase() });
    }
  }
  return out;
}

export type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  from: Address[];
  /** Everyone other than the connected account who is on the thread. */
  participants: string[];
  date: string | null;
  count: number;
  unread: boolean;
  starred: boolean;
  inInbox: boolean;
  hasAttachment: boolean;
};

export type Attachment = { messageId: string; attachmentId: string; filename: string; mimeType: string; size: number };

export type Message = {
  id: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  replyTo: Address[];
  subject: string;
  date: string | null;
  messageIdHeader: string;
  references: string;
  text: string;
  html: string;
  attachments: Attachment[];
  unread: boolean;
};

export type Thread = {
  id: string;
  subject: string;
  messages: Message[];
  unread: boolean;
  starred: boolean;
  inInbox: boolean;
  inTrash: boolean;
};

function walk(part: Part | undefined, messageId: string, acc: { text: string; html: string; attachments: Attachment[] }) {
  if (!part) return;
  const type = (part.mimeType ?? "").toLowerCase();
  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({
      messageId,
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  } else if (type === "text/plain" && !acc.text) {
    acc.text = decode(part.body?.data);
  } else if (type === "text/html" && !acc.html) {
    acc.html = decode(part.body?.data);
  }
  for (const child of part.parts ?? []) walk(child, messageId, acc);
}

function toMessage(raw: RawMessage): Message {
  const h = raw.payload?.headers;
  const acc = { text: "", html: "", attachments: [] as Attachment[] };
  walk(raw.payload, raw.id, acc);
  return {
    id: raw.id,
    from: parseAddresses(header(h, "From")),
    to: parseAddresses(header(h, "To")),
    cc: parseAddresses(header(h, "Cc")),
    replyTo: parseAddresses(header(h, "Reply-To")),
    subject: header(h, "Subject"),
    date: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : null,
    messageIdHeader: header(h, "Message-ID") || header(h, "Message-Id"),
    references: header(h, "References"),
    text: acc.text,
    html: acc.html,
    attachments: acc.attachments,
    unread: (raw.labelIds ?? []).includes("UNREAD"),
  };
}

function hasAttachmentPart(part: Part | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.body?.attachmentId) return true;
  if ((part.mimeType ?? "").toLowerCase() === "multipart/mixed") return true;
  return (part.parts ?? []).some(hasAttachmentPart);
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function gmailProfile(): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number }> {
  return gmail("/profile");
}

/** Unread count in the inbox, for the KPI and the sidebar. */
export async function inboxUnread(): Promise<number> {
  const label = await gmail<{ threadsUnread?: number }>("/labels/INBOX");
  return label.threadsUnread ?? 0;
}

export async function listThreads(input: {
  box: MailboxKey;
  q?: string;
  pageToken?: string;
  me: string;
  max?: number;
}): Promise<{ threads: ThreadSummary[]; nextPageToken: string | null; estimate: number }> {
  const box = mailbox(input.box);
  const params = new URLSearchParams({ maxResults: String(input.max ?? 25) });
  for (const id of box.labelIds) params.append("labelIds", id);
  const q = [box.q, input.q ?? ""].filter(Boolean).join(" ").trim();
  if (q) params.set("q", q);
  if (input.pageToken) params.set("pageToken", input.pageToken);
  if (box.key === "trash") params.set("includeSpamTrash", "true");

  const list = await gmail<{ threads?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
    `/threads?${params.toString()}`
  );

  const meta = new URLSearchParams({ format: "metadata" });
  for (const name of ["From", "To", "Cc", "Subject", "Date"]) meta.append("metadataHeaders", name);

  const threads = await Promise.all(
    (list.threads ?? []).map(async ({ id }) => {
      const t = await gmail<RawThread>(`/threads/${id}?${meta.toString()}`);
      const messages = t.messages ?? [];
      const first = messages[0];
      const last = messages[messages.length - 1];
      const labels = new Set(messages.flatMap((m) => m.labelIds ?? []));
      const people = new Set<string>();
      for (const m of messages) {
        for (const name of ["From", "To", "Cc"]) {
          for (const a of parseAddresses(header(m.payload?.headers, name))) {
            if (a.email !== input.me) people.add(a.email);
          }
        }
      }
      // The list shows who the thread is with: the latest sender who is not me,
      // or, in Sent, who I wrote to.
      const lastOther = [...messages].reverse()
        .map((m) => parseAddresses(header(m.payload?.headers, "From")))
        .find((from) => from.some((a) => a.email !== input.me));
      const from = box.key === "sent"
        ? parseAddresses(header(last?.payload?.headers, "To"))
        : lastOther ?? parseAddresses(header(last?.payload?.headers, "From"));
      return {
        id: t.id,
        subject: header(first?.payload?.headers, "Subject") || "(no subject)",
        snippet: last?.snippet ? decodeEntities(last.snippet) : "",
        from,
        participants: [...people],
        date: last?.internalDate ? new Date(Number(last.internalDate)).toISOString() : null,
        count: messages.length,
        unread: labels.has("UNREAD"),
        starred: labels.has("STARRED"),
        inInbox: labels.has("INBOX"),
        hasAttachment: messages.some((m) => hasAttachmentPart(m.payload)),
      } satisfies ThreadSummary;
    })
  );

  return { threads, nextPageToken: list.nextPageToken ?? null, estimate: list.resultSizeEstimate ?? threads.length };
}

export async function getThread(id: string): Promise<Thread> {
  const t = await gmail<RawThread>(`/threads/${encodeURIComponent(id)}?format=full`);
  const messages = (t.messages ?? []).map(toMessage);
  const labels = new Set((t.messages ?? []).flatMap((m) => m.labelIds ?? []));
  return {
    id: t.id,
    subject: messages[0]?.subject || "(no subject)",
    messages,
    unread: labels.has("UNREAD"),
    starred: labels.has("STARRED"),
    inInbox: labels.has("INBOX"),
    inTrash: labels.has("TRASH"),
  };
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const data = await gmail<{ data?: string }>(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return Buffer.from((data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// ── Writes (each called only from a click) ────────────────────────────

export async function modifyThread(id: string, add: string[], remove: string[]): Promise<void> {
  await gmail(`/threads/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

/** Moves to Trash (Gmail empties it after 30 days). Never a permanent delete. */
export async function trashThread(id: string): Promise<void> {
  await gmail(`/threads/${encodeURIComponent(id)}/trash`, { method: "POST" });
}

export async function untrashThread(id: string): Promise<void> {
  await gmail(`/threads/${encodeURIComponent(id)}/untrash`, { method: "POST" });
}

function encodeWord(value: string): string {
  // RFC 2047, so a subject or name with an apostrophe or emoji survives.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function formatAddress(a: Address): string {
  if (!a.name) return a.email;
  const name = a.name.replace(/["\\]/g, "");
  // A name with a comma ("Ortiz, Dana") must be quoted or it splits into two addresses.
  const shown = /^[\x20-\x7e]*$/.test(name) ? `"${name}"` : encodeWord(name);
  return `${shown} <${a.email}>`;
}

export type OutgoingMail = {
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
};

export function buildMime(mail: OutgoingMail): string {
  const lines = [
    `From: ${formatAddress(mail.from)}`,
    `To: ${mail.to.map(formatAddress).join(", ")}`,
    ...(mail.cc?.length ? [`Cc: ${mail.cc.map(formatAddress).join(", ")}`] : []),
    `Subject: ${encodeWord(mail.subject)}`,
    ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`] : []),
    ...(mail.inReplyTo || mail.references
      ? [`References: ${[mail.references, mail.inReplyTo].filter(Boolean).join(" ").trim()}`]
      : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(mail.text.replace(/\r?\n/g, "\r\n"), "utf-8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ];
  return lines.join("\r\n");
}

export async function sendMail(mail: OutgoingMail): Promise<{ id: string; threadId: string }> {
  if (!mail.to.length) throw new GmailError("Add at least one recipient.");
  const raw = Buffer.from(buildMime(mail), "utf-8").toString("base64url");
  return gmail("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, ...(mail.threadId ? { threadId: mail.threadId } : {}) }),
  });
}

/** Gmail snippets arrive HTML-escaped. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
