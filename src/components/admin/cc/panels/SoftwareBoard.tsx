import Link from "next/link";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  loadSoftwareBoard,
  type SoftwareBoard as Board,
  type SoftwareFilters,
  type SoftwareRow,
} from "@/lib/software/queries";
import { loadSoftwareChoices } from "@/lib/software/detail";
import { HEALTH_TONE, LIFECYCLE_TONE } from "@/lib/software/types";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import MiniBars from "../MiniBars";
import { ago, count, DASH, money, moneyCompact, pct, shortDate } from "../format";
import NewSoftware from "../software/NewSoftware";
import SoftwareFiltersBar from "../software/SoftwareFilters";
import SoftwareRowActions from "../software/SoftwareRowActions";
import {
  IconAlert,
  IconChart,
  IconCode,
  IconDollar,
  IconLayers,
  IconPulse,
  IconRepeat,
  IconUsers,
  IconZap,
} from "../Icons";

/**
 * The software product portfolio — the command centre for everything we
 * build, own, sell, license or manage.
 *
 * The rule that runs through every panel, inherited from Apps and Websites:
 * A NUMBER APPEARS ONLY WHEN SOMETHING MEASURED IT, and MISSING HEALTH DATA
 * IS UNKNOWN, NEVER HEALTHY. A product whose apps nobody has checked shows
 * "Unknown" in grey and the panel says what would fix it.
 *
 * The second rule is §44: this page is one round of database queries. It does
 * not call a provider, and it does not fan out per product.
 */

/* ── The six numbers ───────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Active Software Products",
      value: count(k.activeProducts),
      icon: <IconLayers size={15} />,
      foot: (
        <span className="cc-faint">
          {k.totalProducts > 0 ? `Of ${count(k.totalProducts)} total products` : "Nothing registered yet"}
        </span>
      ),
      href: "/admin/software",
    },
    {
      label: "SaaS Clients",
      value: count(k.saasClients),
      icon: <IconUsers size={15} />,
      // Counted once each: a client on two products is one client, and
      // saying so stops the header inflating the moment anything cross-sells.
      foot: <span className="cc-faint">Unique clients across all products</span>,
      href: "/admin/clients",
    },
    {
      label: "Monthly Recurring Revenue",
      value: k.mrrCents === null ? DASH : moneyCompact(k.mrrCents),
      icon: <IconDollar size={15} />,
      foot: (
        <span className="cc-faint">
          {k.mrrCents === null
            ? "No software subscription recorded"
            : "From the prices clients agreed to"}
        </span>
      ),
      href: "/admin/software?sort=mrr",
    },
    {
      label: "In Development",
      value: count(k.inDevelopment),
      icon: <IconCode size={15} />,
      foot: <span className="cc-faint">Planning, building, testing or beta</span>,
      href: "/admin/software?tab=development",
    },
    {
      label: "Active Versions",
      value: count(k.activeVersions),
      icon: <IconRepeat size={15} />,
      foot: <span className="cc-faint">Production and staging, across all products</span>,
      href: "/admin/software?sort=version",
    },
    {
      label: "Products Needing Attention",
      value: count(k.needingAttention),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.needingAttention > 0 ? "cc-delta down" : "cc-faint"}>
          {k.needingAttention > 0 ? "Need attention now" : "Nothing flagged"}
        </span>
      ),
      href: "/admin/software?health=critical",
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

/* ── Needs attention ───────────────────────────────────────────────── */

