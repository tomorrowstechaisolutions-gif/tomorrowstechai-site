import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadHostingBoard,
  type HostingBoard as Board,
  type HostingFilters,
  type HostingRow,
} from "@/lib/hosting/queries";
import { marginBand } from "@/lib/hosting/profit";
import { resolveIncidentAction } from "@/app/admin/hosting-actions";
import { EmptyState, Panel, PanelSkeleton } from "../Panel";
import { Donut, Legend } from "../Viz";
import HostingFiltersBar from "../HostingFilters";
import { ago, count, DASH, money, moneyCompact, pct, shortDate } from "../format";
import {
  IconAlert,
  IconChart,
  IconDollar,
  IconGlobe,
  IconLayers,
  IconPulse,
  IconRepeat,
  IconServer,
  IconSpark,
  IconUsers,
  IconZap,
} from "../Icons";

/**
 * Hosting.
 *
 * There is no hosting_accounts table behind this screen. A hosting account is
 * a website we host — the same row /admin/websites reads — joined to the
 * client who pays, the invoices that billed them, the renewals that expire,
 * the costs it incurs and the incidents recorded against it.
 *
 * Money is real: MRR counts each paying client once, ARR is that times
 * twelve, past-due comes from invoice status. Margin is real ONLY where a
 * cost has been recorded, and reads "Cost unknown" everywhere else — a
 * margin computed from costs nobody entered is the number you would price
 * against, which makes inventing one worse than leaving it blank.
 *
 * Uptime, backups and deploy status have no source in this project and say
 * so rather than showing a number.
 */

const HEALTH_TONE: Record<string, string> = {
  healthy: "t-ok",
  warning: "t-warn",
  issue: "t-risk",
  offline: "t-risk",
  unmonitored: "t-muted",
  development: "t-info",
  archived: "t-muted",
};

const SSL_TONE: Record<string, string> = {
  valid: "t-ok",
  expiring: "t-warn",
  expired: "t-risk",
  unknown: "t-muted",
};

const SSL_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  unknown: "Unknown",
};

/* ── 1. The six numbers ────────────────────────────────────────────── */

function KpiRow({ board }: { board: Board }) {
  const k = board.kpis;

  const cards = [
    {
      label: "Hosting clients",
      value: count(k.clients),
      icon: <IconUsers size={15} />,
      foot: <span className="cc-faint">Clients with a site we host</span>,
      href: "/admin/clients",
    },
    {
      label: "Monthly recurring",
      value: k.mrrCents > 0 ? moneyCompact(k.mrrCents) : DASH,
      icon: <IconDollar size={15} />,
      foot: (
        <span className="cc-faint">
          {k.mrrCents > 0 ? "Counted once per paying client" : "No recurring hosting revenue yet"}
        </span>
      ),
      href: "/admin/clients",
    },
    {
      label: "Annual recurring",
      value: k.arrCents > 0 ? moneyCompact(k.arrCents) : DASH,
      icon: <IconChart size={15} />,
      foot: <span className="cc-faint">{k.arrCents > 0 ? "MRR × 12, at today's rate" : "Follows from MRR"}</span>,
      href: "/admin/hosting",
    },
    {
      label: "Active plans",
      value: count(k.activePlans),
      icon: <IconLayers size={15} />,
      foot: <span className="cc-faint">Live accounts with a plan assigned</span>,
      href: "/admin/hosting?tab=active",
    },
    {
      label: "Renewals (30 days)",
      value: count(k.renewalsDue),
      icon: <IconRepeat size={15} />,
      foot: (
        <span className="cc-faint">
          {k.renewalsDueCents > 0 ? `${money(k.renewalsDueCents)} value` : "Domains, hosting, SSL"}
        </span>
      ),
      href: "/admin/hosting?renewal=30",
    },
    {
      label: "Sites with issues",
      value: count(k.sitesWithIssues),
      icon: <IconAlert size={15} />,
      foot: (
        <span className={k.sitesWithIssues > 0 ? "cc-delta down" : "cc-faint"}>
          {k.sitesWithIssues > 0 ? "Incidents, money owed or health" : "Nothing flagged"}
        </span>
      ),
      href: "/admin/hosting?attention=1",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((c) => (
        <Link className="cc-kpi" key={c.label} href={c.href}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-icon">{c.icon}</span>
            <span className="cc-kpi-label">{c.label}</span>
          </div>
          <div className="cc-kpi-value">{c.value}</div>
          <div className="cc-kpi-foot">{c.foot}</div>
        </Link>
      ))}
    </div>
  );
}

