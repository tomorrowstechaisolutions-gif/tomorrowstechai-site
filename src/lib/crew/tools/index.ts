import "server-only";
import type { AgentSlug } from "../types";
import type { CrewTool } from "./core";
import { financeOverview, listUnpaidInvoices, sendInvoiceReminderTool } from "./finance";
import { listLeadsNeedingAttention, readLead, readLeadEmails, sendLeadEmail, updateLeadStatus } from "./leads";
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
];

export const TOOLS: Record<string, CrewTool> = Object.fromEntries(all.map((t) => [t.name, t]));

const BY_AGENT: Record<AgentSlug, string[]> = {
  "follow-through": ["list_leads_needing_attention", "read_lead", "read_lead_emails", "send_lead_email", "update_lead_status", "flag_for_john", "report"],
  content: ["list_recent_articles", "publish_article_post", "flag_for_john", "report"],
  finance: ["finance_overview", "list_unpaid_invoices", "send_invoice_reminder", "flag_for_john", "report"],
  // Tess reads everything and raises things; she does not send. Her setup
  // tools are registered separately (see registerTool).
  tess: ["list_leads_needing_attention", "read_lead", "list_recent_articles", "finance_overview", "list_unpaid_invoices", "flag_for_john"],
};

/** Add a tool after the fact (Tess's playbook and rule tools). */
export function registerTool(tool: CrewTool, agents: AgentSlug[]): void {
  TOOLS[tool.name] = tool;
  for (const a of agents) if (!BY_AGENT[a].includes(tool.name)) BY_AGENT[a].push(tool.name);
}

export function toolsFor(agent: AgentSlug): CrewTool[] {
  return BY_AGENT[agent].map((name) => TOOLS[name]).filter(Boolean);
}
