import type { SystemEmailDef } from "./types";
import { INVOICE_EMAILS } from "./templates/invoices";
import { PROPOSAL_EMAILS } from "./templates/proposals";
import { REQUEST_EMAILS } from "./templates/requests";
import { CAMPAIGN_EMAILS } from "./templates/campaign";
import { PORTAL_EMAILS } from "./templates/portal";
import { MEETING_EMAILS } from "./templates/meetings";
import { CTAI_EMAILS } from "./templates/central-texas-ai";
import { FORM_EMAILS } from "./templates/forms";

/**
 * Every automated email the site sends, for the System emails page.
 * Pure: imported by the editor's client component for live preview.
 */
export const SYSTEM_EMAILS: SystemEmailDef[] = [
  ...INVOICE_EMAILS,
  ...PROPOSAL_EMAILS,
  ...REQUEST_EMAILS,
  ...CAMPAIGN_EMAILS,
  ...PORTAL_EMAILS,
  ...MEETING_EMAILS,
  ...CTAI_EMAILS,
  ...FORM_EMAILS,
];

export function systemEmail(key: string): SystemEmailDef | undefined {
  return SYSTEM_EMAILS.find((e) => e.key === key);
}
