import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  loadAiChoices,
  loadConversations,
  loadRuns,
  loadSolution,
  loadSolutionEvents,
  loadSolutionTasks,
  loadUsage,
  loadVersions,
  type ConversationRow,
  type PromptVersion,
  type RunsDetail,
  type SolutionDetail,
  type SolutionEvent,
  type SolutionTask,
  type UsageDetail,
} from "@/lib/ai/detail";
import { loadProviders, type ProviderRow } from "@/lib/ai/providers";
import { retrievalConnected } from "@/lib/ai/knowledge";
import {
  BILLING_TYPE_LABELS,
  HEALTH_TONE,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_TONE,
  KNOWLEDGE_STATUS_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  MICRO_PER_DOLLAR,
  PROVIDER_STATUS_LABELS,
  PROVIDER_TONE,
  SEVERITY_TONE,
  STATUS_TONE,
  TOOL_LABELS,
  TOOL_ORDER,
  USAGE_TONE,
  WINDOW_LABELS,
  WRITE_TOOLS,
  isUuid,
  margin,
  microUsd,
  safeUrl,
  tokens as fmtTokens,
  type AlertSeverity,
  type IntegrationStatus,
  type KnowledgeSourceType,
  type KnowledgeStatus,
  type ToolKey,
  type Window,
} from "@/lib/ai/types";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import MiniBars from "@/components/admin/cc/MiniBars";
import { ago, count, DASH, money, pct, shortDate } from "@/components/admin/cc/format";
import {
  ActionForm,
  AddDeployment,
  AddIntegration,
  AddKnowledge,
  ArchiveSolution,
  EditDeployment,
  EditIntegration,
  EditKnowledge,
  ImportCodePrompt,
  NewAiTask,
  PromptEditor,
  RemoveDeployment,
  RemoveIntegration,
  RemoveKnowledge,
  ResolveAlert,
  SettingsForm,
  SyncKnowledge,
  TestConsole,
  ToolToggle,
  VersionActions,
} from "@/components/admin/cc/ai/AiForms";
import { setSolutionStatusAction } from "@/app/admin/ai-actions";
import {
  IconAlert,
  IconBot,
  IconChart,
  IconCheckSquare,
  IconCode,
  IconDollar,
  IconFile,
  IconLayers,
  IconLink,
  IconPulse,
  IconRepeat,
  IconServer,
  IconSettings,
  IconSpark,
  IconUsers,
  IconZap,
} from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

const TABS = [
  "Overview", "Prompt & Behavior", "Knowledge", "Integrations", "Usage",
  "Costs", "Performance", "Clients", "Automations", "Logs", "Settings",
] as const;

type Tab = (typeof TABS)[number];

const slugOf = (tab: string): string =>
  tab.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const WINDOWS: Window[] = ["7d", "30d", "90d"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "AI solution" };
  const supabase = await createSupabaseServerClient();
  const solution = await loadSolution(supabase, id).catch(() => null);
  return { title: solution ? `${solution.name} — AI Solutions` : "AI solution" };
}

/**
 * One AI solution, everything about it.
 *
 * The tab order follows the questions an operator actually asks: what is
 * this and is it working, what is it told to do, what does it know, what
 * can it reach, how much is it used, what does that cost, how well does it
 * answer, who has it, what it runs on a schedule, what happened, and last
 * — how to change it.
 *
 * Every tab loads only its own data, so opening Overview never pays for
 * ninety days of usage rows, and a slow Costs query cannot blank the header.
 */
