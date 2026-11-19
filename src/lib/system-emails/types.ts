import type { CopySlot, EmailCopy } from "./copy";

/**
 * One automated email the site sends, as the System emails page sees it.
 * Pure (no server-only): the editor's live preview runs `preview` in the
 * browser with sample data.
 */

export type BuiltEmail = { subject: string; html: string; text: string };

export type EmailAudience = "client" | "lead" | "owner" | "member";

export type SystemEmailDef = {
  /** Stable id, e.g. "invoice.sent". Saved overrides are keyed by it. */
  key: string;
  module: "Invoices" | "Proposals" | "Requests" | "Leads & campaigns" | "Member portal" | "Meetings" | "Central Texas AI" | "Website forms" | "Reviews";
  name: string;
  audience: EmailAudience;
  /** When it goes out, in plain words. */
  trigger: string;
  /** Editable wording. Defaults are the shipped text. */
  slots: CopySlot[];
  /** Fill-ins the slots may use, with a sample value for the preview. */
  vars: Array<{ name: string; label: string; sample: string }>;
  /** Renders the email with sample data and the given wording. */
  preview: (copy: Partial<EmailCopy>) => BuiltEmail;
};
