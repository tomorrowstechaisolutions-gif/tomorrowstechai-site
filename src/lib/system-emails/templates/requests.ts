import { BUILT_IN_VIEW } from "@/lib/settings/profile";
import {
  REQUEST_SLOTS, buildRequestEmail, buildReminderEmail, buildRequestCompletedEmail, buildRequestAdminEmail,
} from "@/lib/requests/email-content";
import { REQUEST_TEMPLATES } from "@/lib/requests/config";
import type { ClientRequest } from "@/lib/requests/types";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE_TEMPLATE = REQUEST_TEMPLATES[0];

const SAMPLE_REQUEST = {
  id: "sample", customer_id: null, lead_id: null, job_id: null, proposal_id: null,
  template_key: SAMPLE_TEMPLATE.key, title: SAMPLE_TEMPLATE.title, summary: null,
  token: "sample", token_expires_at: "2026-12-18T18:00:00Z", status: "sent",
  to_email: "dana@example.com", to_name: "Dana Ortiz", note: null, due_at: "2026-11-25T18:00:00Z",
  delivered: true, sent_at: "2026-11-11T18:00:00Z", first_opened_at: null, last_opened_at: null,
  completed_at: null, canceled_at: null, reminder_count: 0, last_reminded_at: null,
  steps_done: [], payload: {}, created_at: "2026-11-11T18:00:00Z", updated_at: "2026-11-11T18:00:00Z",
} as unknown as ClientRequest;

const SAMPLE_FINISHED = {
  ...SAMPLE_REQUEST, status: "completed", completed_at: "2026-11-18T18:00:00Z",
  steps_done: SAMPLE_TEMPLATE.steps.map((s) => s.id),
  payload: Object.fromEntries(SAMPLE_TEMPLATE.fields.slice(0, 2).map((f) => [f.key, "Sample answer"])),
} as unknown as ClientRequest;

const URL = "https://www.tomorrowstechai.com/request/sample";
const common = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Client's first name", sample: "Dana" },
  { name: "title", label: "Request title", sample: SAMPLE_TEMPLATE.title },
  { name: "request", label: "Request type", sample: SAMPLE_TEMPLATE.pickerLabel },
  { name: "noun", label: "Request type, inside a sentence", sample: SAMPLE_TEMPLATE.noun },
  { name: "company", label: "Your company name", sample: "Tomorrow's Tech AI" },
  { name: "phone", label: "Your phone number", sample: BUILT_IN_VIEW.phone },
  { name: "expires_on", label: "Link open until", sample: "December 18, 2026" },
];

export const REQUEST_EMAILS: SystemEmailDef[] = [
  {
    key: "request.sent", module: "Requests", name: "Client request", audience: "client",
    trigger: "You press Send on a client request (Stripe account, domain, content…).",
    slots: REQUEST_SLOTS.sent,
    vars: [...common,
      { name: "intro", label: "The request type's own opening paragraph", sample: SAMPLE_TEMPLATE.emailIntro }],
    preview: (copy) => buildRequestEmail(SAMPLE_REQUEST, SAMPLE_TEMPLATE, URL, copy),
  },
  {
    key: "request.reminder", module: "Requests", name: "Request reminder", audience: "client",
    trigger: "You press Send reminder on an open client request.",
    slots: REQUEST_SLOTS.reminder,
    vars: [...common,
      { name: "sent_on", label: "Date the request was sent", sample: "November 11, 2026" },
      { name: "blocks", label: "What it is holding up", sample: SAMPLE_TEMPLATE.blocks },
      { name: "time", label: "How long it takes", sample: "20 minutes" }],
    preview: (copy) => buildReminderEmail(SAMPLE_REQUEST, SAMPLE_TEMPLATE, URL, copy),
  },
  {
    key: "request.completed_confirmation", module: "Requests", name: "Request received", audience: "client",
    trigger: "The client finishes and submits a request.",
    slots: REQUEST_SLOTS.completed,
    vars: [...common,
      { name: "in_as_of", label: "\", in as of <date>\"", sample: ", in as of November 18, 2026" }],
    preview: (copy) => buildRequestCompletedEmail(SAMPLE_FINISHED, SAMPLE_TEMPLATE, URL, copy),
  },
  {
    key: "request.owner", module: "Requests", name: "To you: request opened / started / finished", audience: "owner",
    trigger: "A client opens, starts or finishes a request. Switch each on or off on Notifications.",
    slots: REQUEST_SLOTS.admin,
    vars: [
      { name: "who", label: "Client name", sample: "Dana Ortiz" },
      { name: "what", label: "What they did", sample: "finished their request" },
      ...common],
    preview: (copy) => buildRequestAdminEmail("completed", SAMPLE_FINISHED, SAMPLE_TEMPLATE, copy),
  },
];
