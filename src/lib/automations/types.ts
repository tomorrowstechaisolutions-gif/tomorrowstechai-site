export const AUTOMATION_CATEGORIES = ["sales", "projects", "marketing", "clients", "finance", "ai", "system"] as const;
export const AUTOMATION_STATUSES = ["draft", "active", "paused", "warning", "error", "archived"] as const;
export const RUN_STATUSES = ["running", "success", "partial", "failed", "canceled", "skipped"] as const;
export const STEP_TYPES = ["trigger", "condition", "delay", "action", "branch"] as const;

export type AutomationCategory = typeof AUTOMATION_CATEGORIES[number];
export type AutomationStatus = typeof AUTOMATION_STATUSES[number];
export type RunStatus = typeof RUN_STATUSES[number];
export type StepType = typeof STEP_TYPES[number];
export type HealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type TriggerDefinition = {
  id: string;
  key: string;
  name: string;
  area: AutomationCategory;
  description: string | null;
  enabled: boolean;
};

export type AutomationStep = {
  id: string;
  automationId: string;
  order: number;
  type: StepType;
  name: string;
  actionType: string | null;
  config: Record<string, unknown>;
  branchKey: string;
  enabled: boolean;
};

export type AutomationListItem = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  category: AutomationCategory;
  status: AutomationStatus;
  health: HealthStatus;
  ownerId: string | null;
  owner: string | null;
  triggerId: string | null;
  trigger: string;
  triggerKey: string | null;
  sourceSystem: string;
  lockedExecution: boolean;
  tags: string[];
  estimatedMinutesSaved: number | null;
  runs: number;
  successes: number;
  failures: number;
  successRate: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  automationId: string;
  automationName: string;
  triggerKey: string;
  triggerSummary: string | null;
  status: RunStatus;
  mode: "live" | "test" | "dry_run";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  relatedRecordType: string | null;
  errorSummary: string | null;
  steps?: AutomationRunStep[];
};

export type AutomationRunStep = {
  id: string;
  order: number;
  type: StepType;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped" | "preview";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
};

export type AutomationError = {
  id: string;
  automationId: string;
  automationName: string;
  runId: string | null;
  stepName: string | null;
  message: string;
  retryStatus: string;
  resolved: boolean;
  createdAt: string;
};

export type AutomationBoard = {
  automations: AutomationListItem[];
  runs: AutomationRun[];
  errors: AutomationError[];
  triggers: TriggerDefinition[];
  owners: Array<{ id: string; name: string; email: string; role: string }>;
  templates: Array<{ id: string; name: string; description: string | null; category: AutomationCategory; definition: Record<string, unknown> }>;
  kpis: {
    active: number;
    runsThisMonth: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number | null;
    needsAttention: number;
    timeSavedMinutes: number | null;
  };
};

export type AutomationFilters = {
  q?: string;
  category?: string;
  status?: string;
  trigger?: string;
  owner?: string;
  health?: string;
  lastRun?: string;
  sort: "last_run" | "runs" | "success" | "updated" | "name";
  view: "table" | "cards" | "runs" | "templates";
};

export type AutomationDetail = AutomationListItem & {
  triggerConfig: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  failureThreshold: Record<string, unknown>;
  notifications: Record<string, unknown>;
  steps: AutomationStep[];
  runsDetail: AutomationRun[];
  errorsDetail: AutomationError[];
  activity: Array<{ id: string; eventType: string; body: string | null; actor: string; createdAt: string }>;
};

export const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
