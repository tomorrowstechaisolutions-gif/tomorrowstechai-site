/**
 * The meetings vocabulary: types, statuses, providers and the labels.
 *
 * A plain module. Server actions live in a `"use server"` file, which may
 * export nothing but async functions, so every constant both a form and an
 * action need has to live somewhere like this — the same shape as
 * lib/calendar/config.ts and lib/tasks/config.ts.
 *
 * Nothing here knows what Google is. The provider list is data; the code that
 * talks to a provider lives in ./providers and is looked up by key. That is
 * what makes Zoom a new file rather than a rewrite.
 */

// ── Provider ─────────────────────────────────────────────────────────

export const MEETING_PROVIDERS = [
  "google_meet", "zoom", "phone", "in_person",
] as const;

export type MeetingProviderKey = (typeof MEETING_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<MeetingProviderKey, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  phone: "Phone",
  in_person: "In Person",
};

/** Short form for a calendar card, where the row is one line tall. */
export const PROVIDER_SHORT: Record<MeetingProviderKey, string> = {
  google_meet: "Meet",
  zoom: "Zoom",
  phone: "Phone",
  in_person: "In person",
};

/** Whether the provider produces a link you can click to join. */
export const PROVIDER_IS_VIDEO: Record<MeetingProviderKey, boolean> = {
  google_meet: true,
  zoom: true,
  phone: false,
  in_person: false,
};

// ── Type ─────────────────────────────────────────────────────────────

export const MEETING_TYPES = [
  "discovery", "demo", "proposal_review", "kickoff", "strategy",
  "support", "progress_review", "training", "final_review",
  "follow_up", "custom",
] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export const TYPE_LABELS: Record<MeetingType, string> = {
  discovery: "Discovery Call",
  demo: "Website Demo",
  proposal_review: "Proposal Review",
  kickoff: "Project Kickoff",
  strategy: "Strategy Meeting",
  support: "Support Session",
  progress_review: "Progress Review",
  training: "Training Session",
  final_review: "Final Review",
  follow_up: "Follow-Up",
  custom: "Custom Meeting",
};

/** Sensible default length per type, in minutes. Always editable. */
export const TYPE_DEFAULT_MINUTES: Record<MeetingType, number> = {
  discovery: 30,
  demo: 30,
  proposal_review: 45,
  kickoff: 60,
  strategy: 60,
  support: 30,
  progress_review: 30,
  training: 60,
  final_review: 45,
  follow_up: 15,
  custom: 30,
};

/**
 * The title a type suggests. Always editable — this fills the box, it does
 * not own it. `company` is the client's business name where there is one.
 */
export function suggestedTitle(type: MeetingType, company?: string | null): string {
  const label = TYPE_LABELS[type];
  const who = (company ?? "").trim();
  return who ? `${label} — ${who}` : label;
}

/** Which types belong to which stage of the relationship. Groups the picker. */
export const TYPE_GROUPS: { head: string; types: MeetingType[] }[] = [
  { head: "Sales", types: ["discovery", "demo", "proposal_review", "follow_up"] },
  { head: "Delivery", types: ["kickoff", "progress_review", "training", "final_review"] },
  { head: "Other", types: ["strategy", "support", "custom"] },
];

// ── Status ───────────────────────────────────────────────────────────

export const MEETING_STATUSES = [
  "scheduled", "confirmed", "in_progress", "completed",
  "cancelled", "no_show", "rescheduled",
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
  rescheduled: "Rescheduled",
};

/** Reuses the `.cc-chip` tones the rest of the admin already defines. */
export const STATUS_TONE: Record<MeetingStatus, string> = {
  scheduled: "t-info",
  confirmed: "t-info",
  in_progress: "t-warn",
  completed: "t-ok",
  cancelled: "t-muted",
  no_show: "t-risk",
  rescheduled: "t-muted",
};

/** Statuses where the meeting has not happened yet and can still be moved. */
export const OPEN_MEETING_STATUSES: MeetingStatus[] =
  ["scheduled", "confirmed", "in_progress"];

/** Statuses that mean it is over, one way or another. */
export const CLOSED_MEETING_STATUSES: MeetingStatus[] =
  ["completed", "cancelled", "no_show", "rescheduled"];

// ── Outcome ──────────────────────────────────────────────────────────

export const MEETING_OUTCOMES = [
  "successful", "follow_up_needed", "proposal_requested",
  "client_interested", "client_not_interested", "project_approved",
  "needs_more_information", "other",
] as const;

export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<MeetingOutcome, string> = {
  successful: "Successful",
  follow_up_needed: "Follow-Up Needed",
  proposal_requested: "Proposal Requested",
  client_interested: "Client Interested",
  client_not_interested: "Client Not Interested",
  project_approved: "Project Approved",
  needs_more_information: "Needs More Information",
  other: "Other",
};

export const OUTCOME_TONE: Record<MeetingOutcome, string> = {
  successful: "t-ok",
  follow_up_needed: "t-warn",
  proposal_requested: "t-ok",
  client_interested: "t-ok",
  client_not_interested: "t-risk",
  project_approved: "t-ok",
  needs_more_information: "t-warn",
  other: "t-muted",
};

/** Outcomes that mean a follow-up is almost certainly needed. Pre-ticks it. */
export const OUTCOMES_IMPLYING_FOLLOW_UP: MeetingOutcome[] =
  ["follow_up_needed", "proposal_requested", "needs_more_information"];

// ── Duration ─────────────────────────────────────────────────────────

export const DURATION_PRESETS = [15, 30, 45, 60, 90] as const;

// ── Tabs ─────────────────────────────────────────────────────────────

export const MEETING_TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "followup", label: "Needs Follow-Up" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export type MeetingTab = (typeof MEETING_TABS)[number]["key"];

/** How long before a meeting the admin should be nudged. Minutes. */
export const REMINDER_MINUTES = [15, 60] as const;