/* ── 2. The accounts table ─────────────────────────────────────────── */

function AccountRow({ site }: { site: HostingRow }) {
  const band = marginBand(site.profit.marginPct);

  return (
    <tr>
      <td>
        <span className="cc-strong">{site.name}</span>
        <span className="cc-client-sub">{site.client?.name ?? "Ours"}</span>
      </td>
      <td>
        <a className="cc-link" href={site.baseUrl} target="_blank" rel="noopener noreferrer nofollow">
          {site.domain}
        </a>
      </td>
      <td className="cc-dim">{site.plan?.name ?? <span className="cc-faint">No plan</span>}</td>
      <td className="num">
        {site.priceCents === null ? (
          <span className="cc-dim" title="No per-site hosting renewal, and this client's subscription covers more than one site.">
            {DASH}
          </span>
        ) : (
          money(site.priceCents)
        )}
      </td>
      <td>
        {site.billing === "past_due" ? (
          <span className="cc-chip t-risk" title={`${money(site.pastDueCents)} outstanding`}>Past due</span>
        ) : site.billing === "active" ? (
          <span className="cc-chip t-ok">Active</span>
        ) : (
          <span className="cc-chip t-muted">No subscription</span>
        )}
      </td>
      <td className="cc-dim">{site.nextBillingAt ? shortDate(site.nextBillingAt) : DASH}</td>
      <td className="cc-dim">{site.provider ?? <span className="cc-faint">{DASH}</span>}</td>
      <td className="num">
        {site.uptimePct === null ? <span className="cc-faint">Not connected</span> : `${site.uptimePct.toFixed(2)}%`}
      </td>
      <td>
        <span className={`cc-chip ${SSL_TONE[site.sslState]}`}>{SSL_LABEL[site.sslState]}</span>
      </td>
      <td className="cc-dim">
        {site.deployStatus ?? <span className="cc-faint">{DASH}</span>}
      </td>
      <td className="cc-dim">
        {site.lastBackupAt ? ago(site.lastBackupAt) : <span className="cc-faint">Not configured</span>}
      </td>
      <td className="num">
        {site.profit.marginPct === null ? (
          <span className="cc-faint" title={site.profit.unknownReason ?? ""}>Unknown</span>
        ) : (
          <span className={band === "negative" ? "cc-delta down" : band === "thin" ? "cc-dim" : "cc-delta up"}>
            {pct(site.profit.marginPct, 0)}
          </span>
        )}
      </td>
      <td>
        <span className={`cc-chip ${HEALTH_TONE[site.health.state]}`} title={site.health.reasons.map((r) => r.label).join(" · ") || "Nothing wrong"}>
          {site.health.label}
        </span>
      </td>
    </tr>
  );
}

