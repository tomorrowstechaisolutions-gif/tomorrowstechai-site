import Link from "next/link";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadAiBoard, loadTemplates, type AiBoard as Board, type AiFilters, type SolutionRow } from "@/lib/ai/queries";
import { loadAiChoices } from "@/lib/ai/detail";
import {
  HEALTH_TONE,
  PROVIDER_STATUS_LABELS,
  PROVIDER_TONE,
  STATUS_TONE,
  WINDOW_LABELS,
  microUsd,
  tokens as fmtTokens,
  type Window,
} from "@/lib/ai/types";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { ago, count, DASH, money, moneyCompact, pct, shortDate } from "../format";
import AiFiltersBar from "../ai/AiFilters";
import AiTemplates from "../ai/AiTemplates";
import ManageProviders from "../ai/ManageProviders";
import NewSolution from "../ai/NewSolution";
import SolutionRowActions from "../ai/SolutionRowActions";
import {
  IconAlert,
  IconBot,
  IconChart,
  IconDollar,
  IconPulse,
  IconServer,
  IconSpark,
  IconUsers,
  IconZap,
} from "../Icons";

/**
 * The AI operations command centre.
 *
 * Two rules from the brief shape every panel below.
 *
 * NOTHING IS INVENTED. Cost appears only where a rate was set when the call
 * happened; margin only where both revenue and cost are known; provider
 * status only from a real check. Everything else says Unknown, Not
 * configured or Rate not set — in words, never as a zero.
 *
 * NOTHING CALLS A PROVIDER (§42). This page is one round of database
 * queries. Live provider work happens on the Test button and in the nightly
 * job, which write their answers into the tables this reads.
 */

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Active AI solutions",
      value: count(k.activeSolutions),
      icon: <IconBot size={15} />,
      foot: <span className="cc-faint">Of {count(board.tabCounts.all)} registered</span>,
      href: "/admin/ai-solutions?status=active",
    },
    {
      label: "Client AI systems",
      value: count(k.clientSystems),
      icon: <IconUsers size={15} />,
      foot: <span className="cc-faint">Clients with a solution or deployment</span>,
      href: "/admin/clients",
    },
    {
      label: "Monthly AI revenue",
      value: k.monthlyRevenueCents === null ? DASH : moneyCompact(k.monthlyRevenueCents),
      icon: <IconDollar size={15} />,
      foot: (
        <span className="cc-faint">
          {k.monthlyRevenueCents === null ? "No recurring AI billing recorded" : "From recurring AI services"}
        </span>
      ),
      href: "/admin/invoices",
    },
    {
      label: "Monthly AI cost",
      value: k.monthlyCostMicroUsd === null ? "Rate not set" : microUsd(k.monthlyCostMicroUsd),
      icon: <IconServer size={15} />,
      foot: (
        <span className="cc-faint">
          {k.monthlyCostMicroUsd === null
            ? "Enter model rates to estimate"
            : k.monthlyCostPartial
              ? "Estimated — some calls have no rate"
              : "Estimated from measured tokens"}
        </span>
      ),
      href: "/admin/ai-solutions?sort=cost",
    },
    {
      label: "Gross margin",
      value: k.grossMargin === null ? DASH : pct(k.grossMargin, 0),
      icon: <IconChart size={15} />,
      foot: (
        <span className="cc-faint">
          {k.grossMargin === null ? "Needs both revenue and a cost rate" : "AI revenue less estimated AI cost"}
        </span>
      ),
      href: "/admin/ai-solutions?sort=margin",
    },
    {
      label: "Needing attention",
      value: count(k.needingAttention),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.needingAttention > 0 ? "cc-delta down" : "cc-faint"}>
          {k.needingAttention > 0 ? "Errors or degraded performance" : "Nothing flagged"}
        </span>
      ),
      href: "/admin/ai-solutions?health=critical",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((card) => (
        <Link className="cc-kpi" key={card.label} href={card.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{card.icon}</span>
            <span className="cc-kpi-label">{card.label}</span>
          </div>
          <div className="cc-kpi-value">{card.value}</div>
          <div className="cc-kpi-foot">{card.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── Needs Attention strip ─────────────────────────────────────────── */

function Attention({ board }: { board: Board }) {
  if (board.attention.length === 0) return null;
  const shown = board.attention.slice(0, 3);

  return (
    <Panel
      title="Needs attention"
      sub={`${count(board.attention.length)} ${board.attention.length === 1 ? "item requires" : "items require"} attention`}
      icon={<IconAlert size={15} />}
      className="cc-s12"
      action={{ href: "/admin/ai-solutions?health=critical", label: "View all" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {shown.map((item) => (
          <Link
            key={item.id}
            href={`/admin/ai-solutions/${item.solutionId}?tab=overview`}
            className="cc-alert"
            style={{ padding: 0, border: 0 }}
          >
            <span className={`cc-alert-pri ${item.severity === "critical" ? "t-risk" : "t-warn"}`} />
            <span className="cc-alert-main">
              <span className="cc-alert-title">{item.solutionName}</span>
              <span className="cc-alert-detail">{item.title}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: AiFilters }) {
  const tabs: { key: AiFilters["tab"]; label: string }[] = [
    { key: "all", label: "All Solutions" },
    { key: "chatbots", label: "Chatbots" },
    { key: "agents", label: "Agents" },
    { key: "automations", label: "Automations" },
    { key: "templates", label: "Templates" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "all" ? "/admin/ai-solutions" : `/admin/ai-solutions?tab=${tab.key}`}
          className={`cc-tab ${filters.tab === tab.key ? "is-on" : ""}`}
        >
          {tab.label}
          <span className="cc-tab-n">{count(board.tabCounts[tab.key])}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── Shared cells ──────────────────────────────────────────────────── */

function HealthChip({ row }: { row: SolutionRow }) {
  const why = row.health.reasons.length
    ? row.health.reasons.map((r) => r.label).join(" · ")
    : "Nothing recorded to judge from.";
  return <span className={`cc-chip ${HEALTH_TONE[row.health.state]}`} title={why}>{row.health.label}</span>;
}

function CostCell({ row }: { row: SolutionRow }) {
  if (row.costMicroUsd === null) {
    return (
      <span className="cc-faint" title="No rate is set for this model, so the cost of these calls cannot be estimated.">
        Rate not set
      </span>
    );
  }
  return (
    <span title={row.costPartial ? "Estimated. Some calls in this window had no rate." : "Estimated from measured tokens."}>
      {microUsd(row.costMicroUsd)}
      {row.costPartial ? <span className="cc-faint">*</span> : null}
    </span>
  );
}

/* ── The table ─────────────────────────────────────────────────────── */

function SolutionsTable({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-scroll">
      <table className="cc-table dense">
        <thead>
          <tr>
            <th>Solution</th>
            <th>Client</th>
            <th>Type</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Health</th>
            <th className="num">Monthly cost</th>
            <th className="num">Revenue</th>
            <th className="num">Margin</th>
            <th className="num">Usage</th>
            <th>Last updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link className="cc-link cc-strong" href={`/admin/ai-solutions/${row.id}`}>{row.name}</Link>
                <span className="cc-client-sub">{row.internalName || row.slug}</span>
              </td>
              <td>
                {row.client ? (
                  <Link className="cc-link" href={`/admin/clients/${row.client.id}`}>{row.client.name}</Link>
                ) : (
                  <span className="cc-dim">Internal</span>
                )}
                {row.deploymentCount > 0 ? (
                  <span className="cc-client-sub">
                    {count(row.deploymentCount)} {row.deploymentCount === 1 ? "deployment" : "deployments"}
                  </span>
                ) : null}
              </td>
              <td className="cc-dim">{row.typeLabel}</td>
              <td className="cc-dim">
                {row.providerName ?? <span className="cc-faint">Not set</span>}
                {row.model ? <span className="cc-client-sub cc-code">{row.model}</span> : null}
              </td>
              <td><span className={`cc-chip ${STATUS_TONE[row.status]}`}>{row.statusLabel}</span></td>
              <td><HealthChip row={row} /></td>
              <td className="num"><CostCell row={row} /></td>
              <td className="num">
                {row.monthlyRevenueCents === null ? (
                  <span className="cc-dim">{DASH}</span>
                ) : (
                  <span title={row.revenueSource === "client_service" ? "From the client service assignment." : "From the agreed monthly price."}>
                    {money(row.monthlyRevenueCents)}<span className="cc-faint">/mo</span>
                  </span>
                )}
              </td>
              <td className="num">
                {row.marginShare === null ? <span className="cc-dim">{DASH}</span> : pct(row.marginShare, 0)}
              </td>
              <td className="num cc-dim">
                {row.calls === 0 ? (
                  <span className="cc-faint">No calls</span>
                ) : (
                  <span title={`${count(row.calls)} calls · ${fmtTokens(row.totalTokens)} tokens`}>
                    {count(row.calls)}
                    <span className="cc-client-sub">{fmtTokens(row.totalTokens)} tokens</span>
                  </span>
                )}
              </td>
              <td className="cc-dim">
                {ago(row.updatedAt)}
                <span className="cc-client-sub">{shortDate(row.updatedAt)}</span>
              </td>
              <td>
                <SolutionRowActions
                  solutionId={row.id}
                  status={row.status}
                  deploymentUrl={row.deploymentUrl}
                  clientId={row.client?.id ?? null}
                  isArchived={row.isArchived}
                  canManage={canManage}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SolutionsCards({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-appcards">
      {board.rows.map((row) => (
        <article className="cc-appcard" key={row.id}>
          <div className="cc-appcard-top">
            <span className="cc-mono">{row.name.slice(0, 2).toUpperCase()}</span>
            <span className="cc-appcard-name">
              <Link className="cc-link" href={`/admin/ai-solutions/${row.id}`}>{row.name}</Link>
            </span>
            <SolutionRowActions
              solutionId={row.id}
              status={row.status}
              deploymentUrl={row.deploymentUrl}
              clientId={row.client?.id ?? null}
              isArchived={row.isArchived}
              canManage={canManage}
            />
          </div>
          <div className="cc-appcard-sub">
            {row.client ? row.client.name : "Internal"} · {row.typeLabel}
          </div>
          <div className="cc-taglist" style={{ marginTop: 8 }}>
            <span className={`cc-chip ${STATUS_TONE[row.status]}`}>{row.statusLabel}</span>
            <HealthChip row={row} />
          </div>
          <dl className="cc-kv" style={{ marginTop: 10 }}>
            <dt>Provider</dt>
            <dd>{row.providerName ?? DASH}{row.model ? ` · ${row.model}` : ""}</dd>
            <dt>Usage</dt>
            <dd>{row.calls === 0 ? "No calls" : `${count(row.calls)} calls · ${fmtTokens(row.totalTokens)} tokens`}</dd>
            <dt>Cost</dt>
            <dd><CostCell row={row} /></dd>
            <dt>Revenue</dt>
            <dd>{row.monthlyRevenueCents === null ? DASH : `${money(row.monthlyRevenueCents)}/mo`}</dd>
          </dl>
          <div className="cc-rowacts" style={{ marginTop: 10 }}>
            <Link className="cc-btn is-sm" href={`/admin/ai-solutions/${row.id}`}>Open</Link>
            {row.deploymentUrl ? (
              <a className="cc-btn is-sm" href={row.deploymentUrl} target="_blank" rel="noopener noreferrer nofollow">
                Deployment
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Solutions({
  board,
  filters,
  canManage,
}: {
  board: Board;
  filters: AiFilters;
  canManage: boolean;
}) {
  const filtered = Boolean(
    filters.q || filters.client || filters.type || filters.status || filters.provider || filters.health
  );

  return (
    <Panel
      title="AI solutions"
      sub={`${count(board.rows.length)} ${board.rows.length === 1 ? "solution" : "solutions"}`}
      icon={<IconBot size={15} />}
    >
      {filters.tab === "templates" ? (
        <EmptyState
          icon={<IconSpark size={17} />}
          title={`${board.templateCount} templates available`}
          text="Templates are starting points rather than running systems, so they live behind the AI Templates button in the header. Everything created from one arrives as a draft."
        />
      ) : board.rows.length === 0 ? (
        board.empty ? (
          <EmptyState
            icon={<IconBot size={17} />}
            title="No AI solutions yet"
            text="Create your first chatbot, agent or automation to start tracking deployments, usage, cost, performance and revenue."
          />
        ) : filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter or two and the rest come back."
            cta={{ href: "/admin/ai-solutions", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            title="Nothing in this tab"
            text="Every solution is of another kind right now."
            cta={{ href: "/admin/ai-solutions", label: "See all solutions" }}
          />
        )
      ) : filters.view === "cards" ? (
        <SolutionsCards board={board} canManage={canManage} />
      ) : (
        <SolutionsTable board={board} canManage={canManage} />
      )}
    </Panel>
  );
}

/* ── Recent activity ───────────────────────────────────────────────── */

function Activity({ board }: { board: Board }) {
  return (
    <Panel title="Recent activity" icon={<IconPulse size={15} />} action={{ href: "/admin/activity", label: "View all" }}>
      {board.activity.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          text="Prompt changes, model changes, knowledge syncs, failures and threshold breaches all land here as they happen."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Solution</th>
                <th>Client</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {board.activity.map((item) => (
                <tr key={item.id}>
                  <td className="cc-dim" title={new Date(item.at).toLocaleString("en-US")}>{ago(item.at)}</td>
                  <td>{item.event}</td>
                  <td>
                    {item.solutionId ? (
                      <Link className="cc-link" href={`/admin/ai-solutions/${item.solutionId}`}>
                        {item.solutionName}
                      </Link>
                    ) : (
                      <span className="cc-dim">{DASH}</span>
                    )}
                  </td>
                  <td className="cc-dim">{item.clientName ?? DASH}</td>
                  <td className="cc-dim">{item.actor ?? DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Right rail ────────────────────────────────────────────────────── */

function ProviderStatus({ board }: { board: Board }) {
  return (
    <Panel title="AI provider status" icon={<IconServer size={15} />} bodyClass="flush">
      <ul className="cc-health">
        {board.providers.map((provider) => {
          const models = provider.models.filter((m) => m.active);
          const defaultModel = models.find((m) => m.isDefault);
          return (
            <li className="cc-health-row" key={provider.key}>
              <div className="cc-health-name">
                {provider.name}
                <span className="cc-client-sub">
                  {defaultModel
                    ? defaultModel.displayName || defaultModel.model
                    : models.length > 0
                      ? `${models.length} models`
                      : "No models recorded"}
                </span>
              </div>
              <div className="cc-health-detail">
                {provider.lastCheckedAt ? ago(provider.lastCheckedAt) : "Never checked"}
              </div>
              <span className={`cc-chip ${PROVIDER_TONE[provider.status]}`}>
                {PROVIDER_STATUS_LABELS[provider.status]}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="cc-panel-body">
        <p className="cc-note" style={{ marginTop: 0 }}>
          Status comes from a real call to the provider, or it says Unknown. Nothing here
          turns green because a key exists.
        </p>
      </div>
    </Panel>
  );
}

function UsageOverviewPanel({ board, filters }: { board: Board; filters: AiFilters }) {
  const u = board.usage;
  const windows: Window[] = ["7d", "30d", "90d"];

  return (
    <Panel
      title="Usage overview"
      sub={WINDOW_LABELS[u.window]}
      icon={<IconChart size={15} />}
    >
      <div className="cc-tabs" style={{ marginBottom: 10 }}>
        {windows.map((w) => (
          <Link
            key={w}
            href={`/admin/ai-solutions?${new URLSearchParams({ ...(filters.tab !== "all" ? { tab: filters.tab } : {}), window: w }).toString()}`}
            className={`cc-tab ${u.window === w ? "is-on" : ""}`}
          >
            {WINDOW_LABELS[w].replace("Last ", "")}
          </Link>
        ))}
      </div>

      {u.empty ? (
        <EmptyState
          title="No usage recorded yet"
          text="Every Claude call this business makes is now recorded. The moment the website assistant or any admin AI feature runs, the numbers here start filling in on their own."
        />
      ) : (
        <dl className="cc-kv">
          <dt>Conversations</dt>
          <dd>{u.conversations === 0 ? <span className="cc-faint">Not grouped</span> : count(u.conversations)}</dd>
          <dt>API calls</dt>
          <dd>{count(u.calls)}</dd>
          <dt>Total tokens</dt>
          <dd>{fmtTokens(u.totalTokens)}</dd>
          <dt>In / out</dt>
          <dd>{fmtTokens(u.inputTokens)} / {fmtTokens(u.outputTokens)}</dd>
          <dt>Automation runs</dt>
          <dd>{count(u.automationRuns)}</dd>
          <dt>Estimated cost</dt>
          <dd>
            {u.costMicroUsd === null ? (
              <span className="cc-faint">Rate not set</span>
            ) : (
              <>
                {microUsd(u.costMicroUsd)}
                {u.costPartial ? <span className="cc-faint"> · partial</span> : null}
              </>
            )}
          </dd>
        </dl>
      )}
    </Panel>
  );
}

function TopPerformerPanel({ board }: { board: Board }) {
  const top = board.topPerformer;

  return (
    <Panel title="Top performing solution" icon={<IconZap size={15} />}>
      {!top ? (
        <EmptyState
          title="Nothing to rank yet"
          text="A solution appears here once it has recorded calls. Ranking is by successful calls, because that is the only performance figure this system measures today."
        />
      ) : (
        <>
          <div className="cc-idhead" style={{ marginBottom: 10 }}>
            <span className="cc-mono lg">{top.name.slice(0, 2).toUpperCase()}</span>
            <div>
              <div className="cc-strong">{top.name}</div>
              <div className="cc-client-sub">{top.clientName ?? "Internal"}</div>
              <span className={`cc-chip ${STATUS_TONE[top.status]}`} style={{ marginTop: 6 }}>{top.statusLabel}</span>
            </div>
          </div>

          <dl className="cc-kv">
            <dt>Conversations</dt>
            <dd>{top.conversations === 0 ? <span className="cc-faint">Not grouped</span> : count(top.conversations)}</dd>
            <dt>Successful runs</dt>
            <dd>{count(top.successfulRuns)}</dd>
            <dt>Success rate</dt>
            <dd>{top.successRate === null ? DASH : pct(top.successRate, 0)}</dd>
            <dt>Leads</dt>
            <dd><span className="cc-faint">Not tracked yet</span></dd>
            <dt>Conversion</dt>
            <dd><span className="cc-faint">Not tracked yet</span></dd>
          </dl>

          <p className="cc-note">
            Leads and conversion stay blank until a conversation is linked to a lead
            record. Guessing them from message counts would be a made-up business metric.
          </p>

          <Link className="cc-cta" href={`/admin/ai-solutions/${top.id}`} style={{ marginTop: 10 }}>
            View details
          </Link>
        </>
      )}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function AiSolutionsBoard({ filters }: { filters: AiFilters }) {
  const session = await getAdminUser();
  const canManage = ["owner", "admin"].includes(session?.admin.role ?? "viewer");

  const supabase = await createSupabaseServerClient();
  const [board, choices, templates] = await Promise.all([
    loadAiBoard(supabase, filters),
    loadAiChoices(supabase),
    loadTemplates(supabase),
  ]);

  const providerCards = board.providers.map((provider) => ({
    key: provider.key,
    name: provider.name,
    description: provider.description,
    credentialEnv: provider.credentialEnv,
    keyPresent: provider.keyPresent,
    enabled: provider.enabled,
    status: provider.status,
    statusDetail: provider.statusDetail,
    lastCheckedAt: provider.lastCheckedAt,
    docsUrl: provider.docsUrl,
    usageMicroUsd: board.providerUsage[provider.key]?.costMicroUsd ?? null,
    callsThisMonth: board.providerUsage[provider.key]?.calls ?? 0,
    models: provider.models,
  }));

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>AI Solutions</h1>
          <p>
            Manage all AI chatbots, agents and automations — from client deployments to
            usage, costs, performance and revenue.
          </p>
        </div>
        <div className="cc-greet-actions">
          <AiTemplates templates={templates} clients={board.clients} />
          <ManageProviders providers={providerCards} />
          {canManage ? <NewSolution choices={choices} /> : null}
        </div>
      </div>

      <KpiRow board={board} />

      {board.noProviderConnected ? (
        <div className="cc-board">
          <Panel title="No AI provider is confirmed connected" icon={<IconAlert size={15} />} className="cc-s12">
            <EmptyState
              icon={<IconServer size={17} />}
              title="No provider has been verified"
              text="Every AI feature in this admin runs on Anthropic today, but no provider connection has been tested from here yet — so the status is Unknown rather than assumed working. Open Manage Providers and press Test connection."
            />
          </Panel>
        </div>
      ) : null}

      <div className="cc-board">
        <Attention board={board} />
      </div>

      <Tabs board={board} filters={filters} />

      <div className="cc-board">
        <div className="cc-s9 cc-col">
          <AiFiltersBar
            clients={board.clients}
            providers={board.providers.map((p) => ({ key: p.key, name: p.name }))}
          />
          <Solutions board={board} filters={filters} canManage={canManage} />
          <Activity board={board} />
        </div>

        <div className="cc-s3 cc-col">
          <ProviderStatus board={board} />
          <UsageOverviewPanel board={board} filters={filters} />
          <TopPerformerPanel board={board} />
        </div>
      </div>
    </>
  );
}

export function AiSolutionsBoardSkeleton() {
  return (
    <div className="cc-board">
      <div className="cc-s9 cc-col">
        <PanelSkeleton title="AI solutions" rows={6} />
        <PanelSkeleton title="Recent activity" rows={4} />
      </div>
      <div className="cc-s3 cc-col">
        <PanelSkeleton title="AI provider status" rows={4} />
        <PanelSkeleton title="Usage overview" rows={4} />
      </div>
    </div>
  );
}
