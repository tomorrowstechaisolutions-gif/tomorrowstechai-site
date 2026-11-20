import "server-only";
import { STATION_IDS, type StationId } from "../stations";
import type { AgentSlug } from "../types";
import type { CrewTool } from "./core";
import { financeOverview, listUnpaidInvoices, sendInvoiceReminderTool } from "./finance";
import { openPage } from "./navigate";
import { listLeadsNeedingAttention, readLead, readLeadEmails, sendLeadEmail, updateLeadStatus } from "./leads";
import { parkIdea, rememberAboutJohn } from "./profile";
import { changeSettings } from "./settings";
import { addRule, savePlaybook, setTarget } from "./setup";
import { listRecentArticles, publishArticlePost } from "./social";
import { flagForJohn, report } from "./tess";

export { act, SIGNATURE, type CrewTool, type ToolContext, type ToolResult } from "./core";

/**
 * Every tool the crew has, and which bot gets which.
 *
 * A bot only ever sees its own list: Finance cannot email a lead because the
 * tool is simply not offered to it.
 */

const all: CrewTool[] = [
  listLeadsNeedingAttention, readLead, readLeadEmails, sendLeadEmail, updateLeadStatus,
  listRecentArticles, publishArticlePost,
  financeOverview, listUnpaidInvoices, sendInvoiceReminderTool,
  flagForJohn, report,
  savePlaybook, setTarget, addRule,
  rememberAboutJohn, parkIdea, changeSettings, openPage,
];

export const TOOLS: Record<string, CrewTool> = Object.fromEntries(all.map((t) => [t.name, t]));

const BY_AGENT: Record<AgentSlug, string[]> = {
  "follow-through": ["list_leads_needing_attention", "read_lead", "read_lead_emails", "send_lead_email", "update_lead_status", "flag_for_john", "report"],
  content: ["list_recent_articles", "publish_article_post", "flag_for_john", "report"],
  finance: ["finance_overview", "list_unpaid_invoices", "send_invoice_reminder", "flag_for_john", "report"],
  // Tess reads everything, raises things and holds the setup tools. She does not send.
  tess: ["list_leads_needing_attention", "read_lead", "list_recent_articles", "finance_overview", "list_unpaid_invoices", "flag_for_john", "save_playbook", "set_target", "add_rule", "remember_about_john", "park_idea", "change_settings", "open_page"],
};

export function toolsFor(agent: AgentSlug): CrewTool[] {
  return BY_AGENT[agent].map((name) => TOOLS[name]).filter(Boolean);
}

/** The stations at least one tool works at. The floor shows these and no others. */
export function toolStations(): StationId[] {
  const used = new Set(all.map((t) => t.station));
  return STATION_IDS.filter((id) => used.has(id));
}
