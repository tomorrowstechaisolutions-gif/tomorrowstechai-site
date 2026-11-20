import type { StationId } from "./stations";

/**
 * Row and domain types for the crew. They mirror
 * supabase/migrations/20261120010000_ai_crew.sql.
 */

/** setup: nothing is sent until John confirms the playbook. launch: the full
 *  crew works it. maintenance: watch only. */
export type BusinessMode = "setup" | "launch" | "maintenance";

export type Caps = {
  spendCentsPerDay: number;
  firstEmailsPerDay: number;
  postsPerDayPerChannel: number;
};

export const STARTING_CAPS: Caps = { spendCentsPerDay: 500, firstEmailsPerDay: 5, postsPerDayPerChannel: 2 };

export type Playbook = {
  sellsTo: string;
  offers: string[];
  voice: string;
  offLimits: string[];
  channels: string[];
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  mode: BusinessMode;
  playbook: Playbook | null;
  playbook_confirmed_at: string | null;
  caps: Caps;
};

export type GoalMetric = "qualified_leads" | "booked_calls" | "sales" | "site_visitors" | "unpaid_days";

export type Goal = {
  id: string;
  business_id: string;
  metric: GoalMetric;
  target: number;
  period_start: string;
  period_end: string;
};

export type AgentSlug = "tess" | "follow-through" | "content" | "finance";

export type Agent = {
  id: string;
  slug: AgentSlug;
  name: string;
  rank: "lead" | "desk" | "function" | "business";
  desk: "sales" | "social" | "finance" | null;
  business_id: string | null;
  model: string;
  schedule_minutes: number | null;
  paused: boolean;
  last_shift_at: string | null;
};

export type RunStatus = "running" | "waiting" | "done" | "failed" | "paused_budget" | "stopped";

export type Run = {
  id: string;
  agent_id: string;
  business_id: string | null;
  trigger: "shift" | "chat";
  /** The admin a chat belongs to. Null for a shift. */
  started_by?: string | null;
  status: RunStatus;
  /** The conversation with the model, append-only. */
  transcript: unknown[];
  steps_taken: number;
  /** What this run has cost in AI calls, in millionths of a dollar. */
  cost_micro_usd: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

/** read: looked something up. act: changed or sent something. refused: the
 *  gate said no. needs_john: raised for John, not done. report: end of shift. */
export type StepKind = "read" | "act" | "refused" | "needs_john" | "report";

export type Step = {
  id: string;
  run_id: string;
  agent_id: string;
  business_id: string | null;
  seq: number;
  kind: StepKind;
  tool: string;
  station: StationId | null;
  summary: string;
  goal_id: string | null;
  expectation: string | null;
  tool_use_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type Rule = { id: string; text: string; scope: AgentSlug | "all"; active: boolean };
