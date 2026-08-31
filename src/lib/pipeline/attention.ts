import "server-only";
import { effectiveProbability } from "./forecast";

/**
 * Which deals need a person today.
 *
 * Every rule here fires on a fact the system actually holds — a date that
 * passed, a field that is empty, a timestamp that is old. None of them
 * guess at intent, and none of them fire on "this feels stale".
 *
 * Each finding carries the sentence that produced it, because a list of
 * flagged deals with no reasons is a list somebody learns to ignore.
 */

export type AttentionIssue = {
  code: string;
  label: string;
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  /** The action that would actually resolve it. */
  suggested: string;
};

export type AttentionInput = {
  stage: string;
  valueCents: number | null;
  probability: number | null;
  expectedClose: string | null;
  daysInStage: number;
  lastActivityAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  owner: string | null;
  hasProposal: boolean;
  committed: boolean;
};

/** How long a deal may sit in each stage before it is worth asking about. */
const STALE_AFTER_DAYS: Record<string, number> = {
  new: 7,
  qualified: 14,
  discovery: 14,
  proposal: 10,
  negotiation: 7,
  on_hold: 45,
};

const QUIET_AFTER_DAYS = 7;
const HIGH_VALUE_CENTS = 200_000;

const DAY = 86_400_000;
const daysSince = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
const daysUntil = (iso: string): number => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

export function findIssues(deal: AttentionInput): AttentionIssue[] {
  const issues: AttentionIssue[] = [];
  if (deal.stage === "won" || deal.stage === "lost") return issues;

  // ── The close date has already gone ────────────────────────────────
  if (deal.expectedClose) {
    const until = daysUntil(deal.expectedClose);
    if (until < 0) {
      issues.push({
        code: "close_passed",
        label: "Close date passed",
        detail: `Expected to close ${Math.abs(until)} ${Math.abs(until) === 1 ? "day" : "days"} ago and is still open. Either it is moving or the date was wrong.`,
        priority: "high",
        suggested: "Re-engage",
      });
    } else if (until <= 3 && deal.stage !== "negotiation") {
      issues.push({
        code: "close_soon",
        label: `Closing in ${until} ${until === 1 ? "day" : "days"}`,
        detail: `Still in ${deal.stage.replace(/_/g, " ")}. A deal three days from close is usually further along than this.`,
        priority: "medium",
        suggested: "Check in",
      });
    }
  }

  // ── Nobody has touched it ──────────────────────────────────────────
  if (deal.lastActivityAt) {
    const quiet = daysSince(deal.lastActivityAt);
    if (quiet >= QUIET_AFTER_DAYS) {
      const big = (deal.valueCents ?? 0) >= HIGH_VALUE_CENTS;
      issues.push({
        code: "no_activity",
        label: `No activity in ${quiet} days`,
        detail: big
          ? `This is one of the larger open deals and nothing has happened on it for ${quiet} days.`
          : `Nothing has been logged against it for ${quiet} days.`,
        priority: big ? "high" : "medium",
        suggested: "Follow up",
      });
    }
  } else {
    issues.push({
      code: "never_touched",
      label: "No activity ever recorded",
      detail: "Nothing has been logged against this deal since it was created.",
      priority: "medium",
      suggested: "Follow up",
    });
  }

  // ── It has sat in this stage too long ──────────────────────────────
  const limit = STALE_AFTER_DAYS[deal.stage];
  if (limit && deal.daysInStage > limit) {
    issues.push({
      code: "stuck",
      label: `Stuck in stage (${deal.daysInStage} days)`,
      detail: `Deals normally leave ${deal.stage.replace(/_/g, " ")} within about ${limit} days. This one has not.`,
      priority: deal.daysInStage > limit * 2 ? "high" : "medium",
      suggested: "Follow up",
    });
  }

  // ── Nothing is going to happen next ────────────────────────────────
  if (!deal.nextAction) {
    issues.push({
      code: "no_next_action",
      label: "No next action",
      detail: "Nothing is scheduled to happen. A deal with no next step does not move on its own.",
      priority: deal.stage === "proposal" || deal.stage === "negotiation" ? "high" : "low",
      suggested: "Create task",
    });
  } else if (deal.nextActionAt && daysUntil(deal.nextActionAt) < 0) {
    issues.push({
      code: "next_action_overdue",
      label: "Follow-up overdue",
      detail: `"${deal.nextAction}" was due ${Math.abs(daysUntil(deal.nextActionAt))} days ago.`,
      priority: "high",
      suggested: "Follow up",
    });
  }

  // ── In Proposal with no proposal ───────────────────────────────────
  if ((deal.stage === "proposal" || deal.stage === "negotiation") && !deal.hasProposal) {
    issues.push({
      code: "no_proposal",
      label: "No proposal linked",
      detail: `The deal is in ${deal.stage} but no invoice or proposal is attached to it, so there is nothing for the client to say yes to.`,
      priority: "high",
      suggested: "Create proposal",
    });
  }

  // ── Nobody owns it ─────────────────────────────────────────────────
  if (!deal.owner) {
    issues.push({
      code: "no_owner",
      label: "No owner",
      detail: "Nobody is named on this deal, so nobody is chasing it.",
      priority: "medium",
      suggested: "Assign owner",
    });
  }

  // ── Committed but unlikely ─────────────────────────────────────────
  // The one place two human inputs contradict each other, and worth saying,
  // because commit is what the forecast leans on.
  if (deal.committed && effectiveProbability(deal) < 50) {
    issues.push({
      code: "commit_mismatch",
      label: "Committed at low probability",
      detail: `This deal is committed to the forecast but sits at ${effectiveProbability(deal)}%. One of the two is wrong.`,
      priority: "medium",
      suggested: "Check in",
    });
  }

  return issues;
}

const RANK: Record<AttentionIssue["priority"], number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export function worstPriority(issues: AttentionIssue[]): AttentionIssue["priority"] | null {
  if (issues.length === 0) return null;
  return issues.slice().sort((a, b) => RANK[a.priority] - RANK[b.priority])[0].priority;
}

export function sortIssues(issues: AttentionIssue[]): AttentionIssue[] {
  return issues.slice().sort((a, b) => RANK[a.priority] - RANK[b.priority]);
}
