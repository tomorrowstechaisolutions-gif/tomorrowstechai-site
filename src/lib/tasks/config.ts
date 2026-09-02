/**
 * The task vocabulary: statuses, types, priorities, board columns and tabs.
 *
 * A plain module. Server actions live in a `"use server"` file, which may
 * export nothing but async functions, so everything both a form and an action
 * need has to live somewhere like this.
 *
 * Priority deliberately keeps the four values the database has had since
 * 0007 — low, medium, high, critical — and simply LABELS critical as
 * "Urgent". Renaming the stored value would have meant rewriting every row
 * and every existing query for a word.
 */

import type { Priority } from "@/lib/supabase/types";

// ── Status ───────────────────────────────────────────────────────────

export const TASK_STATUSES = [
  "backlog", "not_started", "ready", "in_progress",
  "waiting", "review", "blocked", "completed", "canceled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  ready: "Ready",
  in_progress: "In Progress",
  waiting: "Waiting",
  review: "Review",
  blocked: "Blocked",
  completed: "Completed",
  canceled: "Canceled",
};

/** `.tk-s-*` classes, defined alongside the rest of the Tasks CSS. */
export const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: "tk-s-muted",
  not_started: "tk-s-muted",
  ready: "tk-s-info",
  in_progress: "tk-s-active",
  waiting: "tk-s-warn",
  review: "tk-s-violet",
  blocked: "tk-s-risk",
  completed: "tk-s-ok",
  canceled: "tk-s-muted",
};

/** Statuses that mean the work is finished, one way or the other. */
export const CLOSED_TASK_STATUSES: TaskStatus[] = ["completed", "canceled"];

/** Waiting on somebody else — what the Waiting tab and KPI count. */
export const WAITING_STATUSES: TaskStatus[] = ["waiting", "blocked"];

export function isClosed(status: TaskStatus): boolean {
  return CLOSED_TASK_STATUSES.includes(status);
}

// ── Board ────────────────────────────────────────────────────────────

export type BoardColumnKey =
  "backlog" | "ready" | "in_progress" | "waiting" | "review" | "done";

/**
 * Six columns, nine statuses.
 *
 * `blocked` shares the Waiting column because both mean the same thing to
 * whoever is looking at the board — it is not on me right now — and the card
 * still carries a Blocked chip so the difference is not lost. `canceled`
 * appears on no column at all: a cancelled task is not work in progress and
 * putting it in Done would overstate what got finished.
 */
export const BOARD_COLUMNS: {
  key: BoardColumnKey;
  label: string;
  statuses: TaskStatus[];
  /** What a card dropped into this column becomes. */
  dropStatus: TaskStatus;
}[] = [
  { key: "backlog",     label: "Backlog",     statuses: ["backlog", "not_started"], dropStatus: "backlog" },
  { key: "ready",       label: "Ready",       statuses: ["ready"],                  dropStatus: "ready" },
  { key: "in_progress", label: "In Progress", statuses: ["in_progress"],            dropStatus: "in_progress" },
  { key: "waiting",     label: "Waiting",     statuses: ["waiting", "blocked"],     dropStatus: "waiting" },
  { key: "review",      label: "Review",      statuses: ["review"],                 dropStatus: "review" },
  { key: "done",        label: "Done",        statuses: ["completed"],              dropStatus: "completed" },
];

export function columnFor(status: TaskStatus): BoardColumnKey | null {
  return BOARD_COLUMNS.find((column) => column.statuses.includes(status))?.key ?? null;
}

// ── Type ─────────────────────────────────────────────────────────────

export const TASK_TYPES = [
  "sales", "proposal", "client_intake", "website", "development", "design",
  "content", "seo", "hosting", "domain", "ai", "automation", "crm",
  "ecommerce", "quality", "launch", "billing", "support", "internal",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TYPE_LABELS: Record<TaskType, string> = {
  sales: "Sales",
  proposal: "Proposal",
  client_intake: "Client Intake",
  website: "Website",
  development: "Development",
  design: "Design",
  content: "Content",
  seo: "SEO",
  hosting: "Hosting",
  domain: "Domain",
  ai: "AI",
  automation: "Automation",
  crm: "CRM",
  ecommerce: "E-Commerce",
  quality: "Quality / QA",
  launch: "Launch",
  billing: "Billing",
  support: "Support",
  internal: "Internal",
};

/**
 * Nine colour families rather than nineteen. Types that belong to the same
 * part of the business share a hue, so the table reads as areas of work
 * instead of a bag of confetti.
 */
export const TYPE_TONE: Record<TaskType, string> = {
  sales: "tk-t-emerald",
  proposal: "tk-t-blue",
  client_intake: "tk-t-violet",
  crm: "tk-t-emerald",

  website: "tk-t-cyan",
  launch: "tk-t-cyan",
  domain: "tk-t-cyan",

  development: "tk-t-indigo",
  automation: "tk-t-indigo",
  ai: "tk-t-violet",

  design: "tk-t-pink",
  content: "tk-t-amber",
  seo: "tk-t-teal",

  hosting: "tk-t-slate",
  internal: "tk-t-slate",
  support: "tk-t-teal",

  ecommerce: "tk-t-orange",
  billing: "tk-t-amber",
  quality: "tk-t-rose",
};

// ── Priority ─────────────────────────────────────────────────────────

export const TASK_PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  critical: "tk-p-urgent",
  high: "tk-p-high",
  medium: "tk-p-medium",
  low: "tk-p-low",
};

/** Sort weight. Urgent first, and undated urgent still beats dated low. */
export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

// ── Tabs ─────────────────────────────────────────────────────────────

export const TASK_TABS = [
  { key: "mine",      label: "My Tasks" },
  { key: "all",       label: "All Tasks" },
  { key: "today",     label: "Today" },
  { key: "upcoming",  label: "Upcoming" },
  { key: "waiting",   label: "Waiting" },
  { key: "completed", label: "Completed" },
] as const;

export type TaskTab = (typeof TASK_TABS)[number]["key"];

export const TASK_TAB_KEYS: TaskTab[] = TASK_TABS.map((tab) => tab.key);

export function isTaskTab(value: string | undefined): value is TaskTab {
  return Boolean(value) && (TASK_TAB_KEYS as string[]).includes(value as string);
}

// ── Sorting ──────────────────────────────────────────────────────────

export const TASK_SORTS = [
  { key: "due",      label: "Due Date" },
  { key: "priority", label: "Priority" },
  { key: "created",  label: "Newest" },
  { key: "updated",  label: "Recently updated" },
  { key: "title",    label: "Name" },
] as const;

export type TaskSort = (typeof TASK_SORTS)[number]["key"];

export function isTaskSort(value: string | undefined): value is TaskSort {
  return Boolean(value) && TASK_SORTS.some((sort) => sort.key === value);
}

// ── Grouping ─────────────────────────────────────────────────────────

export const TASK_GROUPS = [
  { key: "none",     label: "No grouping" },
  { key: "status",   label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "type",     label: "Type" },
  { key: "client",   label: "Client" },
] as const;

export type TaskGroup = (typeof TASK_GROUPS)[number]["key"];

export function isTaskGroup(value: string | undefined): value is TaskGroup {
  return Boolean(value) && TASK_GROUPS.some((group) => group.key === value);
}

/** How many rows a page of the table holds. */
export const TASKS_PER_PAGE = 25;
