import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTemplate, STATUS_RANK, OPEN_STATUSES,
  type RequestStatus, type RequestTemplate,
} from "./config";
import type { ClientRequest } from "./types";

/**
 * The admin's view of what has been asked of clients.
 *
 * Read through the caller's authenticated client, not the service role — the
 * admin is a logged-in user and RLS is the check. Only the client's own
 * tokenised routes use the service role.
 */

export type RequestRow = {
  request: ClientRequest;
  template: RequestTemplate | null;
  status: RequestStatus;
  /** Days since it was sent, null if it never was. */
  waitingDays: number | null;
  overdue: boolean;
  stepsDone: number;
  stepsTotal: number;
  /** True once it has sat unanswered long enough to be worth a nudge. */
  nudgeable: boolean;
};

const DAY = 86_400_000;

function days(from: string | null, now: number): number | null {
  return from === null ? null : Math.floor((now - new Date(from).getTime()) / DAY);
}

function decorate(row: ClientRequest, now: number): RequestRow {
  const template = getTemplate(row.template_key);
  const waitingDays = days(row.sent_at, now);
  const open = OPEN_STATUSES.includes(row.status);

  // A nudge is worth sending after four days of silence, and never twice in
  // the same three days. Both numbers are here rather than in the UI so the
  // button and any future scheduled job cannot disagree about them.
  const sinceNudge = days(row.last_reminded_at, now);
  const nudgeable =
    open && (waitingDays ?? 0) >= 4 && (sinceNudge === null || sinceNudge >= 3);

  return {
    request: row,
    template,
    status: row.status,
    waitingDays,
    overdue: open && row.due_at !== null && new Date(row.due_at).getTime() < now,
    stepsDone: row.steps_done.length,
    stepsTotal: template?.steps.length ?? 0,
    nudgeable,
  };
}

const COLUMNS =
  "id, customer_id, lead_id, job_id, proposal_id, template_key, title, summary, " +
  "token, token_expires_at, status, to_email, to_name, note, due_at, delivered, " +
  "sent_at, first_opened_at, last_opened_at, completed_at, canceled_at, " +
  "reminder_count, last_reminded_at, steps_done, payload, created_at, updated_at";

function hydrate(rows: unknown[] | null, now: number): RequestRow[] {
  return (rows ?? [])
    .map((r) => {
      const row = r as ClientRequest;
      return {
        ...row,
        steps_done: Array.isArray(row.steps_done) ? row.steps_done : [],
        payload: row.payload && typeof row.payload === "object" ? row.payload : {},
      };
    })
    .map((row) => decorate(row, now))
    .sort((a, b) => {
      const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rank !== 0) return rank;
      return (
        new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime()
      );
    });
}

export type ClientRequestBoard = {
  rows: RequestRow[];
  open: number;
  overdue: number;
  /** The one sentence the panel header shows. */
  headline: string;
};

export async function loadClientRequests(
  sb: SupabaseClient,
  customerId: string,
  now = Date.now()
): Promise<ClientRequestBoard> {
  const { data } = await sb
    .from("client_requests")
    .select(COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = hydrate(data, now);
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const overdue = rows.filter((r) => r.overdue).length;

  const headline =
    rows.length === 0
      ? "Nothing asked of them yet"
      : open === 0
        ? "Nothing outstanding — the ball is with us"
        : `${open} thing${open === 1 ? "" : "s"} waiting on them`;

  return { rows, open, overdue, headline };
}

/**
 * Everything currently sitting with a client, newest first. Feeds the
 * dashboard's "waiting on someone else" view; also what a future scheduled
 * nudge would iterate.
 */
export async function loadOpenRequests(
  sb: SupabaseClient,
  now = Date.now()
): Promise<RequestRow[]> {
  const { data } = await sb
    .from("client_requests")
    .select(COLUMNS)
    .in("status", OPEN_STATUSES)
    .order("sent_at", { ascending: true })
    .limit(200);

  return hydrate(data, now);
}
