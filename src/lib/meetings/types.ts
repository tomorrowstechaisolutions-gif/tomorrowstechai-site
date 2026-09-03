/**
 * Hand-written row types for the meetings tables.
 * Kept in sync with supabase/migrations/0020_meetings.sql.
 */

import type {
  MeetingOutcome, MeetingProviderKey, MeetingStatus, MeetingType,
} from "./config";

export type MeetingAttendee = { email: string; name?: string | null };

export type Meeting = {
  id: string;

  lead_id: string | null;
  customer_id: string | null;
  company_id: string | null;
  job_id: string | null;
  proposal_id: string | null;

  title: string;
  meeting_type: MeetingType;
  description: string | null;
  agenda: string | null;
  location: string | null;

  provider: MeetingProviderKey;
  provider_event_id: string | null;
  provider_calendar_id: string | null;
  meeting_url: string | null;
  provider_metadata: Record<string, unknown>;
  provider_synced_at: string | null;
  provider_error: string | null;

  start_at: string;
  end_at: string;
  duration_minutes: number;
  timezone: string;

  status: MeetingStatus;

  attendee_name: string | null;
  attendee_email: string | null;
  attendee_phone: string | null;
  extra_attendees: MeetingAttendee[];

  internal_notes: string | null;
  outcome: MeetingOutcome | null;
  next_steps: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  follow_up_task_id: string | null;

  reschedule_count: number;
  original_start_at: string | null;
  cancel_reason: string | null;

  owner: string | null;
  created_by: string | null;

  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

/**
 * A meeting plus the names of the records it points at.
 *
 * Resolved in one pass for a whole page rather than per row, the same way
 * lib/calendar/service.ts enriches its items — a list of twenty meetings must
 * not be twenty round trips for twenty business names.
 */
export type MeetingWithLinks = Meeting & {
  contactName: string | null;
  companyName: string | null;
  contactHref: string | null;
  proposalNumber: string | null;
  projectName: string | null;
};

/** Who a meeting is being scheduled with, resolved before the form opens. */
export type MeetingContact = {
  leadId: string | null;
  customerId: string | null;
  companyId: string | null;
  jobId: string | null;
  proposalId: string | null;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  /** Where "open the record" goes. */
  href: string | null;
  /** Two initials for the avatar, when there is no image anywhere. */
  initials: string;
};

export type MeetingKpis = {
  today: number;
  upcoming: number;
  completedThisMonth: number;
  followUpsRequired: number;
};
