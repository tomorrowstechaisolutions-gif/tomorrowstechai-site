/** Row shapes for migration 0022. Plain types — no client, no server-only. */

import type { RequestStatus } from "./config";

export type ClientRequest = {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  proposal_id: string | null;

  template_key: string;
  title: string;
  summary: string | null;

  token: string;
  token_expires_at: string;

  status: RequestStatus;

  to_email: string;
  to_name: string | null;
  note: string | null;
  due_at: string | null;

  delivered: boolean;
  sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;

  reminder_count: number;
  last_reminded_at: string | null;

  steps_done: string[];
  payload: Record<string, string>;

  created_at: string;
  updated_at: string;
};

export type ClientRequestEvent = {
  id: string;
  request_id: string;
  kind:
    | "created" | "sent" | "send_failed" | "opened"
    | "saved" | "submitted" | "reminded" | "canceled" | "reopened";
  detail: string | null;
  meta: Record<string, unknown>;
  at: string;
};
