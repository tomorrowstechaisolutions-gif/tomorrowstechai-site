/**
 * The delivery side of the $399 package.
 *
 * The stages and the checklist are fixed on purpose. The ad promises "live in
 * 7-14 days"; that only holds if every job runs the same way instead of being
 * remembered from the last one.
 */

export const JOB_STAGES = [
  "Intake",
  "Content",
  "Build",
  "Review",
  "Launch",
  "Handoff",
  "Complete",
  "On Hold",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Stages that still count as work in progress, in board order. */
export const ACTIVE_STAGES: JobStage[] = [
  "Intake",
  "Content",
  "Build",
  "Review",
  "Launch",
  "Handoff",
];

export const STAGE_BLURB: Record<JobStage, string> = {
  Intake: "Kickoff call booked, questionnaire sent.",
  Content: "Waiting on their copy, photos, logo and service list.",
  Build: "Pages, forms and booking going together.",
  Review: "Client walkthrough and revision round.",
  Launch: "Domain, DNS, SSL and go-live.",
  Handoff: "Training, logins, and the 30-day check-in booked.",
  Complete: "Delivered. Hosting is running.",
  "On Hold": "Blocked — usually waiting on the client.",
};

/** The promise in the ad. Used to set a job's due date when it opens. */
export const PROMISED_DAYS = 14;

/**
 * Seeded onto every new job. Ordered, so position is the array index.
 * Deliberately concrete — "get the content" is not a task anyone can finish.
 */
export const DEFAULT_JOB_TASKS: { stage: JobStage; label: string }[] = [
  { stage: "Intake", label: "Send welcome email with what we need from them" },
  { stage: "Intake", label: "Book the 20-minute kickoff call" },
  { stage: "Intake", label: "Confirm business name, phone, service area and hours" },
  { stage: "Intake", label: "Confirm domain — do they own one, or are we buying it?" },

  { stage: "Content", label: "Collect logo (or schedule Logo Studio session)" },
  { stage: "Content", label: "Collect photos of real work" },
  { stage: "Content", label: "Confirm the service list and what they want to be called for" },
  { stage: "Content", label: "Draft the five pages and send for approval" },

  { stage: "Build", label: "Build the five pages" },
  { stage: "Build", label: "Wire the lead form into their CRM" },
  { stage: "Build", label: "Set up online booking" },
  { stage: "Build", label: "Set up payments" },
  { stage: "Build", label: "Mobile pass — every page at 390px" },

  { stage: "Review", label: "Send the staging link and walk them through it" },
  { stage: "Review", label: "Collect and apply one revision round" },

  { stage: "Launch", label: "Point the domain, verify DNS and SSL" },
  { stage: "Launch", label: "Submit sitemap, confirm analytics is recording" },
  { stage: "Launch", label: "Test the lead form end to end on a real phone" },

  { stage: "Handoff", label: "Hand over logins and the dashboard walkthrough" },
  { stage: "Handoff", label: "Record the 5-minute how-to video" },
  { stage: "Handoff", label: "Book the 30-day check-in" },
  { stage: "Handoff", label: "Ask for the review, and for who else they know" },
];

/** Working days aren't tracked; the promise is calendar days. */
export function dueDateFrom(start: Date, days = PROMISED_DAYS): string {
  const due = new Date(start);
  due.setDate(due.getDate() + days);
  return due.toISOString();
}
