export const WORKFLOW_AREAS = ["sales", "clients", "projects", "marketing", "finance", "software", "system"] as const;
export const WORKFLOW_STATUSES = ["draft", "active", "paused", "deprecated", "archived"] as const;
export const STAGE_TYPES = ["standard", "approval", "wait", "decision", "delivery", "review", "launch", "completion", "custom"] as const;
export const COMPLETION_RULES = ["all_required_tasks", "specific_task", "approval_received", "automation_success", "field_condition", "manual", "all_conditions"] as const;

export type WorkflowArea = typeof WORKFLOW_AREAS[number];
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];
export type WorkflowHealth = "healthy" | "warning" | "critical" | "unknown";
export type StageType = typeof STAGE_TYPES[number];

export type WorkflowStage = {
  id: string; workflowId: string; order: number; name: string; description: string | null;
  type: StageType; ownerId: string | null; owner: string | null; team: string | null;
  targetHours: number | null; priority: string; required: boolean; allowSkip: boolean;
  completionRule: string; branchRules: Record<string, unknown>[];
  tasks: Array<{ id: string; order: number; title: string; description: string | null; assignee: string | null; priority: string; type: string; dueOffsetHours: number | null; required: boolean }>;
  approvals: Array<{ id: string; name: string; type: string; approverId: string | null; approver: string | null; dueOffsetHours: number | null; required: boolean; commentsRequired: boolean }>;
  automations: Array<{ id: string; automationId: string; name: string; eventType: string }>;
  agents: Array<{ id: string; solutionId: string; name: string; eventType: string; requireReview: boolean }>;
};

export type WorkflowRun = {
  id: string; workflowId: string; workflowName: string; name: string; clientId: string | null;
  client: string | null; projectId: string | null; project: string | null; owner: string | null;
  status: string; health: WorkflowHealth; currentStage: string | null; progress: number;
  startedAt: string; dueAt: string | null; completedAt: string | null;
  stages?: WorkflowRunStage[];
};

export type WorkflowRunStage = {
  id: string; order: number; name: string; type: string; status: string;
  targetHours: number | null; enteredAt: string | null; dueAt: string | null;
  completedAt: string | null; blockedReason: string | null; completionRule: string;
};

export type WorkflowListItem = {
  id: string; name: string; description: string | null; area: WorkflowArea; status: WorkflowStatus;
  ownerId: string | null; owner: string | null; priority: string; targetHours: number | null;
  version: number; stageCount: number; activeRuns: number; averageCompletion: number | null;
  averageDurationHours: number | null; health: WorkflowHealth; updatedAt: string;
};

export type WorkflowBoard = {
  workflows: WorkflowListItem[]; runs: WorkflowRun[];
  attention: Array<{ id: string; workflowId: string; title: string; detail: string; severity: "critical" | "warning" | "info"; href: string }>;
  bottlenecks: Array<{ stage: string; averageHours: number; targetHours: number | null; varianceHours: number | null; runs: number }>;
  templates: Array<{ id: string; name: string; description: string | null; area: WorkflowArea; stageCount: number; sourceTaskTemplateId: string | null; status: string }>;
  owners: Array<{ id: string; name: string; email: string }>;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientId: string | null }>;
  automations: Array<{ id: string; name: string; status: string }>;
  agents: Array<{ id: string; name: string; status: string }>;
  activity: Array<{ id: string; body: string | null; eventType: string; actor: string; createdAt: string }>;
  kpis: { activeWorkflows: number; runningInstances: number; waitingApproval: number; overdueSteps: number; completedThisMonth: number; needsAttention: number };
};

export type WorkflowFilters = {
  q?: string; area?: string; status?: string; owner?: string; health?: string;
  activeRuns?: string; sort: "updated" | "active" | "completion" | "duration" | "name";
  view: "table" | "cards" | "runs" | "templates";
};

export type WorkflowDetail = WorkflowListItem & {
  purpose: string | null; createdAt: string; stages: WorkflowStage[]; runsDetail: WorkflowRun[];
  approvals: Array<Record<string, unknown>>; tasks: Array<Record<string, unknown>>;
  activity: WorkflowBoard["activity"];
};

export const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