export default async function SolutionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const canManage = ["owner", "admin"].includes(session.admin.role);

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const solution = await loadSolution(supabase, id);
  if (!solution) notFound();

  const query = await searchParams;
  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab: Tab = TABS.find((candidate) => slugOf(candidate) === requested) ?? "Overview";
  const windowRaw = typeof query.window === "string" ? query.window : "30d";
  const window: Window = (WINDOWS as string[]).includes(windowRaw) ? (windowRaw as Window) : "30d";

  let content: React.ReactNode = null;

  if (tab === "Overview") {
    content = <OverviewTab solution={solution} canManage={canManage} />;
  } else if (tab === "Prompt & Behavior") {
    const versions = await loadVersions(supabase, solution.id);
    content = <PromptTab solution={solution} versions={versions} canManage={canManage} />;
  } else if (tab === "Knowledge") {
    const retrieval = await retrievalConnected();
    content = <KnowledgeTab solution={solution} retrieval={retrieval} canManage={canManage} />;
  } else if (tab === "Integrations") {
    const providers = await loadProviders();
    content = <IntegrationsTab solution={solution} providers={providers} canManage={canManage} />;
  } else if (tab === "Usage") {
    const usage = await loadUsage(supabase, solution.id, window);
    content = <UsageTab solution={solution} usage={usage} />;
  } else if (tab === "Costs") {
    const [usage, providers] = await Promise.all([
      loadUsage(supabase, solution.id, window),
      loadProviders(),
    ]);
    content = <CostsTab solution={solution} usage={usage} providers={providers} />;
  } else if (tab === "Performance") {
    const [usage, conversations] = await Promise.all([
      loadUsage(supabase, solution.id, window),
      loadConversations(supabase, solution.id, 200),
    ]);
    content = <PerformanceTab solution={solution} usage={usage} conversations={conversations} />;
  } else if (tab === "Clients") {
    const [choices, conversations] = await Promise.all([
      loadAiChoices(supabase),
      loadConversations(supabase, solution.id, 50),
    ]);
    content = (
      <ClientsTab
        solution={solution}
        choices={choices}
        conversations={conversations}
        canManage={canManage}
      />
    );
  } else if (tab === "Automations") {
    const [runs, tasks, choices] = await Promise.all([
      loadRuns(supabase, solution.id, window),
      loadSolutionTasks(supabase, solution.id),
      loadAiChoices(supabase),
    ]);
    content = (
      <AutomationsTab
        solution={solution}
        runs={runs}
        tasks={tasks}
        people={choices.people}
        canManage={canManage}
      />
    );
  } else if (tab === "Logs") {
    const [usage, events] = await Promise.all([
      loadUsage(supabase, solution.id, window),
      loadSolutionEvents(supabase, solution.id, 60),
    ]);
    content = <LogsTab solution={solution} usage={usage} events={events} />;
  } else {
    const choices = await loadAiChoices(supabase);
    content = <SettingsTab solution={solution} choices={choices} canManage={canManage} />;
  }

  const windowed = ["Usage", "Costs", "Performance", "Automations", "Logs"].includes(tab);
  const paused = solution.status === "paused";

  return (
    <>
      <div className="cc-greet">
        <div className="cc-idhead">
          {solution.coverImageUrl ? (
            <Image className="cc-solution-detail-cover" src={solution.coverImageUrl} alt={`${solution.name} cover`} width={1254} height={1254} priority />
          ) : (
            <span className="cc-mono lg">{(solution.internalName || solution.name).slice(0, 2).toUpperCase()}</span>
          )}
          <div>
            <Link className="cc-link" href="/admin/ai-solutions">← AI Solutions</Link>
            <h1>{solution.name}</h1>
            <p>
              {[
                solution.typeLabel,
                solution.client ? solution.client.name : "Internal",
                solution.providerName ?? "No provider set",
                solution.model ?? "No model set",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="cc-taglist" style={{ marginTop: 8 }}>
              <span className={`cc-chip ${STATUS_TONE[solution.status]}`}>{solution.statusLabel}</span>
              <span className={`cc-chip ${HEALTH_TONE[solution.health.state]}`}>{solution.health.label}</span>
              <span className="cc-chip t-muted">{solution.targetLabel}</span>
              {solution.isArchived ? <span className="cc-chip t-muted">Archived</span> : null}
              {solution.openAlerts.length > 0 ? (
                <span className="cc-chip t-risk">
                  {solution.openAlerts.length} open {solution.openAlerts.length === 1 ? "alert" : "alerts"}
                </span>
              ) : null}
              {solution.modelDeprecatedOn ? (
                <span className="cc-chip t-warn">Model retires {shortDate(solution.modelDeprecatedOn)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="cc-greet-actions">
          {safeUrl(solution.deploymentUrl) ? (
            <a className="cc-btn" href={solution.deploymentUrl as string} target="_blank" rel="noopener noreferrer nofollow">
              Open
            </a>
          ) : null}
          {canManage && !solution.isArchived ? (
            <ActionForm
              action={setSolutionStatusAction}
              label={paused ? "Resume" : "Pause"}
              confirm={
                paused
                  ? undefined
                  : "Pause this solution? It stays configured — this only records that it should not be running."
              }
            >
              <input type="hidden" name="solution_id" value={solution.id} />
              <input type="hidden" name="status" value={paused ? "active" : "paused"} />
            </ActionForm>
          ) : null}
        </div>
      </div>

      <nav className="cc-tabs" aria-label="Solution sections">
        {TABS.map((candidate) => (
          <Link
            key={candidate}
            href={`?tab=${slugOf(candidate)}`}
            className={`cc-tab ${tab === candidate ? "is-on" : ""}`}
            aria-current={tab === candidate ? "page" : undefined}
          >
            {candidate}
            {candidate === "Clients" && solution.deployments.length > 0 ? (
              <span className="cc-tab-n">{count(solution.deployments.length)}</span>
            ) : null}
            {candidate === "Knowledge" && solution.knowledge.length > 0 ? (
              <span className="cc-tab-n">{count(solution.knowledge.length)}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {windowed ? (
        <div className="cc-viewbar">
          <div className="cc-tabs" aria-label="Reporting window">
            {WINDOWS.map((candidate) => (
              <Link
                key={candidate}
                href={`?tab=${slugOf(tab)}&window=${candidate}`}
                className={`cc-tab ${window === candidate ? "is-on" : ""}`}
                aria-current={window === candidate ? "page" : undefined}
              >
                {WINDOW_LABELS[candidate]}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="cc-board">{content}</div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Shared bits
   ══════════════════════════════════════════════════════════════════════ */

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="cc-stat">
      <div className="cc-stat-label">{label}</div>
      <div className={`cc-stat-value ${tone ?? ""}`}>{value}</div>
      {hint ? <div className="cc-stat-hint">{hint}</div> : null}
    </div>
  );
}

const healthTone = (state: string): string =>
  state === "healthy" ? "t-ok" : state === "critical" ? "t-risk" : state === "warning" ? "t-warn" : "t-none";

/** Never a number when nothing was measured — a word instead. */
function Measured({ value, unknown }: { value: string | null; unknown: string }) {
  return value === null ? <span className="cc-faint">{unknown}</span> : <>{value}</>;
}

function AlertsPanel({ solution, canManage }: { solution: SolutionDetail; canManage: boolean }) {
  if (solution.openAlerts.length === 0) return null;
  return (
    <Panel title="Open alerts" icon={<IconAlert size={15} />} className="cc-s12">
      <div className="cc-alerts">
        {solution.openAlerts.map((alert) => (
          <div key={alert.id} className={`cc-alert p-${alert.severity}`}>
            <span className={`cc-alert-pri ${SEVERITY_TONE[alert.severity as AlertSeverity] ?? "t-muted"}`} />
            <div className="cc-alert-main">
              <div className="cc-alert-title">{alert.title}</div>
              {alert.detail ? <div className="cc-alert-detail">{alert.detail}</div> : null}
              <div className="cc-alert-cat">{ago(alert.createdAt)}</div>
            </div>
            {canManage ? <ResolveAlert solutionId={solution.id} alertId={alert.id} /> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Overview
   ══════════════════════════════════════════════════════════════════════ */

function OverviewTab({ solution, canManage }: { solution: SolutionDetail; canManage: boolean }) {
  const marginShare = solution.marginShare;

  return (
    <>
      <AlertsPanel solution={solution} canManage={canManage} />

      <Panel title="At a glance" sub="Last 30 days" icon={<IconPulse size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat
            label="Health"
            value={solution.health.label}
            tone={healthTone(solution.health.state)}
            hint={
              solution.health.observed
                ? solution.health.reasons[0]?.label ?? "Answering normally"
                : "Not enough recent calls to judge"
            }
          />
          <Stat
            label="Calls"
            value={count(solution.calls)}
            hint={solution.conversations > 0 ? `${count(solution.conversations)} conversations` : "No conversations recorded"}
          />
          <Stat
            label="Success rate"
            value={solution.successRate === null ? DASH : pct(solution.successRate, 1)}
            tone={solution.successRate !== null && solution.successRate < 0.9 ? "t-risk" : undefined}
            hint={solution.successRate === null ? "Nothing measured yet" : `${count(solution.health.failures)} failures in ${count(solution.health.calls)} recent calls`}
          />
          <Stat
            label="Avg response"
            value={solution.avgLatencyMs === null ? DASH : `${(solution.avgLatencyMs / 1000).toFixed(1)}s`}
            hint={solution.avgLatencyMs === null ? "Nothing measured yet" : "Measured on real calls"}
          />
          <Stat
            label="Cost"
            value={solution.costMicroUsd === null ? "Rate not set" : microUsd(solution.costMicroUsd)}
            hint={
              solution.costMicroUsd === null
                ? "Enter model rates to price usage"
                : solution.costPartial
                  ? "Partial — some calls have no rate"
                  : "Frozen at the rate in force"
            }
          />
          <Stat
            label="Margin"
            value={marginShare === null ? DASH : pct(marginShare, 0)}
            tone={marginShare !== null && marginShare < 0 ? "t-risk" : undefined}
            hint={
              solution.monthlyRevenueCents === null
                ? "No recurring price set"
                : `${money(solution.monthlyRevenueCents)} recurring`
            }
          />
        </div>
      </Panel>

      <Panel title="What this is" icon={<IconBot size={15} />} className="cc-s6">
        {solution.description ? <p className="cc-note" style={{ marginTop: 0 }}>{solution.description}</p> : null}
        <dl className="cc-kv">
          <dt>Purpose</dt>
          <dd>{solution.purpose ?? <span className="cc-faint">Not recorded</span>}</dd>
          <dt>Type</dt>
          <dd>{solution.typeLabel}</dd>
          <dt>Client</dt>
          <dd>
            {solution.client ? (
              <Link className="cc-link" href={`/admin/clients/${solution.client.id}`}>{solution.client.name}</Link>
            ) : (
              "Internal — ours"
            )}
          </dd>
          <dt>Service</dt>
          <dd>
            {solution.service ? (
              <Link className="cc-link" href="/admin/services">{solution.service.name}</Link>
            ) : (
              <span className="cc-faint">Not linked to a catalog service</span>
            )}
          </dd>
          <dt>Runs on</dt>
          <dd>
            {solution.targetLabel}
            {solution.app ? (
              <> · <Link className="cc-link" href={`/admin/apps/${solution.app.id}`}>{solution.app.name}</Link></>
            ) : null}
            {solution.website ? (
              <> · <Link className="cc-link" href={`/admin/websites/${solution.website.id}`}>{solution.website.domain}</Link></>
            ) : null}
          </dd>
          <dt>Source</dt>
          <dd>{solution.sourcePath ? <span className="cc-code">{solution.sourcePath}</span> : <span className="cc-faint">Not recorded</span>}</dd>
          <dt>Owner</dt>
          <dd>{solution.owner ?? <span className="cc-faint">Unassigned</span>}</dd>
          <dt>Slug</dt>
          <dd><span className="cc-code">{solution.slug}</span></dd>
        </dl>
      </Panel>

      <Panel title="Model" icon={<IconServer size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Provider</dt>
          <dd>
            {solution.providerName ?? <span className="cc-faint">Not set</span>}
            {solution.providerStatus ? (
              <> <span className={`cc-chip ${PROVIDER_TONE[solution.providerStatus as keyof typeof PROVIDER_TONE] ?? "t-none"}`}>
                {PROVIDER_STATUS_LABELS[solution.providerStatus as keyof typeof PROVIDER_STATUS_LABELS] ?? solution.providerStatus}
              </span></>
            ) : null}
          </dd>
          <dt>Model</dt>
          <dd>{solution.model ? <span className="cc-code">{solution.model}</span> : <span className="cc-faint">Not set</span>}</dd>
          <dt>Fallback</dt>
          <dd>
            {solution.fallbackModel ? (
              <span className="cc-code">{solution.fallbackModel}</span>
            ) : (
              <span className="cc-faint">None — a provider outage stops this solution</span>
            )}
          </dd>
          <dt>Temperature</dt>
          <dd>{solution.temperature === null ? <span className="cc-faint">Provider default</span> : solution.temperature}</dd>
          <dt>Max output</dt>
          <dd>{solution.maxOutputTokens === null ? <span className="cc-faint">Provider default</span> : `${count(solution.maxOutputTokens)} tokens`}</dd>
          <dt>Prompt</dt>
          <dd>
            {solution.activeVersion ? (
              <>v{solution.activeVersion.version} · {solution.versionCount} saved</>
            ) : (
              <span className="cc-faint">No version saved — the prompt lives in code</span>
            )}
          </dd>
        </dl>
        {solution.modelDeprecatedOn ? (
          <p className="cc-note">
            This model is scheduled to retire on {shortDate(solution.modelDeprecatedOn)}. Choose a
            replacement in Settings before then.
          </p>
        ) : null}
      </Panel>

      <Panel title="Health detail" icon={<IconPulse size={15} />} className="cc-s6">
        {solution.health.reasons.length === 0 ? (
          <p className="cc-note" style={{ marginTop: 0 }}>
            {solution.health.observed
              ? "Nothing is wrong that this system can see."
              : "Fewer than three calls in the last week, so no verdict has been reached. This is Unknown, not Healthy."}
          </p>
        ) : (
          <div className="cc-checks">
            {solution.health.reasons.map((reason) => (
              <div key={reason.label} className={`cc-check-row ${reason.severity === "critical" ? "t-risk" : reason.severity === "warning" ? "t-warn" : "t-info"}`}>
                <span className="cc-check-dot" />
                {/*
                  The reason lives in the name cell rather than the detail
                  cell on purpose: .cc-check-detail is hidden below 640px,
                  and "why is this red" is the one thing a phone must not
                  lose.
                */}
                <span className="cc-check-name">
                  {reason.label}
                  <div className="cc-faint" style={{ fontWeight: 400, marginTop: 2 }}>{reason.detail}</div>
                </span>
                <span className="cc-check-detail" />
                <span className="cc-check-score" />
              </div>
            ))}
          </div>
        )}
        <dl className="cc-kv">
          <dt>Last activity</dt>
          <dd>{solution.health.lastActivityAt ? ago(solution.health.lastActivityAt) : <span className="cc-faint">Never</span>}</dd>
          <dt>Error rate</dt>
          <dd>{solution.health.errorRate === null ? <span className="cc-faint">Not measured</span> : pct(solution.health.errorRate, 1)}</dd>
        </dl>
      </Panel>

      <Panel title="Commercials" icon={<IconDollar size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Billing</dt>
          <dd>{BILLING_TYPE_LABELS[solution.billingType]}</dd>
          <dt>Monthly price</dt>
          <dd>{solution.monthlyPriceCents === null ? <span className="cc-faint">Not set</span> : money(solution.monthlyPriceCents)}</dd>
          <dt>Setup fee</dt>
          <dd>{solution.setupFeeCents === null ? <span className="cc-faint">None</span> : money(solution.setupFeeCents)}</dd>
          <dt>Usage markup</dt>
          <dd>{solution.usageMarkupPct === null ? <span className="cc-faint">Not set</span> : `${solution.usageMarkupPct}%`}</dd>
          <dt>Recurring revenue</dt>
          <dd>
            {solution.monthlyRevenueCents === null
              ? <span className="cc-faint">Nothing recurring recorded</span>
              : `${money(solution.monthlyRevenueCents)} / month`}
          </dd>
          <dt>Open work</dt>
          <dd>{count(solution.openTasks)} {solution.openTasks === 1 ? "task" : "tasks"}</dd>
        </dl>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Prompt & Behavior
   ══════════════════════════════════════════════════════════════════════ */

function PromptTab({
  solution,
  versions,
  canManage,
}: {
  solution: SolutionDetail;
  versions: PromptVersion[];
  canManage: boolean;
}) {
  const active = solution.activeVersion;
  const editable = solution.promptEditable;

  return (
    <>
      {!editable ? (
        <Panel title="This prompt is not editable here" icon={<IconAlert size={15} />} className="cc-s12">
          <p className="cc-note" style={{ marginTop: 0 }}>
            {solution.promptLockedReason ??
              "The prompt for this solution is composed in code and cannot safely be replaced from a text box."}
          </p>
          <p className="cc-note">
            Editing it means changing the code and deploying, which is deliberate: this
            solution&apos;s output is consumed by something that expects a particular shape,
            and a free-text override would break it silently.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Active prompt"
        sub={active ? `Version ${active.version} · live since ${ago(active.activatedAt ?? active.createdAt)}` : "No version saved"}
        icon={<IconSpark size={15} />}
        className="cc-s8"
      >
        {!active ? (
          <>
            <p className="cc-note" style={{ marginTop: 0 }}>
              Nothing has been saved here yet, so this solution is running the prompt that
              ships in its code. Importing it makes that text version 1 without changing a
              single character of behaviour — after which edits become possible and tracked.
            </p>
            {canManage && editable ? <ImportCodePrompt solutionId={solution.id} /> : null}
          </>
        ) : (
          <PromptEditor
            solutionId={solution.id}
            active={{
              systemPrompt: active.systemPrompt,
              persona: active.persona,
              tone: active.tone,
              purpose: active.purpose,
              responseRules: active.responseRules,
              escalationRules: active.escalationRules,
              fallbackBehavior: active.fallbackBehavior,
              safetyRules: active.safetyRules,
              temperature: active.temperature,
              maxOutputTokens: active.maxOutputTokens,
            }}
            canManage={canManage && editable}
          />
        )}
      </Panel>

      <Panel title="Test it" sub="Real call, real model" icon={<IconZap size={15} />} className="cc-s4">
        {canManage ? (
          <TestConsole
            solutionId={solution.id}
            activePrompt={active?.systemPrompt ?? null}
            model={solution.model}
          />
        ) : (
          <p className="cc-note" style={{ marginTop: 0 }}>
            Running a test spends real provider credit, so it is limited to managers.
          </p>
        )}
      </Panel>

      <Panel
        title="Version history"
        sub={`${versions.length} ${versions.length === 1 ? "version" : "versions"}`}
        icon={<IconFile size={15} />}
        className="cc-s12"
      >
        {versions.length === 0 ? (
          <EmptyState
            title="No versions yet"
            text="Every save here creates a numbered version and keeps the one before it. Nothing is ever overwritten."
            icon={<IconFile size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Change notes</th>
                  <th>Length</th>
                  <th>Saved by</th>
                  <th>Saved</th>
                  <th>Activated</th>
                  {canManage && solution.promptEditable ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td className="cc-strong">v{version.version}</td>
                    <td>
                      <span className={`cc-chip ${version.status === "active" ? "t-ok" : version.status === "draft" ? "t-info" : "t-muted"}`}>
                        {version.status}
                      </span>
                    </td>
                    <td>{version.changeNotes ?? <span className="cc-faint">{DASH}</span>}</td>
                    <td className="cc-dim">{count(version.systemPrompt.length)} chars</td>
                    <td className="cc-dim">{version.createdBy ?? DASH}</td>
                    <td className="cc-dim" title={new Date(version.createdAt).toLocaleString("en-US")}>
                      {ago(version.createdAt)}
                    </td>
                    <td className="cc-dim">{version.activatedAt ? ago(version.activatedAt) : DASH}</td>
                    {canManage && solution.promptEditable ? (
                      <td>
                        <VersionActions
                          solutionId={solution.id}
                          versionId={version.id}
                          isActive={version.status === "active"}
                          canManage={canManage}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {active ? (
        <Panel title="Behaviour rules" icon={<IconSettings size={15} />} className="cc-s12">
          <dl className="cc-kv">
            <dt>Persona</dt>
            <dd>{active.persona ?? <span className="cc-faint">Not set</span>}</dd>
            <dt>Tone</dt>
            <dd>{active.tone ?? <span className="cc-faint">Not set</span>}</dd>
            <dt>Purpose</dt>
            <dd>{active.purpose ?? <span className="cc-faint">Not set</span>}</dd>
            <dt>Response rules</dt>
            <dd>{active.responseRules ?? <span className="cc-faint">Not set</span>}</dd>
            <dt>Escalation</dt>
            <dd>{active.escalationRules ?? <span className="cc-faint">Not set — it will not hand off</span>}</dd>
            <dt>Fallback</dt>
            <dd>{active.fallbackBehavior ?? <span className="cc-faint">Not set</span>}</dd>
            <dt>Safety rules</dt>
            <dd>{active.safetyRules ?? <span className="cc-faint">Not set</span>}</dd>
          </dl>
        </Panel>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Knowledge
   ══════════════════════════════════════════════════════════════════════ */

function KnowledgeTab({
  solution,
  retrieval,
  canManage,
}: {
  solution: SolutionDetail;
  retrieval: boolean;
  canManage: boolean;
}) {
  const stale = solution.knowledge.filter((source) => source.stale);

  return (
    <>
      {!retrieval ? (
        <Panel title="Retrieval is not connected" icon={<IconAlert size={15} />} className="cc-s12">
          <p className="cc-note" style={{ marginTop: 0 }}>
            Sources listed here are tracked and measured, but nothing yet reads them at
            answer time — there is no vector store wired up. Whatever this solution knows,
            it knows from its prompt. Saying otherwise on this screen would be the exact
            kind of comfortable fiction that gets a client a wrong answer.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Knowledge sources"
        sub={`${solution.knowledge.length} ${solution.knowledge.length === 1 ? "source" : "sources"}`}
        icon={<IconLayers size={15} />}
        className="cc-s12"
        footer={canManage ? <AddKnowledge solutionId={solution.id} /> : undefined}
      >
        {solution.knowledge.length === 0 ? (
          <EmptyState
            title="No sources recorded"
            text="Add the pages, documents and FAQs this solution is supposed to be answering from, so there is a list to check when an answer is wrong."
            icon={<IconLayers size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">Documents</th>
                  <th className="num">Chunks</th>
                  <th className="num">Size</th>
                  <th>Last synced</th>
                  <th>Owner</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {solution.knowledge.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div className="cc-strong">{source.name}</div>
                      {source.location ? <div className="cc-faint cc-code">{source.location}</div> : null}
                      {source.lastError ? <div className="cc-faint" style={{ color: "var(--risk, #f87171)" }}>{source.lastError}</div> : null}
                    </td>
                    <td className="cc-dim">
                      {KNOWLEDGE_TYPE_LABELS[source.sourceType as KnowledgeSourceType] ?? source.sourceType}
                    </td>
                    <td>
                      <span className={`cc-chip ${source.stale ? "t-warn" : KNOWLEDGE_TONE_SAFE(source.status)}`}>
                        {source.stale ? "Stale" : KNOWLEDGE_STATUS_LABELS[source.status as KnowledgeStatus] ?? source.status}
                      </span>
                    </td>
                    <td className="num cc-dim">{source.documentCount === null ? DASH : count(source.documentCount)}</td>
                    <td className="num cc-dim">{source.chunkCount === null ? DASH : count(source.chunkCount)}</td>
                    <td className="num cc-dim">{source.sizeBytes === null ? DASH : `${Math.max(1, Math.round(source.sizeBytes / 1024))} KB`}</td>
                    <td className="cc-dim">
                      {source.lastSyncedAt ? ago(source.lastSyncedAt) : <span className="cc-faint">Never</span>}
                      {source.refreshDays ? <div className="cc-faint">every {source.refreshDays}d</div> : null}
                    </td>
                    <td className="cc-dim">{source.owner ?? DASH}</td>
                    {canManage ? (
                      <td>
                        <div className="cc-rowacts">
                          <EditKnowledge
                            solutionId={solution.id}
                            value={{
                              id: source.id,
                              name: source.name,
                              sourceType: source.sourceType,
                              location: source.location,
                              content: source.content,
                              status: source.status,
                              refreshDays: source.refreshDays,
                              owner: source.owner,
                            }}
                          />
                          <SyncKnowledge solutionId={solution.id} sourceId={source.id} />
                          <RemoveKnowledge solutionId={solution.id} sourceId={source.id} name={source.name} />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {stale.length > 0 ? (
        <Panel title="Past their refresh window" icon={<IconAlert size={15} />} className="cc-s12">
          <ul className="cc-note" style={{ marginTop: 0 }}>
            {stale.map((source) => (
              <li key={source.id}>
                <strong>{source.name}</strong> — last synced {source.lastSyncedAt ? ago(source.lastSyncedAt) : "never"},
                set to refresh every {source.refreshDays} days.
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

const KNOWLEDGE_TONE_SAFE = (status: string): string => {
  if (status === "ready") return "t-ok";
  if (status === "error") return "t-risk";
  if (status === "syncing" || status === "pending") return "t-info";
  return "t-muted";
};

/* ══════════════════════════════════════════════════════════════════════
   Integrations
   ══════════════════════════════════════════════════════════════════════ */

function IntegrationsTab({
  solution,
  providers,
  canManage,
}: {
  solution: SolutionDetail;
  providers: ProviderRow[];
  canManage: boolean;
}) {
  const provider = providers.find((p) => p.key === solution.providerKey) ?? null;
  const granted = new Map(solution.tools.map((tool) => [tool.tool, tool]));

  return (
    <>
      <Panel title="Model provider" icon={<IconServer size={15} />} className="cc-s6">
        {!provider ? (
          <p className="cc-note" style={{ marginTop: 0 }}>No provider is set for this solution.</p>
        ) : (
          <dl className="cc-kv">
            <dt>Provider</dt>
            <dd>{provider.name}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`cc-chip ${PROVIDER_TONE[provider.status]}`}>
                {PROVIDER_STATUS_LABELS[provider.status]}
              </span>
              {provider.statusDetail ? <div className="cc-faint">{provider.statusDetail}</div> : null}
            </dd>
            <dt>Key</dt>
            <dd>
              {provider.keyPresent ? (
                <span className="cc-chip t-ok">Set on the server</span>
              ) : (
                <span className="cc-chip t-risk">Missing</span>
              )}
              {provider.credentialEnv ? (
                <div className="cc-faint cc-code">{provider.credentialEnv}</div>
              ) : null}
            </dd>
            <dt>Last checked</dt>
            <dd>{provider.lastCheckedAt ? ago(provider.lastCheckedAt) : <span className="cc-faint">Never</span>}</dd>
          </dl>
        )}
        <p className="cc-note">
          Only the name of the environment variable is shown here. The value is never read
          into a page, never sent to the browser, and there is no field anywhere in this
          Admin Center that can reveal it.
        </p>
      </Panel>

      <Panel
        title="Connected systems"
        sub={`${solution.integrations.length} recorded`}
        icon={<IconLink size={15} />}
        className="cc-s6"
        footer={canManage ? <AddIntegration solutionId={solution.id} /> : undefined}
      >
        {solution.integrations.length === 0 ? (
          <EmptyState
            title="Nothing connected"
            text="Record what this solution reaches — a calendar, a CRM, a mailbox — so an outage somewhere else has an obvious suspect here."
            icon={<IconLink size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>System</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Last checked</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {solution.integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      <div className="cc-strong">
                        {integration.label || integration.provider}
                        {integration.isRequired ? <span className="cc-chip t-info">Required</span> : null}
                      </div>
                      {integration.accountRef ? <div className="cc-faint">{integration.accountRef}</div> : null}
                      {integration.error ? <div className="cc-faint">{integration.error}</div> : null}
                    </td>
                    <td className="cc-dim">{integration.environment}</td>
                    <td>
                      <span className={`cc-chip ${INTEGRATION_TONE[integration.status as IntegrationStatus] ?? "t-none"}`}>
                        {INTEGRATION_STATUS_LABELS[integration.status as IntegrationStatus] ?? integration.status}
                      </span>
                    </td>
                    <td className="cc-dim">
                      {integration.lastCheckedAt ? ago(integration.lastCheckedAt) : <span className="cc-faint">Never</span>}
                    </td>
                    {canManage ? (
                      <td>
                        <div className="cc-rowacts">
                          <EditIntegration
                            solutionId={solution.id}
                            value={{
                              id: integration.id,
                              provider: integration.provider,
                              label: integration.label,
                              status: integration.status,
                              environment: integration.environment,
                              accountRef: integration.accountRef,
                              isRequired: integration.isRequired,
                            }}
                          />
                          <RemoveIntegration
                            solutionId={solution.id}
                            integrationId={integration.id}
                            label={integration.label || integration.provider}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="What this AI is allowed to do"
        sub="Nothing is granted by default"
        icon={<IconSettings size={15} />}
        className="cc-s12"
      >
        <p className="cc-note" style={{ marginTop: 0 }}>
          An AI solution starts with no access to this Admin Center. Each permission below
          is granted one at a time and each grant is written to the audit trail with who
          did it. Anything that can change data is marked, and stays behind approval.
        </p>
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Effect</th>
                <th>State</th>
                <th>Approval</th>
                <th>Granted by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {TOOL_ORDER.map((tool) => {
                const grant = granted.get(tool);
                const allowed = Boolean(grant?.allowed);
                const writes = WRITE_TOOLS.includes(tool as ToolKey);
                return (
                  <tr key={tool}>
                    <td className="cc-strong">{TOOL_LABELS[tool]}</td>
                    <td>
                      <span className={`cc-chip ${writes ? "t-warn" : "t-muted"}`}>
                        {writes ? "Can change data" : "Read only"}
                      </span>
                    </td>
                    <td>
                      <span className={`cc-chip ${allowed ? "t-ok" : "t-muted"}`}>
                        {allowed ? "Granted" : "Not granted"}
                      </span>
                    </td>
                    <td className="cc-dim">
                      {!allowed ? DASH : grant?.requiresApproval ? "Requires approval" : "Runs unattended"}
                    </td>
                    <td className="cc-dim">
                      {grant?.grantedBy ?? DASH}
                      {grant?.grantedAt ? <div className="cc-faint">{ago(grant.grantedAt)}</div> : null}
                    </td>
                    <td>
                      <ToolToggle
                        solutionId={solution.id}
                        tool={tool}
                        allowed={allowed}
                        requiresApproval={Boolean(grant?.requiresApproval)}
                        canManage={canManage}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Usage
   ══════════════════════════════════════════════════════════════════════ */

function UsageTab({ solution, usage }: { solution: SolutionDetail; usage: UsageDetail }) {
  const totals = usage.totals;

  return (
    <>
      <Panel
        title="Usage"
        sub={WINDOW_LABELS[usage.window]}
        icon={<IconChart size={15} />}
        className="cc-s12"
        bodyClass="flush"
      >
        <div className="cc-stats">
          <Stat label="Calls" value={count(totals.calls)} hint={`${count(totals.conversations)} conversations`} />
          <Stat label="Input tokens" value={fmtTokens(totals.inputTokens)} hint="What it was given" />
          <Stat label="Output tokens" value={fmtTokens(totals.outputTokens)} hint="What it produced" />
          <Stat label="Tool calls" value={count(totals.toolCalls)} hint={totals.toolCalls === 0 ? "None recorded" : "Actions it took"} />
          <Stat
            label="Avg response"
            value={totals.avgLatencyMs === null ? DASH : `${(totals.avgLatencyMs / 1000).toFixed(1)}s`}
            hint={totals.avgLatencyMs === null ? "Nothing measured" : "Measured end to end"}
          />
          <Stat
            label="Cost"
            value={totals.costMicroUsd === null ? "Rate not set" : microUsd(totals.costMicroUsd)}
            hint={totals.costPartial ? "Partial — some calls unpriced" : totals.costMicroUsd === null ? "Enter model rates" : "Frozen at write time"}
          />
        </div>
      </Panel>

      <Panel title="Daily volume" icon={<IconChart size={15} />} className="cc-s8">
        {usage.empty ? (
          <EmptyState
            title="Nothing in this window"
            text="No calls to this solution have been recorded over this period. That is a real zero, not a missing measurement."
            icon={<IconChart size={17} />}
          />
        ) : (
          <MiniBars
            points={usage.points.map((point) => ({ key: point.date, value: point.calls }))}
            labelLeft={usage.points[0]?.date}
            labelRight={usage.points[usage.points.length - 1]?.date}
            format={(value, key) => `${key}: ${value} calls`}
          />
        )}
      </Panel>

      <Panel title="By model" icon={<IconServer size={15} />} className="cc-s4">
        {usage.byModel.length === 0 ? (
          <p className="cc-note" style={{ marginTop: 0 }}>No calls recorded in this window.</p>
        ) : (
          <div className="cc-barlist">
            {usage.byModel.map((row) => {
              const share = totals.calls > 0 ? row.calls / totals.calls : 0;
              return (
                // Three cells, not four: below 900px .cc-barrow drops to a
                // three-column grid and a fourth child wraps onto its own
                // line. Tokens ride along in the value cell instead.
                <div key={row.model} className="cc-barrow" title={`${fmtTokens(row.tokens)} tokens`}>
                  <span className="cc-barrow-label cc-code">{row.model}</span>
                  <span className="cc-barrow-track">
                    <span className="cc-barrow-fill" style={{ width: `${Math.max(share * 100, 2)}%` }} />
                  </span>
                  <span className="cc-barrow-value">
                    {count(row.calls)}
                    <span className="cc-faint"> · {fmtTokens(row.tokens)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Recent calls"
        sub={`${usage.recent.length} shown`}
        icon={<IconPulse size={15} />}
        className="cc-s12"
      >
        {usage.recent.length === 0 ? (
          <EmptyState title="No calls" text="Nothing has been recorded for this solution in this window." icon={<IconPulse size={17} />} />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Source</th>
                  <th>Client</th>
                  <th>Model</th>
                  <th className="num">In</th>
                  <th className="num">Out</th>
                  <th className="num">Latency</th>
                  <th className="num">Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((event) => (
                  <tr key={event.id}>
                    <td className="cc-dim" title={new Date(event.occurredAt).toLocaleString("en-US")}>{ago(event.occurredAt)}</td>
                    <td className="cc-dim">{event.eventType}</td>
                    <td>
                      <span className={`cc-chip ${event.source === "test" ? "t-info" : event.source === "client" ? "t-muted" : "t-none"}`}>
                        {event.source}
                      </span>
                    </td>
                    <td className="cc-dim">{event.clientName ?? DASH}</td>
                    <td className="cc-dim cc-code">{event.model ?? DASH}</td>
                    <td className="num cc-dim">{event.inputTokens === null ? DASH : count(event.inputTokens)}</td>
                    <td className="num cc-dim">{event.outputTokens === null ? DASH : count(event.outputTokens)}</td>
                    <td className="num cc-dim">{event.latencyMs === null ? DASH : `${event.latencyMs} ms`}</td>
                    <td className="num cc-dim">
                      <Measured value={event.costMicroUsd === null ? null : microUsd(event.costMicroUsd, { precise: true })} unknown="—" />
                    </td>
                    <td>
                      <span className={`cc-chip ${USAGE_TONE[event.status as keyof typeof USAGE_TONE] ?? "t-muted"}`} title={event.error ?? undefined}>
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="What is not counted" icon={<IconAlert size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          These figures come from the calls this Admin Center made itself, recorded as they
          happened. They are not pulled from a provider dashboard, so anything calling{" "}
          {solution.providerName ?? "the provider"} outside this application does not appear
          here. Test calls are recorded and marked as tests rather than hidden — they cost
          the same money.
        </p>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Costs
   ══════════════════════════════════════════════════════════════════════ */

function CostsTab({
  solution,
  usage,
  providers,
}: {
  solution: SolutionDetail;
  usage: UsageDetail;
  providers: ProviderRow[];
}) {
  const provider = providers.find((p) => p.key === solution.providerKey) ?? null;
  const rates = provider?.models ?? [];
  const missingRates = rates.filter((m) => m.active && (m.inputRate === null || m.outputRate === null));

  const cost = usage.totals.costMicroUsd;
  const revenue = solution.monthlyRevenueCents;
  const marginShare = margin(revenue, cost);
  const dailyLimit = solution.dailySpendLimitMicroUsd;
  const monthlyWarn = solution.monthlyCostWarningMicroUsd;

  const worstDay = usage.points.reduce<{ date: string; cost: number } | null>((held, point) => {
    if (point.costMicroUsd === null) return held;
    if (!held || point.costMicroUsd > held.cost) return { date: point.date, cost: point.costMicroUsd };
    return held;
  }, null);

  return (
    <>
      {cost === null ? (
        <Panel title="Cost cannot be calculated yet" icon={<IconDollar size={15} />} className="cc-s12">
          <p className="cc-note" style={{ marginTop: 0 }}>
            Token counts are recorded, but no price per million tokens has been entered for
            {solution.model ? <> <span className="cc-code">{solution.model}</span></> : " this model"}.
            Rather than guess at a vendor&apos;s price list, this screen says nothing until
            the real rate is entered on the AI Solutions page under Manage providers. Every
            call recorded before then keeps its tokens and can be priced retrospectively.
          </p>
        </Panel>
      ) : null}

      <Panel title="Cost and margin" sub={WINDOW_LABELS[usage.window]} icon={<IconDollar size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat
            label="Provider cost"
            value={cost === null ? "Rate not set" : microUsd(cost)}
            hint={usage.totals.costPartial ? "Partial — some calls unpriced" : `${count(usage.totals.calls)} calls`}
          />
          <Stat
            label="Recurring revenue"
            value={revenue === null ? DASH : money(revenue)}
            hint={revenue === null ? "No recurring price set" : BILLING_TYPE_LABELS[solution.billingType]}
          />
          <Stat
            label="Margin"
            value={marginShare === null ? DASH : pct(marginShare, 0)}
            tone={marginShare !== null && marginShare < 0.2 ? "t-risk" : undefined}
            hint={marginShare === null ? "Needs both a price and a rate" : "Revenue less provider cost"}
          />
          <Stat
            label="Cost per call"
            value={cost === null || usage.totals.calls === 0 ? DASH : microUsd(Math.round(cost / usage.totals.calls), { precise: true })}
            hint={usage.totals.calls === 0 ? "No calls" : "Average over the window"}
          />
          <Stat
            label="Busiest day"
            value={worstDay ? microUsd(worstDay.cost) : DASH}
            hint={worstDay ? worstDay.date : "Nothing priced"}
          />
          <Stat
            label="Daily limit"
            value={dailyLimit === null ? "None" : microUsd(dailyLimit)}
            hint={dailyLimit === null ? "No spend cap set" : "Warns, does not shut down"}
          />
        </div>
      </Panel>

      <Panel title="Daily spend" icon={<IconChart size={15} />} className="cc-s8">
        {cost === null || usage.empty ? (
          <EmptyState
            title="Nothing to chart"
            text={cost === null ? "Enter model rates and this fills in from calls already recorded." : "No calls in this window."}
            icon={<IconChart size={17} />}
          />
        ) : (
          <MiniBars
            points={usage.points.map((point) => ({ key: point.date, value: point.costMicroUsd ?? 0 }))}
            labelLeft={usage.points[0]?.date}
            labelRight={usage.points[usage.points.length - 1]?.date}
            format={(value, key) => `${key}: ${microUsd(value)}`}
          />
        )}
      </Panel>

      <Panel title="Thresholds" icon={<IconAlert size={15} />} className="cc-s4">
        <dl className="cc-kv">
          <dt>Monthly cost warning</dt>
          <dd>{monthlyWarn === null ? <span className="cc-faint">Not set</span> : microUsd(monthlyWarn)}</dd>
          <dt>Daily spend limit</dt>
          <dd>{dailyLimit === null ? <span className="cc-faint">Not set</span> : microUsd(dailyLimit)}</dd>
          <dt>Monthly token warning</dt>
          <dd>{solution.monthlyTokenWarning === null ? <span className="cc-faint">Not set</span> : fmtTokens(solution.monthlyTokenWarning)}</dd>
          <dt>Error rate warning</dt>
          <dd>{solution.errorRateWarningPct === null ? <span className="cc-faint">Default (10%)</span> : `${solution.errorRateWarningPct}%`}</dd>
        </dl>
        <p className="cc-note">
          Crossing a threshold raises an alert. It does not stop a production AI on its own
          — a client&apos;s assistant going silent because a number moved is a worse
          failure than the bill.
        </p>
      </Panel>

      <Panel title="Rate card in force" icon={<IconServer size={15} />} className="cc-s12">
        {!provider ? (
          <p className="cc-note" style={{ marginTop: 0 }}>No provider is set for this solution.</p>
        ) : rates.length === 0 ? (
          <p className="cc-note" style={{ marginTop: 0 }}>No models are recorded for {provider.name}.</p>
        ) : (
          <>
            <div className="cc-scroll">
              <table className="cc-table dense">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">Input / Mtok</th>
                    <th className="num">Output / Mtok</th>
                    <th>Default</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((model) => (
                    <tr key={model.model}>
                      <td className="cc-code">
                        {model.model}
                        {model.model === solution.model ? <span className="cc-chip t-info">In use here</span> : null}
                      </td>
                      <td className="num">
                        {model.inputRate === null
                          ? <span className="cc-faint">Rate not set</span>
                          : `$${(model.inputRate / MICRO_PER_DOLLAR).toFixed(2)}`}
                      </td>
                      <td className="num">
                        {model.outputRate === null
                          ? <span className="cc-faint">Rate not set</span>
                          : `$${(model.outputRate / MICRO_PER_DOLLAR).toFixed(2)}`}
                      </td>
                      <td className="cc-dim">{model.isDefault ? "Yes" : DASH}</td>
                      <td>
                        <span className={`cc-chip ${model.active ? "t-ok" : "t-muted"}`}>
                          {model.active ? "Active" : "Inactive"}
                        </span>
                        {model.deprecatedOn ? <span className="cc-chip t-warn">Retires {shortDate(model.deprecatedOn)}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missingRates.length > 0 ? (
              <p className="cc-note">
                {missingRates.length} active {missingRates.length === 1 ? "model has" : "models have"} no rate
                entered, so calls on {missingRates.length === 1 ? "it" : "them"} are counted but not priced.
                Rates are set once on the AI Solutions page and are frozen onto each call at
                the moment it is made, the same way an invoice line keeps its price.
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Performance
   ══════════════════════════════════════════════════════════════════════ */

function PerformanceTab({
  solution,
  usage,
  conversations,
}: {
  solution: SolutionDetail;
  usage: UsageDetail;
  conversations: ConversationRow[];
}) {
  const failures = usage.recent.filter((event) => event.status !== "success");
  const escalated = conversations.filter((c) => c.escalated).length;
  const leads = conversations.filter((c) => c.leadGenerated).length;
  const answered = conversations.length;
  const errorRate = usage.totals.calls > 0
    ? usage.recent.length > 0
      ? failures.length / usage.recent.length
      : null
    : null;

  const byError = new Map<string, number>();
  for (const event of failures) {
    const key = event.error?.slice(0, 90) ?? event.status;
    byError.set(key, (byError.get(key) ?? 0) + 1);
  }

  return (
    <>
      <Panel title="How well it answers" sub={WINDOW_LABELS[usage.window]} icon={<IconPulse size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat
            label="Health"
            value={solution.health.label}
            tone={healthTone(solution.health.state)}
            hint={solution.health.observed ? "Judged on the last 7 days" : "Too few calls to judge"}
          />
          <Stat
            label="Avg response"
            value={usage.totals.avgLatencyMs === null ? DASH : `${(usage.totals.avgLatencyMs / 1000).toFixed(1)}s`}
            hint={usage.totals.avgLatencyMs === null ? "Nothing measured" : "Across all calls in window"}
          />
          <Stat
            label="Error rate"
            value={errorRate === null ? DASH : pct(errorRate, 1)}
            tone={errorRate !== null && errorRate > 0.1 ? "t-risk" : undefined}
            hint={errorRate === null ? "Nothing measured" : `${failures.length} of ${usage.recent.length} recent calls`}
          />
          <Stat
            label="Conversations"
            value={count(answered)}
            hint={answered === 0 ? "None recorded" : "Metadata only — no message bodies"}
          />
          <Stat
            label="Escalated"
            value={count(escalated)}
            hint={answered === 0 ? "Nothing to escalate" : "Handed to a person"}
          />
          <Stat
            label="Leads"
            value={count(leads)}
            hint={answered === 0 ? "None recorded" : "Conversations that produced a lead"}
          />
        </div>
      </Panel>

      <Panel title="Response volume" icon={<IconChart size={15} />} className="cc-s8">
        {usage.empty ? (
          <EmptyState title="No calls in this window" text="Nothing has been recorded for this solution over this period." icon={<IconChart size={17} />} />
        ) : (
          <MiniBars
            points={usage.points.map((point) => ({ key: point.date, value: point.calls }))}
            labelLeft="Calls per day"
            labelRight={usage.points[usage.points.length - 1]?.date}
            format={(value, key) => `${key}: ${value} calls`}
          />
        )}
      </Panel>

      <Panel title="Failures" icon={<IconAlert size={15} />} className="cc-s4">
        {byError.size === 0 ? (
          <p className="cc-note" style={{ marginTop: 0 }}>
            {usage.totals.calls === 0
              ? "No calls in this window, so nothing to report."
              : "No failures among the recent calls examined."}
          </p>
        ) : (
          <div className="cc-barlist">
            {[...byError.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([reason, n]) => (
                <div key={reason} className="cc-barrow">
                  <span className="cc-barrow-label">{reason}</span>
                  <span className="cc-barrow-track">
                    <span className="cc-barrow-fill" style={{ width: `${Math.max((n / failures.length) * 100, 4)}%` }} />
                  </span>
                  <span className="cc-barrow-value">{n}</span>
                </div>
              ))}
          </div>
        )}
      </Panel>

      <Panel title="What is not measured" icon={<IconAlert size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Latency, errors and volume are measured. Answer <em>quality</em> is not: nothing
          here scores whether a reply was right, because nothing has told it. Escalations
          and leads are the closest honest proxies, and both depend on the calling code
          recording them. A satisfaction figure would have to be invented, so there is not one.
        </p>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Clients
   ══════════════════════════════════════════════════════════════════════ */

function ClientsTab({
  solution,
  choices,
  conversations,
  canManage,
}: {
  solution: SolutionDetail;
  choices: Awaited<ReturnType<typeof loadAiChoices>>;
  conversations: ConversationRow[];
  canManage: boolean;
}) {
  const deployments = solution.deployments;
  const recurring = deployments.reduce((sum, d) => sum + (d.monthlyPriceCents ?? 0), 0);

  return (
    <>
      <Panel
        title="Client deployments"
        sub={`${deployments.length} · ${money(recurring)} / month recorded`}
        icon={<IconUsers size={15} />}
        className="cc-s12"
        footer={canManage ? <AddDeployment solutionId={solution.id} choices={choices} /> : undefined}
      >
        {deployments.length === 0 ? (
          <EmptyState
            title="No client deployments"
            text="One solution can run for many clients. Each deployment keeps its own price, brand voice and extra instructions, layered on top of the master prompt rather than replacing it."
            icon={<IconUsers size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Deployment</th>
                  <th>Client</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th className="num">Monthly</th>
                  <th>Customised</th>
                  <th>Last active</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>
                      <div className="cc-strong">{deployment.name}</div>
                      {safeUrl(deployment.deploymentUrl) ? (
                        <a className="cc-link" href={deployment.deploymentUrl as string} target="_blank" rel="noopener noreferrer nofollow">
                          {deployment.deploymentUrl}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      {deployment.customerId ? (
                        <Link className="cc-link" href={`/admin/clients/${deployment.customerId}`}>
                          {deployment.clientName ?? "Client"}
                        </Link>
                      ) : (
                        <span className="cc-faint">Internal</span>
                      )}
                    </td>
                    <td className="cc-dim">{deployment.environment}</td>
                    <td>
                      <span className={`cc-chip ${deployment.status === "active" ? "t-ok" : deployment.status === "error" ? "t-risk" : "t-muted"}`}>
                        {deployment.status}
                      </span>
                    </td>
                    <td className="num">{deployment.monthlyPriceCents === null ? <span className="cc-faint">{DASH}</span> : money(deployment.monthlyPriceCents)}</td>
                    <td className="cc-dim">
                      {deployment.promptOverride || deployment.brandVoice ? "Yes" : <span className="cc-faint">No</span>}
                    </td>
                    <td className="cc-dim">{deployment.lastActiveAt ? ago(deployment.lastActiveAt) : <span className="cc-faint">Never</span>}</td>
                    {canManage ? (
                      <td>
                        <div className="cc-rowacts">
                          <EditDeployment
                            solutionId={solution.id}
                            choices={choices}
                            value={{
                              id: deployment.id,
                              name: deployment.name,
                              customerId: deployment.customerId,
                              appId: deployment.appId,
                              websiteId: deployment.websiteId,
                              environment: deployment.environment,
                              deploymentUrl: deployment.deploymentUrl,
                              promptOverride: deployment.promptOverride,
                              brandVoice: deployment.brandVoice,
                              status: deployment.status,
                              monthlyPriceCents: deployment.monthlyPriceCents,
                            }}
                          />
                          <RemoveDeployment solutionId={solution.id} deploymentId={deployment.id} name={deployment.name} />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Conversations"
        sub="Metadata only"
        icon={<IconBot size={15} />}
        className="cc-s12"
      >
        <p className="cc-note" style={{ marginTop: 0 }}>
          What people typed to this AI is not stored in this CRM. These rows are counts and
          outcomes — enough to see whether it is being used and whether anything needed a
          person, and not enough to read a client&apos;s customer&apos;s words.
        </p>
        {conversations.length === 0 ? (
          <EmptyState title="No conversations recorded" text="Nothing has spoken to this solution yet, or the calling code does not group calls into conversations." icon={<IconBot size={17} />} />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="num">Messages</th>
                  <th>Outcome</th>
                  <th>Started</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conversation) => (
                  <tr key={conversation.id}>
                    <td className="cc-code cc-dim">{conversation.externalRef?.slice(0, 12) ?? conversation.id.slice(0, 8)}</td>
                    <td className="cc-dim">{conversation.clientName ?? DASH}</td>
                    <td>
                      <span className={`cc-chip ${conversation.status === "open" ? "t-info" : "t-muted"}`}>{conversation.status}</span>
                    </td>
                    <td className="num cc-dim">{count(conversation.messageCount)}</td>
                    <td>
                      {conversation.escalated ? <span className="cc-chip t-warn">Escalated</span> : null}
                      {conversation.leadGenerated ? <span className="cc-chip t-ok">Lead</span> : null}
                      {!conversation.escalated && !conversation.leadGenerated ? <span className="cc-faint">{DASH}</span> : null}
                    </td>
                    <td className="cc-dim">{ago(conversation.startedAt)}</td>
                    <td className="cc-dim">{ago(conversation.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Automations
   ══════════════════════════════════════════════════════════════════════ */

function AutomationsTab({
  solution,
  runs,
  tasks,
  people,
  canManage,
}: {
  solution: SolutionDetail;
  runs: RunsDetail;
  tasks: SolutionTask[];
  people: { email: string; name: string }[];
  canManage: boolean;
}) {
  const open = tasks.filter((task) => !task.done);

  return (
    <>
      <Panel title="Runs" sub={WINDOW_LABELS[runs.window]} icon={<IconRepeat size={15} />} className="cc-s12" bodyClass="flush">
        <div className="cc-stats">
          <Stat label="Runs" value={count(runs.totals.runs)} hint={runs.totals.runs === 0 ? "None recorded" : "Scheduled or triggered executions"} />
          <Stat label="Tool calls" value={count(runs.totals.toolCalls)} hint={runs.totals.toolCalls === 0 ? "None recorded" : "Actions taken during runs"} />
          <Stat
            label="Failed"
            value={count(runs.totals.failed)}
            tone={runs.totals.failed > 0 ? "t-risk" : undefined}
            hint={runs.totals.failed === 0 ? "Nothing failed" : "Needs a look"}
          />
          <Stat
            label="Avg duration"
            value={runs.totals.avgLatencyMs === null ? DASH : `${(runs.totals.avgLatencyMs / 1000).toFixed(1)}s`}
            hint={runs.totals.avgLatencyMs === null ? "Nothing measured" : "Per run"}
          />
        </div>
      </Panel>

      <Panel title="How this runs" icon={<IconCode size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          There is no schedule stored in this Admin Center for AI solutions. What triggers
          this one lives in the code that calls it
          {solution.sourcePath ? <> — <span className="cc-code">{solution.sourcePath}</span></> : null}
          , and what you see below are the runs that genuinely happened. A schedule recorded
          here that nothing executes would look reassuring and mean nothing.
        </p>
      </Panel>

      {runs.triggers.length > 0 ? (
        <Panel title="By trigger" icon={<IconRepeat size={15} />} className="cc-s6">
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr><th>Reference</th><th className="num">Runs</th><th className="num">Failed</th><th>Last</th></tr>
              </thead>
              <tbody>
                {runs.triggers.map((trigger) => (
                  <tr key={trigger.ref}>
                    <td className="cc-code">{trigger.ref}</td>
                    <td className="num">{count(trigger.runs)}</td>
                    <td className="num">{trigger.failed > 0 ? <span className="cc-chip t-risk">{trigger.failed}</span> : DASH}</td>
                    <td className="cc-dim">{ago(trigger.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Recent runs"
        icon={<IconPulse size={15} />}
        className={runs.triggers.length > 0 ? "cc-s6" : "cc-s12"}
      >
        {runs.runs.length === 0 ? (
          <EmptyState
            title="No runs in this window"
            text="This solution answers when it is called rather than on a schedule, or nothing has triggered it over this period."
            icon={<IconRepeat size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr><th>When</th><th>Type</th><th>Client</th><th className="num">Duration</th><th>Status</th></tr>
              </thead>
              <tbody>
                {runs.runs.map((run) => (
                  <tr key={run.id}>
                    <td className="cc-dim" title={new Date(run.occurredAt).toLocaleString("en-US")}>{ago(run.occurredAt)}</td>
                    <td className="cc-dim">{run.eventType}</td>
                    <td className="cc-dim">{run.clientName ?? DASH}</td>
                    <td className="num cc-dim">{run.latencyMs === null ? DASH : `${(run.latencyMs / 1000).toFixed(1)}s`}</td>
                    <td>
                      <span className={`cc-chip ${USAGE_TONE[run.status as keyof typeof USAGE_TONE] ?? "t-muted"}`} title={run.error ?? undefined}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Work on this solution"
        sub={`${open.length} open`}
        icon={<IconCheckSquare size={15} />}
        className="cc-s12"
        footer={canManage ? <NewAiTask solutionId={solution.id} people={people} /> : undefined}
      >
        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks"
            text="Tasks created here are ordinary tasks linked to this solution, and appear on the Tasks board like everything else."
            icon={<IconCheckSquare size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr><th>Task</th><th>Priority</th><th>Status</th><th>Owner</th><th>Due</th></tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className={task.done ? "cc-dim" : "cc-strong"}>{task.title}</td>
                    <td>
                      <span className={`cc-chip ${task.priority === "critical" ? "t-risk" : task.priority === "high" ? "t-warn" : "t-muted"}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="cc-dim">{task.status}</td>
                    <td className="cc-dim">{task.owner ?? DASH}</td>
                    <td className="cc-dim">{task.dueAt ? shortDate(task.dueAt) : DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Logs
   ══════════════════════════════════════════════════════════════════════ */

function LogsTab({
  solution,
  usage,
  events,
}: {
  solution: SolutionDetail;
  usage: UsageDetail;
  events: SolutionEvent[];
}) {
  const failures = usage.recent.filter((event) => event.status !== "success");

  return (
    <>
      <Panel title="Errors" sub={WINDOW_LABELS[usage.window]} icon={<IconAlert size={15} />} className="cc-s12">
        {failures.length === 0 ? (
          <EmptyState
            title="No errors recorded"
            text={usage.totals.calls === 0 ? "There were no calls in this window." : "Every recent call this solution made returned successfully."}
            icon={<IconAlert size={17} />}
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr><th>When</th><th>Status</th><th>Model</th><th>Source</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {failures.map((failure) => (
                  <tr key={failure.id}>
                    <td className="cc-dim" title={new Date(failure.occurredAt).toLocaleString("en-US")}>{ago(failure.occurredAt)}</td>
                    <td>
                      <span className={`cc-chip ${USAGE_TONE[failure.status as keyof typeof USAGE_TONE] ?? "t-risk"}`}>{failure.status}</span>
                    </td>
                    <td className="cc-code cc-dim">{failure.model ?? DASH}</td>
                    <td className="cc-dim">{failure.source}</td>
                    <td>{failure.error ?? <span className="cc-faint">No detail recorded</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Audit trail" sub={`${events.length} entries`} icon={<IconFile size={15} />} className="cc-s12">
        {events.length === 0 ? (
          <EmptyState title="Nothing recorded yet" text="Prompt changes, permission grants, deployments and threshold breaches are written here as they happen." icon={<IconFile size={17} />} />
        ) : (
          <div className="cc-timeline">
            {events.map((event) => (
              <div key={event.id} className="cc-timeline-item">
                <span className="cc-timeline-rail">
                  <span className="cc-timeline-node" />
                </span>
                <div>
                  <div className="cc-strong">{event.body}</div>
                  <div className="cc-faint">
                    {event.kind}
                    {event.actor ? ` · ${event.actor}` : ""} · {ago(event.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="What is logged" icon={<IconSettings size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Prompts and message bodies are deliberately absent from these logs. What is kept
          is what a call cost, how long it took, whether it worked and what changed about
          the solution — enough to run it, and not a transcript of a client&apos;s
          customers. Errors returned by {solution.providerName ?? "the provider"} are stored
          as returned, with anything that looks like a key stripped before it is written.
        </p>
      </Panel>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Settings
   ══════════════════════════════════════════════════════════════════════ */

function SettingsTab({
  solution,
  choices,
  canManage,
}: {
  solution: SolutionDetail;
  choices: Awaited<ReturnType<typeof loadAiChoices>>;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <Panel title="Settings" icon={<IconSettings size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Changing a live AI solution is limited to owners and admins.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Settings" icon={<IconSettings size={15} />} className="cc-s12">
        <SettingsForm
          choices={choices}
          value={{
            id: solution.id,
            name: solution.name,
            internalName: solution.internalName,
            description: solution.description,
            purpose: solution.purpose,
            tags: solution.tags,
            type: solution.type,
            status: solution.status,
            customerId: solution.client?.id ?? null,
            serviceId: solution.service?.id ?? null,
            appId: solution.app?.id ?? null,
            websiteId: solution.website?.id ?? null,
            owner: solution.owner,
            providerKey: solution.providerKey,
            model: solution.model,
            fallbackProviderKey: solution.fallbackProviderKey,
            fallbackModel: solution.fallbackModel,
            temperature: solution.temperature,
            maxOutputTokens: solution.maxOutputTokens,
            target: solution.target,
            deploymentUrl: solution.deploymentUrl,
            monthlyPriceCents: solution.monthlyPriceCents,
            setupFeeCents: solution.setupFeeCents,
            usageMarkupPct: solution.usageMarkupPct,
            billingType: solution.billingType,
            monthlyCostWarningMicroUsd: solution.monthlyCostWarningMicroUsd,
            dailySpendLimitMicroUsd: solution.dailySpendLimitMicroUsd,
            monthlyTokenWarning: solution.monthlyTokenWarning,
            errorRateWarningPct: solution.errorRateWarningPct,
            notes: solution.notes,
          }}
        />
      </Panel>

      <Panel title="Archive" icon={<IconAlert size={15} />} className="cc-s12">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Archiving hides this solution from the board and marks it inactive. Nothing is
          deleted — its versions, usage history and costs stay exactly where they are, and
          it can be restored.
        </p>
        <ArchiveSolution solutionId={solution.id} name={solution.name} isArchived={solution.isArchived} />
      </Panel>
    </>
  );
}