function Accounts({ board, filters }: { board: Board; filters: HostingFilters }) {
  const tabs: { key: HostingFilters["tab"]; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "suspended", label: "Suspended" },
    { key: "pending", label: "Pending" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const filtered = Boolean(
    filters.q || filters.plan || filters.provider || filters.billing || filters.health || filters.attention || filters.renewal
  );

  return (
    <Panel
      title="Hosting accounts"
      sub={`${count(board.rows.length)} shown`}
      icon={<IconServer size={15} />}
      className="cc-s12"
    >
      <div className="cc-tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/hosting" : `/admin/hosting?tab=${t.key}`}
            className={`cc-tab ${filters.tab === t.key ? "is-on" : ""}`}
          >
            {t.label}
            <span className="cc-tab-n">{count(board.tabCounts[t.key])}</span>
          </Link>
        ))}
      </div>

      {board.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nothing matches those filters"
            text="Clear a filter and the rest of the accounts come back."
            cta={{ href: "/admin/hosting", label: "Clear filters" }}
          />
        ) : (
          <EmptyState
            icon={<IconServer size={17} />}
            title="No hosting accounts have been added"
            text="A hosting account is a website you host. Add sites on the Websites screen and they appear here with their client, plan and billing."
            cta={{ href: "/admin/websites", label: "Open Websites" }}
          />
        )
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Client / Site</th>
                <th>Domain</th>
                <th>Plan</th>
                <th className="num">Price</th>
                <th>Billing</th>
                <th>Next</th>
                <th>Provider</th>
                <th className="num">Uptime</th>
                <th>SSL</th>
                <th>Deploy</th>
                <th>Backup</th>
                <th className="num">Margin</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((s) => (
                <AccountRow site={s} key={s.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── 3. Revenue ────────────────────────────────────────────────────── */

function Revenue({ board }: { board: Board }) {
  const k = board.kpis;

  return (
    <Panel title="Revenue overview" icon={<IconDollar size={15} />} className="cc-s6">
      {k.mrrCents === 0 ? (
        <EmptyState
          title="No recurring hosting revenue yet"
          text="MRR is counted from each paying client's subscription, plus per-site hosting renewals for clients without one."
        />
      ) : (
        <div className="cc-stats">
          <div className="cc-stat">
            <div className="cc-stat-label">MRR</div>
            <div className="cc-stat-value">{money(k.mrrCents)}</div>
            <div className="cc-stat-hint">Each client counted once</div>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-label">ARR</div>
            <div className="cc-stat-value">{money(k.arrCents)}</div>
            <div className="cc-stat-hint">At today&rsquo;s rate</div>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-label">Per client</div>
            <div className="cc-stat-value">{k.arpuCents === null ? DASH : money(k.arpuCents)}</div>
            <div className="cc-stat-hint">Average monthly</div>
          </div>
        </div>
      )}
      <p className="cc-note">
        A month-over-month trend needs billing history this account does not have yet. It appears
        here once there are two months of hosting invoices to compare.
      </p>
    </Panel>
  );
}

/* ── 4. Plan distribution and providers ────────────────────────────── */

function Plans({ board }: { board: Board }) {
  const total = board.planDistribution.reduce((t, p) => t + p.count, 0);
  const slices = board.planDistribution.map((p) => ({
    label: p.name,
    value: p.count,
    share: total > 0 ? p.count / total : 0,
  }));

  return (
    <Panel title="Plan distribution" icon={<IconLayers size={15} />} className="cc-s6">
      {slices.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          text="Three hosting plans are set up in your catalog — Starter, Pro and Business. Assign one to a site and it appears here."
          cta={{ href: "/admin/catalog", label: "Open catalog" }}
        />
      ) : (
        <div className="cc-donut-wrap">
          <Donut
            slices={slices}
            total={count(total)}
            caption={total === 1 ? "account" : "accounts"}
            format={(v) => count(v)}
          />
          <Legend slices={slices} format={(v) => count(v)} />
        </div>
      )}
    </Panel>
  );
}

function Providers({ board }: { board: Board }) {
  const total = board.providerUsage.reduce((t, p) => t + p.count, 0);

  return (
    <Panel title="Provider usage" icon={<IconServer size={15} />} className="cc-s6">
      {board.providerUsage.length === 0 ? (
        <EmptyState
          title="No providers recorded"
          text="Set a hosting provider on a site and the split appears here. Only providers you actually record are shown."
        />
      ) : (
        <div className="cc-barlist">
          {board.providerUsage.map((p) => (
            <div className="cc-barrow" key={p.name}>
              <span className="cc-barrow-label">{p.name}</span>
              <span className="cc-barrow-track">
                <span className="cc-barrow-fill" style={{ width: `${(p.count / total) * 100}%` }} />
              </span>
              <span className="cc-barrow-value">{count(p.count)}</span>
              <span className="cc-barrow-share">{pct(p.count / total, 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 5. Renewals, failed payments, incidents ───────────────────────── */

function Renewals({ board }: { board: Board }) {
  return (
    <Panel title="Renewals due soon" icon={<IconRepeat size={15} />} className="cc-s6">
      {board.renewals.length === 0 ? (
        <EmptyState
          title="No renewals recorded"
          text="Domain, hosting, SSL and support renewal dates are tracked per site. Client subscription dates come from Stripe."
        />
      ) : (
        <ul className="cc-health">
          {board.renewals.map((r) => {
            const tone = r.daysUntil < 0 ? "t-risk" : r.daysUntil <= 7 ? "t-warn" : r.daysUntil <= 30 ? "t-info" : "t-muted";
            const when = r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue` : r.daysUntil === 0 ? "today" : `in ${r.daysUntil}d`;
            return (
              <li className="cc-health-row" key={`${r.websiteId}-${r.kind}-${r.renewsAt}`}>
                <div className="cc-health-name">{r.websiteName}</div>
                <div className="cc-health-detail">
                  {r.kind === "ssl" ? "SSL" : r.kind} · {shortDate(r.renewsAt)}
                </div>
                <span className={`cc-chip ${tone}`}>{when}</span>
                <span className="cc-mono">{r.amountCents === null ? DASH : money(r.amountCents)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function FailedPayments({ board }: { board: Board }) {
  return (
    <Panel
      title="Failed payments"
      icon={<IconAlert size={15} />}
      className="cc-s6"
      action={{ href: "/admin/clients", label: "Clients" }}
    >
      {board.failedPayments.length === 0 ? (
        <EmptyState
          title="No failed payments"
          text="Invoices that Stripe reports as failed, past due or uncollectible appear here."
        />
      ) : (
        <>
          <ul className="cc-health">
            {board.failedPayments.map((p) => (
              <li className="cc-health-row" key={p.id}>
                <div className="cc-health-name">{p.clientName}</div>
                <div className="cc-health-detail">{p.billedAt ? shortDate(p.billedAt) : DASH}</div>
                <span className="cc-chip t-risk">{p.status.replace(/_/g, " ")}</span>
                <span className="cc-mono">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
          <p className="cc-note">
            Nothing here retries a charge. Re-attempting a client&rsquo;s card is a decision with
            their money attached, and it belongs in Stripe rather than in a dashboard button.
          </p>
        </>
      )}
    </Panel>
  );
}

function Incidents({ board }: { board: Board }) {
  return (
    <Panel
      title="Sites with issues"
      sub={board.incidents.length > 0 ? `${count(board.incidents.length)} open` : undefined}
      icon={<IconPulse size={15} />}
      className="cc-s6"
    >
      {board.incidents.length === 0 ? (
        <EmptyState
          icon={<IconPulse size={17} />}
          title="No open incidents"
          text={
            board.monitoring.uptime
              ? "Nothing is currently flagged."
              : "Nothing is flagged. No uptime monitor is connected, so incidents here are ones somebody recorded rather than ones a checker found."
          }
        />
      ) : (
        <div className="cc-alerts">
          {board.incidents.map((i) => (
            <div className={`cc-alert p-${i.severity}`} key={i.id}>
              <span className="cc-alert-pri" />
              <span className="cc-alert-main">
                <span className="cc-alert-title">{i.title}</span>
                <span className="cc-alert-detail">
                  {i.websiteName} · {i.kind.replace(/_/g, " ")} · detected {ago(i.detectedAt)}
                  {i.source === "manual" ? " (recorded by hand)" : ""}
                  {i.detail ? ` — ${i.detail}` : ""}
                </span>
              </span>
              <form action={resolveIncidentAction} className="cc-inline-form">
                <input type="hidden" name="incident_id" value={i.id} />
                <button type="submit" className="cc-btn">Resolve</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── 6. Profitability ──────────────────────────────────────────────── */

/**
 * The panel that has to be most careful.
 *
 * It ranks by margin, and it can only rank accounts whose margin is known.
 * When no costs have been recorded anywhere it says so and explains what to
 * enter, rather than showing a leaderboard of 100% margins.
 */
function Profitability({ board }: { board: Board }) {
  const known = board.costsKnown;

  return (
    <Panel
      title="Profitability"
      sub={known > 0 ? `${count(known)} of ${count(board.rows.length)} accounts costed` : undefined}
      icon={<IconChart size={15} />}
      className="cc-s6"
    >
      {board.profitable.length === 0 ? (
        <EmptyState
          icon={<IconDollar size={17} />}
          title="No costs recorded yet"
          text="Margin is revenue minus what a site actually costs — hosting, domain, storage, support. Until a cost is recorded against an account, margin stays blank rather than being guessed, because a made-up margin is the number you would price against."
        />
      ) : (
        <>
          <div className="cc-subhead">Best margin</div>
          <div className="cc-barlist">
            {board.profitable.map((p) => (
              <div className="cc-barrow" key={p.id}>
                <span className="cc-barrow-label">{p.name}</span>
                <span className="cc-barrow-track">
                  <span
                    className="cc-barrow-fill"
                    style={{ width: `${Math.max(0, Math.min(100, p.marginPct * 100))}%` }}
                  />
                </span>
                <span className="cc-barrow-value">{pct(p.marginPct, 0)}</span>
                <span className="cc-barrow-share">{money(p.grossCents)}</span>
              </div>
            ))}
          </div>

          {board.lowMargin.length > 0 && board.lowMargin[0].id !== board.profitable[0].id ? (
            <>
              <div className="cc-subhead">Thinnest margin</div>
              <ul className="cc-health">
                {board.lowMargin.slice(0, 3).map((p) => (
                  <li className="cc-health-row" key={p.id}>
                    <div className="cc-health-name">{p.name}</div>
                    <div className="cc-health-detail">{money(p.grossCents)} a month</div>
                    <span className={`cc-chip ${p.marginPct < 0 ? "t-risk" : p.marginPct < 0.4 ? "t-warn" : "t-ok"}`}>
                      {pct(p.marginPct, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <p className="cc-note">
        Card processing is estimated at 2.9% + 30¢ where a Stripe subscription exists — a published
        formula on money we know we collected, not a measurement of the exact fee.
      </p>
    </Panel>
  );
}

/* ── 7. Deployments and monitoring ─────────────────────────────────── */

const DEPLOY_TONE: Record<string, string> = {
  success: "t-ok", building: "t-info", failed: "t-risk", canceled: "t-muted",
};

function Deployments({ board }: { board: Board }) {
  return (
    <Panel title="Recent deployments" icon={<IconGlobe size={15} />} className="cc-s6">
      {board.deployments.length === 0 ? (
        <EmptyState
          title="No deployment data"
          text={
            board.monitoring.deployments
              ? "Vercel is connected but nothing has synced yet."
              : "Vercel is not connected. The deployments table is shaped like Vercel's own deployment object, so a token fills this in without a redesign."
          }
        />
      ) : (
        <ul className="cc-feed">
          {board.deployments.map((d) => (
            <li className="cc-feed-item" key={d.id}>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{d.websiteName}</span>
                <span className="cc-feed-sub">
                  {d.environment}
                  {d.gitBranch ? ` · ${d.gitBranch}` : ""}
                </span>
              </span>
              <span className={`cc-chip ${DEPLOY_TONE[d.status] ?? "t-muted"}`}>{d.status}</span>
              <span className="cc-feed-when">{ago(d.deployedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * What is and is not watching. One honest panel instead of three empty ones.
 */
function Monitoring({ board }: { board: Board }) {
  const checks = [
    { label: "Uptime monitoring", on: board.monitoring.uptime, detail: "Would give the uptime column a real number and open incidents on its own." },
    { label: "Deployment feed", on: board.monitoring.deployments, detail: "Vercel. Would fill deploy status and the deployments panel." },
    { label: "Backups", on: board.monitoring.backups, detail: "Nothing takes or verifies backups today. Last-backup reads Not configured." },
  ];

  return (
    <Panel title="Monitoring" icon={<IconZap size={15} />} className="cc-s6">
      <div className="cc-checks">
        {checks.map((c) => (
          <div className={`cc-check-row ${c.on ? "t-ok" : "t-none"}`} key={c.label}>
            <span className="cc-check-dot" />
            <span className="cc-check-name">{c.label}</span>
            <span className="cc-check-detail">{c.detail}</span>
            <span className="cc-check-score">{c.on ? "Connected" : "Not connected"}</span>
          </div>
        ))}
      </div>
      <p className="cc-note">
        Monitoring may run on its own. Anything that changes a client&rsquo;s service — suspending
        an account, changing a plan, retrying a card — goes through you.
      </p>
    </Panel>
  );
}

/* ── 8. The advisor ────────────────────────────────────────────────── */

/**
 * Rules over the same data, not a model call.
 *
 * Every line names the evidence that produced it. Nothing here can act: the
 * consequential verbs on this screen all live behind a form with a server-side
 * check, and the advisor's job is to point at them.
 */
function Advisor({ board }: { board: Board }) {
  type Rec = { id: string; kind: string; title: string; body: string; tone: string };
  const recs: Rec[] = [];

  const overdue = board.renewals.filter((r) => r.daysUntil < 0);
  if (overdue.length > 0) {
    recs.push({
      id: "overdue",
      kind: "Risk",
      title: `${overdue.length} renewal${overdue.length === 1 ? " is" : "s are"} overdue`,
      body: `${overdue.map((r) => `${r.websiteName} (${r.kind})`).join(", ")}. An expired domain takes the site off the air and is slow to undo.`,
      tone: "risk",
    });
  }

  const soon = board.renewals.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 14);
  if (soon.length > 0) {
    recs.push({
      id: "soon",
      kind: "Maintenance",
      title: `${soon.length} renewal${soon.length === 1 ? "" : "s"} within two weeks`,
      body: `Soonest is ${soon[0].websiteName} (${soon[0].kind}) in ${soon[0].daysUntil} days. Confirm auto-renew and the card on file.`,
      tone: "action",
    });
  }

  const pastDue = board.rows.filter((r) => r.pastDueCents > 0);
  if (pastDue.length > 0) {
    const total = pastDue.reduce((t, r) => t + r.pastDueCents, 0);
    recs.push({
      id: "pastdue",
      kind: "Billing",
      title: `${money(total)} outstanding across ${pastDue.length} account${pastDue.length === 1 ? "" : "s"}`,
      body: `${pastDue.map((r) => r.client?.name ?? r.name).join(", ")}. A failed card usually means an expiry, not a refusal to pay — the email is worth sending before the service question.`,
      tone: "revenue",
    });
  }

  const noPlan = board.rows.filter((r) => !r.plan && r.status === "live");
  if (noPlan.length > 0) {
    recs.push({
      id: "noplan",
      kind: "Billing",
      title: `${noPlan.length} live site${noPlan.length === 1 ? " has" : "s have"} no plan assigned`,
      body: `${noPlan.slice(0, 4).map((r) => r.name).join(", ")}. Without a plan there is no price, so these sites are invisible to MRR.`,
      tone: "opportunity",
    });
  }

  const uncosted = board.rows.length - board.costsKnown;
  if (uncosted > 0 && board.rows.length > 0) {
    recs.push({
      id: "costs",
      kind: "Opportunity",
      title: `${uncosted} account${uncosted === 1 ? "" : "s"} have no recorded costs`,
      body: "Margin cannot be calculated without them. Even rough figures — what hosting and the domain cost — turn the profitability panel from blank into useful.",
      tone: "opportunity",
    });
  }

  const unmonitored = board.rows.filter((r) => r.health.state === "unmonitored").length;
  if (unmonitored > 0) {
    recs.push({
      id: "unmonitored",
      kind: "Performance",
      title: `${unmonitored} live site${unmonitored === 1 ? " is" : "s are"} unmonitored`,
      body: "No uptime check, deployment feed or analytics is connected to them, so an outage would go unnoticed until a client called.",
      tone: "system",
    });
  }

  return (
    <Panel
      title="AI Hosting Advisor"
      sub="Your AI infrastructure and hosting assistant"
      icon={<IconSpark size={15} />}
      className="cc-s6"
      footer={
        <span className="cc-note">
          Every line is derived from your own renewals, invoices, plans and health — no model has
          been asked to guess. Acting on one is your call; nothing here suspends, charges or deploys.
        </span>
      }
    >
      {recs.length === 0 ? (
        <EmptyState
          title="Nothing to flag"
          text="No overdue renewals, no money outstanding, every live site has a plan and costs are recorded."
        />
      ) : (
        <div className="cc-insights">
          {recs.map((r) => (
            <article className={`cc-insight k-${r.tone}`} key={r.id}>
              <span className="cc-insight-rail" />
              <div className="cc-insight-body">
                <div className="cc-insight-kind">{r.kind}</div>
                <div className="cc-insight-title">{r.title}</div>
                <p className="cc-insight-text">{r.body}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── The board ─────────────────────────────────────────────────────── */

export default async function HostingBoard({ filters }: { filters: HostingFilters }) {
  const supabase = await createSupabaseServerClient();
  const board = await loadHostingBoard(supabase, filters);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Hosting</h1>
          <p>Manage all hosting accounts, infrastructure, billing, and performance in one place.</p>
        </div>
        <div className="cc-greet-actions">
          <Link href="/admin/websites" className="cc-add-btn">
            <IconServer size={15} />
            <span>Add hosting account</span>
          </Link>
        </div>
      </div>

      <KpiRow board={board} />
      <HostingFiltersBar
        plans={board.plans}
        providers={board.providers}
        health={[
          { key: "healthy", label: "Healthy" },
          { key: "warning", label: "Warning" },
          { key: "issue", label: "Issue" },
          { key: "unmonitored", label: "Unmonitored" },
        ]}
      />

      <div className="cc-board">
        <Accounts board={board} filters={filters} />
        <Advisor board={board} />
        <Incidents board={board} />
        <Revenue board={board} />
        <Profitability board={board} />
        <Renewals board={board} />
        <FailedPayments board={board} />
        <Plans board={board} />
        <Providers board={board} />
        <Deployments board={board} />
        <Monitoring board={board} />
      </div>
    </>
  );
}

export function HostingBoardSkeleton() {
  return (
    <div className="cc-board">
      <PanelSkeleton title="Hosting accounts" rows={6} />
      <PanelSkeleton title="AI Hosting Advisor" rows={4} />
      <PanelSkeleton title="Sites with issues" rows={4} />
    </div>
  );
}
