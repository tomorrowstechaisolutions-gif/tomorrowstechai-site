/**
 * Conference Center vocabulary. A plain module so both server actions and
 * client forms can import it.
 *
 * A conference category is a business-facing name for a `meeting_type`. The
 * meeting engine stores the type; this file decides what the sales team calls
 * it. Partner categories are generated from CONFERENCE_PARTNERS, so no
 * partner's name is hard-coded into the engine — ROMAR Press is one entry in
 * a list, and a white-label installation ships a different list.
 */

import type { MeetingType } from "@/lib/meetings/config";
import { CONFERENCE_PARTNERS } from "./partners";

export type ConferenceCategory = {
  key: string;
  label: string;
  meetingType: MeetingType;
  minutes: number;
  /** Set for partner categories: which configured partner it is with. */
  partnerKey?: string;
  group: "Sales" | "Clients" | "Partners" | "Other";
};

const BASE: ConferenceCategory[] = [
  { key: "ai_consultation", label: "Free AI Business Consultation", meetingType: "ai_consultation", minutes: 30, group: "Sales" },
  { key: "ai_receptionist_demo", label: "AI Receptionist Demonstration", meetingType: "ai_receptionist_demo", minutes: 30, group: "Sales" },
  { key: "website_consultation", label: "Website Consultation", meetingType: "website_consultation", minutes: 30, group: "Sales" },
  { key: "software_demo", label: "Custom Software Demonstration", meetingType: "software_demo", minutes: 45, group: "Sales" },
  { key: "automation_review", label: "Business Automation Review", meetingType: "automation_review", minutes: 45, group: "Sales" },
  { key: "sales_discovery", label: "Sales Discovery", meetingType: "discovery", minutes: 30, group: "Sales" },
  { key: "proposal_presentation", label: "Proposal Presentation", meetingType: "proposal_review", minutes: 45, group: "Sales" },
  { key: "client_project_review", label: "Client Project Review", meetingType: "progress_review", minutes: 30, group: "Clients" },
  { key: "client_training", label: "Client Training", meetingType: "training", minutes: 60, group: "Clients" },
  { key: "partnership", label: "Business Partnership Meeting", meetingType: "partnership", minutes: 45, group: "Partners" },
];

const PARTNER_CATEGORIES: ConferenceCategory[] = CONFERENCE_PARTNERS.map((partner) => ({
  key: `partner:${partner.key}`,
  label: `${partner.name} Partnership Meeting`,
  meetingType: "partner_meeting" as MeetingType,
  minutes: 45,
  partnerKey: partner.key,
  group: "Partners" as const,
}));

export const CONFERENCE_CATEGORIES: ConferenceCategory[] = [
  ...BASE,
  ...PARTNER_CATEGORIES,
  { key: "general", label: "General Conference", meetingType: "custom", minutes: 30, group: "Other" },
];

export const CATEGORY_GROUP_ORDER: ConferenceCategory["group"][] = ["Sales", "Clients", "Partners", "Other"];

export function categoryByKey(key: string): ConferenceCategory {
  return CONFERENCE_CATEGORIES.find((c) => c.key === key)
    ?? CONFERENCE_CATEGORIES[CONFERENCE_CATEGORIES.length - 1];
}

/** Meeting types that count as a sales consultation in analytics. */
export const CONSULTATION_TYPES: MeetingType[] = [
  "ai_consultation", "ai_receptionist_demo", "website_consultation",
  "software_demo", "automation_review", "discovery",
];

/** Common IANA zones for the picker; default is the business zone. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "UTC", label: "UTC" },
];

export const HISTORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "no_show", label: "Missed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number]["key"];
