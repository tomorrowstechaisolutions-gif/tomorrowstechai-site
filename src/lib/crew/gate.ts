import type { AgentSlug, BusinessMode, Caps } from "./types";

/**
 * The gate: the one decision every action the crew takes passes through.
 *
 * The crew acts without asking John first. That only works if there is a
 * single place that says no for him, the same way every time: paused, no
 * goal behind the action, someone who asked not to be contacted, too soon
 * after the last email, over a daily cap, or something only John may do.
 *
 * `checkAction` is pure, with no database or server imports, so every one of
 * those rules can be tested directly. `loadGateState` (gate-state.ts) gathers
 * the facts it needs. The tools call both through `act()` (tools/index.ts);
 * nothing that sends or changes anything may skip it.
 */

export type GateRefusal =
  | "crew_paused"
  | "agent_paused"
  | "not_launched"
  | "always_john"
  | "no_goal"
  | "suppressed"
  | "too_soon"
  | "cap_first_emails"
  | "cap_posts"
  | "cap_spend";

export type GateAction = {
  tool: string;
  agentSlug: AgentSlug;
  /** The goal this action serves. No goal, no action. */
  goalId: string | null;
  /** What the bot expects to happen, so the result can be judged later. */
  expectation: string | null;
  recipientEmail?: string;
  /** True for the first email this person has ever had from us. */
  firstContact?: boolean;
  /** A social channel this would post to. */
  channel?: string;
  /** Money leaving, an off-catalog price, a signature, a deletion, access. */
  alwaysJohn?: boolean;
};

export type GateState = {
  crewPaused: boolean;
  agentPaused: boolean;
  mode: BusinessMode;
  caps: Caps;
  /** Lower-cased addresses that must not be contacted. */
  suppressed: Set<string>;
  /** Lower-cased address to the time (ms) it was last emailed. */
  lastEmailAt: Map<string, number>;
  firstEmailsToday: number;
  postsToday: Record<string, number>;
  spendCentsToday: number;
  now: number;
};

export type GateDecision = { allow: true } | { allow: false; reason: GateRefusal; message: string };

/** Two emails to the same person are never closer together than this. */
export const MIN_EMAIL_GAP_MS = 48 * 3_600_000;

function no(reason: GateRefusal, message: string): GateDecision {
  return { allow: false, reason, message };
}

/**
 * Decide one action. The order matters: a pause is reported before anything
 * else, so a paused crew never looks like a crew with a missing goal.
 */
export function checkAction(action: GateAction, state: GateState): GateDecision {
  if (state.crewPaused) return no("crew_paused", "The whole crew is paused. Nothing is sent or changed until John resumes it.");
  if (state.agentPaused) return no("agent_paused", "This bot is paused. It can read, but it cannot send or change anything.");
  if (state.mode !== "launch") {
    return no(
      "not_launched",
      state.mode === "setup"
        ? "This business is still being set up. Nothing goes out until John confirms its playbook and target."
        : "This business is in maintenance mode. The crew watches it and flags problems, and sends nothing."
    );
  }
  if (action.alwaysJohn) return no("always_john", "Only John can do this. It has been put on his list instead of carried out.");
  if (!action.goalId || !action.expectation?.trim()) {
    return no("no_goal", "Every action needs a goal it serves and what is expected to happen. This one has neither, so it was not done.");
  }

  const to = action.recipientEmail?.trim().toLowerCase();
  if (to) {
    if (state.suppressed.has(to)) return no("suppressed", "This person unsubscribed or is marked do-not-contact. They are never emailed.");
    const last = state.lastEmailAt.get(to);
    if (last !== undefined && state.now - last < MIN_EMAIL_GAP_MS) {
      return no("too_soon", "This person was emailed less than 48 hours ago. A second email this soon is not sent.");
    }
    if (action.firstContact && state.firstEmailsToday >= state.caps.firstEmailsPerDay) {
      return no("cap_first_emails", `Today's limit of ${state.caps.firstEmailsPerDay} first-contact emails has been reached.`);
    }
  }

  if (action.channel && (state.postsToday[action.channel] ?? 0) >= state.caps.postsPerDayPerChannel) {
    return no("cap_posts", `Today's limit of ${state.caps.postsPerDayPerChannel} posts on ${action.channel} has been reached.`);
  }

  if (state.spendCentsToday >= state.caps.spendCentsPerDay) {
    return no("cap_spend", "Today's AI spending limit has been reached. The crew picks up again tomorrow.");
  }

  return { allow: true };
}
