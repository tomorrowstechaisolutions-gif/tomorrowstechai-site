/**
 * Configured partner organizations.
 *
 * A partner is DATA about this installation, not part of the meeting engine.
 * Phase 1 uses this list only to name partner meeting categories. Phase 3
 * replaces it with `partner_connections` rows (organization identity, shared
 * secret reference, invitation status) and a signed server-to-server
 * invitation API — see docs/conference-center/partner-integration-contract.md.
 *
 * `syncStatus` is reported honestly on screen. Until both sides implement the
 * contract, a partner meeting is an ordinary Zoom meeting whose participant
 * link is emailed to the partner contact — it is NOT synchronized into the
 * partner's Conference Center, and nothing in the UI claims it is.
 */

export type ConferencePartner = {
  key: string;
  name: string;
  website?: string;
  syncStatus: "pending_configuration" | "active" | "disabled";
};

export const CONFERENCE_PARTNERS: ConferencePartner[] = [
  {
    key: "romar-press",
    name: "ROMAR Press",
    syncStatus: "pending_configuration",
  },
];
