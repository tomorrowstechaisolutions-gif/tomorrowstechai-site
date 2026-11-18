import { MEETING_SLOTS, buildMeetingEmail } from "@/lib/meetings/email-content";
import type { MeetingWithLinks } from "@/lib/meetings/types";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE_MEETING = {
  id: "sample", lead_id: null, customer_id: "sample", company_id: null, job_id: null, proposal_id: null,
  title: "Website kickoff — Hill Country Roofing", meeting_type: "kickoff", description: null,
  agenda: "Walk through the page list\nConfirm photos and copy\nAgree the launch date", location: null,
  provider: "google_meet", provider_event_id: null, provider_calendar_id: null,
  meeting_url: "https://meet.google.com/abc-defg-hij", provider_metadata: {}, provider_synced_at: null, provider_error: null,
  start_at: "2026-12-02T16:00:00.000Z", end_at: "2026-12-02T16:30:00.000Z", duration_minutes: 30, timezone: "America/Chicago",
  status: "scheduled", attendee_name: "Dana Ortiz", attendee_email: "dana@example.com", attendee_phone: null, extra_attendees: [],
  internal_notes: null, outcome: null, next_steps: "We send the sitemap by Friday\nDana sends logo files and crew photos",
  follow_up_required: false, follow_up_date: null, follow_up_task_id: null,
  reschedule_count: 0, original_start_at: null, cancel_reason: null, owner: null, created_by: null,
  created_at: "", updated_at: "", completed_at: null, cancelled_at: null,
  contactName: "Dana Ortiz", companyName: "Hill Country Roofing", contactHref: null, proposalNumber: null, projectName: null,
} as unknown as MeetingWithLinks;

const vars = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Attendee's first name", sample: "Dana" },
  { name: "title", label: "Meeting title", sample: "Website kickoff — Hill Country Roofing" },
  { name: "when", label: "Date and time, in their time zone", sample: "Wednesday, December 2 at 10:00 AM CST" },
  { name: "meeting_type", label: "Meeting type", sample: "Project Kickoff" },
  { name: "company", label: "Their business", sample: "Hill Country Roofing" },
];

const AUDIENCE_NOTE = "Goes to the meeting's attendee (a lead or a client).";

export const MEETING_EMAILS: SystemEmailDef[] = [
  {
    key: "meeting.invite", module: "Meetings", name: "Meeting booked", audience: "client",
    trigger: `You email a meeting with "Invite" chosen in the meeting drawer, or invite someone from the Conference Center. ${AUDIENCE_NOTE}`,
    slots: MEETING_SLOTS.invite,
    vars,
    preview: (copy) => buildMeetingEmail("invite", SAMPLE_MEETING, null, copy),
  },
  {
    key: "meeting.reminder", module: "Meetings", name: "Meeting reminder", audience: "client",
    trigger: `You email a meeting with "Reminder" chosen in the meeting drawer. ${AUDIENCE_NOTE}`,
    slots: MEETING_SLOTS.reminder,
    vars,
    preview: (copy) => buildMeetingEmail("reminder", SAMPLE_MEETING, null, copy),
  },
  {
    key: "meeting.follow_up", module: "Meetings", name: "After-meeting follow-up", audience: "client",
    trigger: `You email a meeting with "Follow-up" chosen in the meeting drawer. ${AUDIENCE_NOTE}`,
    slots: MEETING_SLOTS.follow_up,
    vars,
    preview: (copy) => buildMeetingEmail("follow_up", SAMPLE_MEETING, null, copy),
  },
];
