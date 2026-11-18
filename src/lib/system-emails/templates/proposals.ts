import {
  PROPOSAL_SLOTS, buildProposalEmail, buildSignedEmail, buildAdminEmail,
} from "@/lib/proposals/email-content";
import type { Proposal, ProposalSignature } from "@/lib/proposals/types";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE_PROPOSAL = {
  id: "sample", proposal_number: "PRO-2026-0042", kind: "proposal", status: "sent",
  title: "Website build & launch", summary: null,
  package_key: "growth", package_name: "Growth Website",
  client_business_name: "Hill Country Roofing", client_contact_name: "Dana Ortiz", client_email: "dana@example.com",
  currency: "USD", subtotal_cents: 150000, discount_amount_cents: 0, one_time_price_cents: 150000, total_cents: 150000,
  recurring_price_cents: 4900, recurring_interval: "month", deposit_amount_cents: 0, payment_mode: "invoice_later",
  valid_until: "2026-12-18",
} as unknown as Proposal;

const SAMPLE_SIGNATURE = {
  id: "sample-sig", proposal_id: "sample", signer_name: "Dana Ortiz", signer_email: "dana@example.com",
  signer_title: "Owner", signature_type: "typed", signature_text: "Dana Ortiz", signature_data: null,
  accepted_scope: true, accepted_pricing: true, accepted_ownership: true, accepted_agreement: true,
  agreement_version: "2026.11", agreement_version_id: null, document_hash: null, document_path: null,
  ip_address: null, user_agent: null, signed_at: "2026-11-18T16:30:00Z", created_at: "2026-11-18T16:30:00Z",
} as unknown as ProposalSignature;

const URL = "https://www.tomorrowstechai.com/proposal/sample";
const common = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Client's first name", sample: "Dana" },
  { name: "title", label: "Proposal title", sample: "Website build & launch" },
  { name: "proposal_number", label: "Proposal number", sample: "PRO-2026-0042" },
  { name: "business_name", label: "Client business", sample: "Hill Country Roofing" },
];

export const PROPOSAL_EMAILS: SystemEmailDef[] = [
  {
    key: "proposal.sent", module: "Proposals", name: "Proposal", audience: "client",
    trigger: "You press Send on a proposal.",
    slots: PROPOSAL_SLOTS.sent,
    vars: [...common,
      { name: "expires", label: "Open-until date", sample: "December 18, 2026" }],
    preview: (copy) => buildProposalEmail(SAMPLE_PROPOSAL, URL, null, copy),
  },
  {
    key: "proposal.signed_confirmation", module: "Proposals", name: "Signed copy", audience: "client",
    trigger: "The client signs a proposal on its page.",
    slots: PROPOSAL_SLOTS.signed,
    vars: [...common,
      { name: "signed_at", label: "When they signed", sample: "November 18, 2026 at 10:30 AM" }],
    preview: (copy) => buildSignedEmail(SAMPLE_PROPOSAL, SAMPLE_SIGNATURE, URL, copy),
  },
  {
    key: "proposal.owner", module: "Proposals", name: "To you: proposal opened / signed / declined", audience: "owner",
    trigger: "A client opens, signs or declines a proposal. Switch each on or off on Notifications.",
    slots: PROPOSAL_SLOTS.admin,
    vars: [
      { name: "label", label: "Status word (Opened, Signed…)", sample: "Signed" },
      { name: "client", label: "Client name", sample: "Hill Country Roofing" },
      { name: "value", label: "One-time price", sample: "$1,500" },
      ...common],
    preview: (copy) => buildAdminEmail("signed", SAMPLE_PROPOSAL, "Signed from a phone.", copy),
  },
];