function NeedsAttention({ board }: { board: Board }) {
  if (board.alerts.length === 0) {
    // Nothing wrong is worth saying once, quietly, rather than leaving a
    // hole where the strip was — otherwise its absence reads as a bug.
    return board.empty ? null : (
      <section className="cc-panel cc-s12">
        <div className="cc-panel-body">
          <p className="cc-note" style={{ margin: 0 }}>
            Nothing needs attention. No product has a blocked release, a failed
            subscription payment, overdue onboarding, a critical issue open or an
            app reporting a failure.
          </p>
        </div>
      </section>
    );
  }

  return (
    <Panel
      title="Needs Attention"
      sub={`${board.alerts.length} ${board.alerts.length === 1 ? "item requires" : "items require"} attention`}
      icon={<IconAlert size={15} />}
      className="cc-s12"
      bodyClass="flush"
      action={{ href: "/admin/software?health=critical", label: "View All" }}
    >
      <div className="cc-alerts">
        {board.alerts.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className={`cc-alert p-${alert.severity === "critical" ? "critical" : "medium"}`}
          >
            <span className="cc-alert-pri" />
            <span className="cc-alert-main">
              <span className="cc-alert-title">
                {alert.softwareName} — {alert.title}
              </span>
              <span className="cc-alert-detail">{alert.detail}</span>
            </span>
            <span className="cc-alert-cat">{alert.severity}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

function Tabs({ board, filters }: { board: Board; filters: SoftwareFilters }) {
  const tabs: { key: SoftwareFilters["tab"]; label: string }[] = [
    { key: "all", label: "All Software" },
    { key: "live", label: "Live" },
    { key: "development", label: "In Development" },
    { key: "beta", label: "Beta" },
    { key: "testing", label: "Testing" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="cc-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "all" ? "/admin/software" : `/admin/software?tab=${tab.key}`}
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

function HealthChip({ row }: { row: SoftwareRow }) {
  const why = row.health.reasons.length
    ? row.health.reasons.map((reason) => reason.label).join(" · ")
    : row.health.state === "unknown"
      ? "Nothing has checked this product's apps recently."
      : "No failing app, blocked release, overdue onboarding or billing failure.";
  return <span className={`cc-chip ${HEALTH_TONE[row.health.state]}`} title={why}>{row.health.label}</span>;
}

function MrrCell({ row }: { row: SoftwareRow }) {
  if (row.mrrCents === null) {
    return (
      <span className="cc-dim" title="No billing client is recorded against this product.">
        {DASH}
      </span>
    );
  }
  return (
    <span
      title={`From ${row.billingClientCount} billing ${row.billingClientCount === 1 ? "client" : "clients"}, at the prices each of them agreed to.`}
    >
      {money(row.mrrCents)}
    </span>
  );
}

function VersionCell({ row }: { row: SoftwareRow }) {
  if (!row.currentVersion) {
    return <span className="cc-faint" title="No version has been promoted to production.">{DASH}</span>;
  }
  return (
    <span className="cc-mono">
      {row.currentVersion}
      {row.stagingVersion ? (
        <span className="cc-client-sub">{row.stagingVersion} staging</span>
      ) : null}
    </span>
  );
}

/* ── The table ─────────────────────────────────────────────────────── */

function PortfolioTable({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-scroll">
      <table className="cc-table dense">
        <thead>
          <tr>
            <th>Software</th>
            <th>Type</th>
            <th className="num">Clients</th>
            <th>Version</th>
            <th>Status</th>
            <th className="num">MRR</th>
            <th>Health</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link className="cc-link cc-strong" href={`/admin/software/${row.id}`}>{row.name}</Link>
                <span className="cc-client-sub">{row.description || row.internalName || row.slug}</span>
              </td>
              <td className="cc-dim">{row.productTypeLabel}</td>
              <td className="num">{row.clientCount > 0 ? count(row.clientCount) : <span className="cc-faint">{DASH}</span>}</td>
              <td><VersionCell row={row} /></td>
              <td><span className={`cc-chip ${LIFECYCLE_TONE[row.status]}`}>{row.statusLabel}</span></td>
              <td className="num"><MrrCell row={row} /></td>
              <td><HealthChip row={row} /></td>
              <td className="cc-dim">
                {shortDate(row.updatedAt)}
                <span className="cc-client-sub">{ago(row.updatedAt)}</span>
              </td>
              <td>
                <SoftwareRowActions
                  softwareId={row.id}
                  productionUrl={null}
                  clientCount={row.clientCount}
                  appCount={row.appCount}
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

/* ── Cards ─────────────────────────────────────────────────────────── */

function PortfolioCards({ board, canManage }: { board: Board; canManage: boolean }) {
  return (
    <div className="cc-appcards">
      {board.rows.map((row) => (
        <article className="cc-appcard" key={row.id}>
          <div className="cc-appcard-top">
            <span className="cc-mono">{(row.internalName || row.name).slice(0, 2).toUpperCase()}</span>
            <span className="cc-appcard-name">
              <Link className="cc-link" href={`/admin/software/${row.id}`}>{row.name}</Link>
            </span>
            <SoftwareRowActions
              softwareId={row.id}
              productionUrl={null}
              clientCount={row.clientCount}
              appCount={row.appCount}
              isArchived={row.isArchived}
              canManage={canManage}
            />
          </div>

          <div className="cc-appcard-sub">
            {row.productTypeLabel}
            {row.industry ? ` · ${row.industry}` : ""}
          </div>

          <div className="cc-taglist" style={{ marginTop: 8 }}>
            <span className={`cc-chip ${LIFECYCLE_TONE[row.status]}`}>{row.statusLabel}</span>
            <HealthChip row={row} />
          </div>

          <dl className="cc-kv" style={{ marginTop: 10 }}>
            <dt>Clients</dt>
            <dd>{row.clientCount > 0 ? count(row.clientCount) : DASH}</dd>
            <dt>Version</dt>
            <dd><VersionCell row={row} /></dd>
            <dt>MRR</dt>
            <dd><MrrCell row={row} /></dd>
            <dt>Apps</dt>
            <dd>{row.appCount > 0 ? count(row.appCount) : DASH}</dd>
          </dl>

          <div className="cc-rowacts" style={{ marginTop: 10 }}>
            <Link className="cc-btn is-sm" href={`/admin/software/${row.id}`}>Open product</Link>
            {row.planCount > 0 ? (
              <Link className="cc-btn is-sm" href={`/admin/software/${row.id}?tab=plans`}>
                {row.planCount} {row.planCount === 1 ? "plan" : "plans"}
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Portfolio({
  board,
  filters,
  canManage,
}: {
  board: Board;
  filters: SoftwareFilters;
  canManage: boolean;
}) {
  const filtered = Boolean(
    filters.q || filters.type || filters.status || filters.industry ||
    filters.health || filters.owner || filters.client
  );

  return (
    <Panel
      title="Software"
      sub={
        board.rows.length > 0
          ? `Showing 1–${board.rows.length} of ${board.rows.length} software ${board.rows.length === 1 ? "product" : "products"}`
          : undefined
      }
      icon={<IconLayers size={15} />}
      className="cc-s8"
    >
      <SoftwareFiltersBar
        industries={board.industries}
        owners={board.owners}
        clients={board.clients}
      />

      {board.rows.length === 0 ? (
        board.empty ? (
          <EmptyState
            icon={<IconCode size={17} />}
            title="No software products yet"
            text="Create your first software product to begin managing clients, plans, versions, releases, roadmap and revenue."
          />
        ) : filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter or two and the rest of the portfolio comes back."
            cta={{ href: "/admin/software", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            title="Nothing in this tab"
            text="Every product is in another state right now."
            cta={{ href: "/admin/software", label: "See all software" }}
          />
        )
      ) : filters.view === "cards" ? (
        <PortfolioCards board={board} canManage={canManage} />
      ) : (
        <PortfolioTable board={board} canManage={canManage} />
      )}
    </Panel>
  );
}

/* ── Revenue overview ──────────────────────────────────────────────── */

function RevenueOverviewPanel({ board, filters }: { board: Board; filters: SoftwareFilters }) {
  const r = board.revenue;

  const windows: { months: 3 | 6 | 12; label: string }[] = [
    { months: 3, label: "3 months" },
    { months: 6, label: "6 months" },
    { months: 12, label: "12 months" },
  ];

  return (
    <Panel title="Revenue Overview" icon={<IconDollar size={15} />}>
      <div className="cc-tabs" style={{ marginBottom: 10 }}>
        {windows.map((w) => (
          <Link
            key={w.months}
            href={`/admin/software?months=${w.months}`}
            className={`cc-tab ${filters.months === w.months ? "is-on" : ""}`}
          >
            Last {w.label}
          </Link>
        ))}
      </div>

      <div className="cc-kpi-value">{r.mrrCents === null ? DASH : money(r.mrrCents)}</div>
      <div className="cc-kpi-foot">
        <span className="cc-faint">Monthly Recurring Revenue</span>
      </div>

      {r.basis === "none" ? (
        <EmptyState
          title="No subscription history yet"
          text="Once clients are assigned to a product with a start date and an agreed price, their recurring revenue is charted here."
        />
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <MiniBars
              points={r.months.map((m, i) => ({ key: `${m.label}-${i}`, value: m.mrrCents }))}
              labelLeft={r.months[0]?.label}
              labelRight={r.months[r.months.length - 1]?.label}
              format={(value, key) => `${key.split("-")[0]}: ${money(value)}`}
            />
          </div>

          <ul className="cc-health" style={{ marginTop: 12 }}>
            <li className="cc-health-row">
              <div className="cc-health-name">MRR growth</div>
              <div className="cc-health-detail">Across the window</div>
              <span className={`cc-chip ${r.mrrDelta === null ? "t-muted" : r.mrrDelta >= 0 ? "t-ok" : "t-risk"}`}>
                {r.mrrDelta === null ? "No baseline" : pct(r.mrrDelta, 0)}
              </span>
            </li>
            <li className="cc-health-row">
              <div className="cc-health-name">Client growth</div>
              <div className="cc-health-detail">
                {count(r.newClients)} new · {count(r.canceledClients)} canceled
              </div>
              <span className={`cc-chip ${r.clientDelta === null ? "t-muted" : r.clientDelta >= 0 ? "t-ok" : "t-risk"}`}>
                {r.clientDelta === null ? "No baseline" : pct(r.clientDelta, 0)}
              </span>
            </li>
            <li className="cc-health-row">
              <div className="cc-health-name">Churn rate</div>
              <div className="cc-health-detail">Canceled, of everyone present in the window</div>
              <span className={`cc-chip ${r.churnRate === null ? "t-muted" : r.churnRate > 0.05 ? "t-warn" : "t-ok"}`}>
                {r.churnRate === null ? DASH : pct(r.churnRate, 1)}
              </span>
            </li>
          </ul>

          {/* Said plainly, because a chart that looks measured and is not is
              worse than no chart. */}
          <p className="cc-note">
            Reconstructed from each subscription&rsquo;s start and end dates at the price
            that client currently pays. A client who was moved to different pricing
            shows their current price across the whole window.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── Software by status ────────────────────────────────────────────── */

function ByStatus({ board }: { board: Board }) {
  const total = board.byStatus.reduce((sum, item) => sum + item.count, 0);
  const slices = board.byStatus.map((item) => ({
    label: item.label,
    value: item.count,
    share: total > 0 ? item.count / total : 0,
  }));

  return (
    <Panel title="Software by Status" icon={<IconChart size={15} />}>
      {slices.length === 0 ? (
        <EmptyState title="Nothing to break down" text="This fills in from the products you create." />
      ) : (
        <div className="cc-donut-wrap">
          <Donut
            slices={slices}
            total={count(total)}
            caption={total === 1 ? "Product" : "Products"}
            format={(v) => count(v)}
          />
          <Legend slices={slices} format={(v) => count(v)} />
        </div>
      )}
    </Panel>
  );
}

/* ── Top performing ────────────────────────────────────────────────── */

function TopPerforming({ board }: { board: Board }) {
  return (
    <Panel
      title="Top Performing Software"
      icon={<IconZap size={15} />}
      action={board.topPerforming.length > 0 ? { href: "/admin/software?sort=mrr", label: "View All" } : undefined}
    >
      {board.topPerforming.length === 0 ? (
        <EmptyState
          title="Nothing to rank yet"
          // Ranking by revenue that nobody recorded would be a made-up
          // leaderboard, so products with no billing are absent rather than
          // shown at the bottom with a zero beside them.
          text="Products appear here once a client is assigned to one with an agreed monthly price."
        />
      ) : (
        <ul className="cc-feed">
          {board.topPerforming.map((product) => (
            <li className="cc-feed-item" key={product.id}>
              <span className="cc-feed-main">
                <Link className="cc-feed-title cc-link" href={`/admin/software/${product.id}`}>
                  {product.name}
                </Link>
                <span className="cc-feed-sub">
                  {count(product.clientCount)} {product.clientCount === 1 ? "client" : "clients"} ·{" "}
                  {money(product.mrrCents)} MRR
                </span>
              </span>
              <span className={`cc-chip ${HEALTH_TONE[product.health]}`}>{product.healthLabel}</span>
              <span className={`cc-chip ${LIFECYCLE_TONE[product.status]}`}>{product.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Portfolio health ──────────────────────────────────────────────── */

function PortfolioHealth({ board }: { board: Board }) {
  const unknown = board.healthBreakdown.find((h) => h.state === "unknown")?.count ?? 0;
  if (board.healthBreakdown.length === 0) return null;

  return (
    <Panel title="Portfolio health" icon={<IconPulse size={15} />}>
      <ul className="cc-health">
        {board.healthBreakdown.map((item) => (
          <li className="cc-health-row" key={item.state}>
            <div className="cc-health-name">
              <Link className="cc-link" href={`/admin/software?health=${item.state}`}>{item.label}</Link>
            </div>
            <div className="cc-health-detail">
              {item.state === "unknown" ? "Nothing has checked them recently" : "Rolled up from linked apps"}
            </div>
            <span className={`cc-chip ${HEALTH_TONE[item.state]}`}>{count(item.count)}</span>
          </li>
        ))}
      </ul>
      {unknown > 0 ? (
        <p className="cc-note">
          {unknown === 1 ? "One product has" : `${unknown} products have`} no recent health data,
          so their state is Unknown rather than healthy. Link the apps they are built from and
          run the checks from the Apps screen.
        </p>
      ) : null}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function SoftwareBoard({ filters }: { filters: SoftwareFilters }) {
  const session = await getAdminUser();
  const canManage = ["owner", "admin"].includes(session?.admin.role ?? "viewer");

  const supabase = await createSupabaseServerClient();
  const [board, choices] = await Promise.all([
    loadSoftwareBoard(supabase, filters),
    loadSoftwareChoices(supabase),
  ]);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Software</h1>
          <p>
            Manage your software products, versions, clients, revenue, and roadmap —
            all in one place.
          </p>
        </div>
        <div className="cc-greet-actions">
          <Link className="cc-btn" href="/admin/software?view=roadmap">View Roadmap</Link>
          <Link className="cc-btn" href="/admin/settings/agreements">Manage Templates</Link>
          {canManage ? (
            <NewSoftware
              services={choices.services}
              taskTemplates={choices.taskTemplates}
              websites={choices.websites}
              people={choices.people}
              unlinkedApps={choices.unlinkedApps}
            />
          ) : null}
        </div>
      </div>

      <KpiRow board={board} />

      <div className="cc-board" style={{ marginBottom: 16 }}>
        <NeedsAttention board={board} />
      </div>

      <Tabs board={board} filters={filters} />

      <div className="cc-board">
        <Portfolio board={board} filters={filters} canManage={canManage} />

        {/* The right operational column. A wrapper rather than three loose
            cc-s4 panels, because grid auto-placement would wrap them under
            the table instead of stacking them beside it. At tablet and
            below it collapses with everything else. */}
        <div className="cc-s4" style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <RevenueOverviewPanel board={board} filters={filters} />
          <ByStatus board={board} />
          <PortfolioHealth board={board} />
          <TopPerforming board={board} />
        </div>
      </div>
    </>
  );
}

export function SoftwareBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Software" rows={6} />
      <PanelSkeleton title="Revenue Overview" rows={4} />
      <PanelSkeleton title="Software by Status" rows={3} />
    </div>
  );
}
