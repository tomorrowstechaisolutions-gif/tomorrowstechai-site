import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { panel } from "@/lib/dashboard/panel";
import { loadClientsBoard, type ClientFilters, type ClientRow } from "@/lib/clients/queries";
import { Panel, EmptyState, ErrorState } from "../Panel";
import { BarList, Donut, HealthRing, Legend, Stars } from "../Viz";
import ClientFilters_ from "../ClientFilters";
import { ago, count, deltaParts, initials, money, moneyCompact, shortDate } from "../format";
import {
  IconArrowDown,
  IconArrowUp,
  IconBriefcase,
  IconChart,
  IconDollar,
  IconGlobe,
  IconPulse,
  IconPen,
  IconRepeat,
  IconStar,
  IconUsers,
} from "../Icons";

/**
 * The whole Clients screen, from one pass over the data.
 *
 * Deliberately NOT split into a Suspense boundary per panel like the
 * dashboard: the rail's aggregates are over every client, so the rows have to
 * be loaded anyway. Six independent panels would mean six copies of the same
 * six queries.
 */

const KPI_ICON = {
  total: IconUsers,
  active: IconPulse,
  revenue: IconDollar,
  mrr: IconRepeat,
  projects: IconBriefcase,
  satisfaction: IconStar,
} as const;

const TABS = [
  { key: "all", label: "All clients" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Payment failing" },
  { key: "churned", label: "Churned" },
] as const;

const STATUS_CHIP: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "t-ok" },
  paused: { label: "Failing", tone: "t-warn" },
  churned: { label: "Churned", tone: "t-muted" },
};

export default async function ClientsBoard({ filters }: { filters: ClientFilters }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("clients", () => loadClientsBoard(supabase, filters));

  if (!result.ok) {
    return (
      <div className="cc-panel">
        <ErrorState message={result.error} />
      </div>
    );
  }

  const b = result.data;

  // Nothing at all yet — say so once, properly, instead of showing eleven
  // panels of zeroes and empty charts.
  if (b.tabCounts.all === 0) {
    return (
      <div className="cc-panel">
        <EmptyState
          title="No clients yet"
          text="A client is created automatically the moment a checkout is paid — the Stripe webhook converts the lead, opens the delivery job and starts the subscription. Add one by hand only for work that came in some other way."
          cta={{ href: "/admin/leads", label: "Open the CRM" }}
          icon={<IconUsers size={17} />}
        />
      </div>
    );
  }

  const q = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...filters, ...patch } as Record<string, unknown>;
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== null && v !== "" && !(k === "page" && v === 1)) {
        params.set(k, String(v));
      }
    }
    const s = params.toString();
    return s ? `/admin/clients?${s}` : "/admin/clients";
  };

  const tab = filters.tab ?? "all";

  return (
    <>
      {/* ── Section 1: the six numbers ─────────────────────────────── */}
      <div className="cc-kpis">
        {b.kpis.map((kpi) => {
          const Icon = KPI_ICON[kpi.key as keyof typeof KPI_ICON] ?? IconUsers;
          const delta = deltaParts(kpi.delta);
          return (
            <div key={kpi.key} className="cc-kpi">
              <div className="cc-kpi-top">
                <span className="cc-kpi-icon"><Icon size={14} /></span>
                <span className="cc-kpi-label">{kpi.label}</span>
              </div>
              <span className="cc-kpi-value">
                {kpi.format === "money"
                  ? moneyCompact(kpi.value)
                  : kpi.format === "rating"
                    ? kpi.value > 0
                      ? `${kpi.value.toFixed(1)} / 5`
                      : "—"
                    : count(kpi.value)}
              </span>
              <div className="cc-kpi-foot">
                {delta ? (
                  <span className={`cc-delta ${delta.tone}`}>
                    {delta.tone === "up" ? <IconArrowUp size={11} /> : delta.tone === "down" ? <IconArrowDown size={11} /> : null}
                    {delta.text}
                  </span>
                ) : null}
                <span>{kpi.hint}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cc-board">
        {/* ── The list ─────────────────────────────────────────────── */}
        <section className="cc-panel cc-s9 cc-m1 cc-stretch">
          <div className="cc-tabs">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={q({ tab: t.key === "all" ? undefined : t.key, page: undefined })}
                className={`cc-tab ${tab === t.key ? "is-on" : ""}`}
              >
                {t.label}
                <span className="cc-tab-n">{b.tabCounts[t.key]}</span>
              </Link>
            ))}
          </div>

          <ClientFilters_ owners={b.owners} services={b.serviceOptions} tags={b.tagOptions} />

          {b.rows.length === 0 ? (
            <EmptyState
              title="No clients match those filters"
              text="Nothing here is hidden — the filters above are the only thing narrowing this list."
              cta={{ href: "/admin/clients", label: "Clear the filters" }}
            />
          ) : (
            <>
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Contact</th>
                      <th>Services</th>
                      <th className="num">Projects</th>
                      <th className="num">Value</th>
                      <th>Status</th>
                      <th>Health</th>
                      <th>Rating</th>
                      <th>Owner</th>
                      <th>Activity</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row) => (
                      <Row key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cc-panel-foot">
                <span className="cc-faint" style={{ fontSize: "0.73rem" }}>
                  {b.total === 0
                    ? "No clients"
                    : `Showing ${(b.page - 1) * 10 + 1}–${Math.min(b.page * 10, b.total)} of ${b.total}`}
                </span>

                {b.pageCount > 1 ? (
                  <nav className="cc-pager" aria-label="Pages">
                    <Link
                      href={q({ page: String(Math.max(1, b.page - 1)) })}
                      className={`cc-page-btn ${b.page === 1 ? "is-off" : ""}`}
                      aria-label="Previous page"
                    >
                      ‹
                    </Link>
                    {Array.from({ length: b.pageCount }).map((_, i) => (
                      <Link
                        key={i}
                        href={q({ page: String(i + 1) })}
                        className={`cc-page-btn ${b.page === i + 1 ? "is-on" : ""}`}
                      >
                        {i + 1}
                      </Link>
                    ))}
                    <Link
                      href={q({ page: String(Math.min(b.pageCount, b.page + 1)) })}
                      className={`cc-page-btn ${b.page === b.pageCount ? "is-off" : ""}`}
                      aria-label="Next page"
                    >
                      ›
                    </Link>
                  </nav>
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* ── The rail ─────────────────────────────────────────────── */}
        <div className="cc-rail cc-s3 cc-m2">
          <Panel title="Client overview" icon={<IconChart size={15} />} sub="All time" bodyClass="tight">
            {b.revenueByService.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>
                No revenue booked yet. This splits by service line as soon as the
                first checkout is paid.
              </p>
            ) : (
              <div className="cc-donut-wrap">
                <Donut
                  slices={b.revenueByService}
                  total={moneyCompact(b.revenueTotalCents)}
                  caption="Total revenue"
                  format={(v) => money(v)}
                />
                <Legend slices={b.revenueByService} format={(v) => money(v)} />
              </div>
            )}
          </Panel>

          <Panel title="Top client locations" icon={<IconGlobe size={15} />} bodyClass="tight">
            {b.locations.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>
                No locations recorded. City and state are on each client&rsquo;s own
                page — fill them in and this map of the book builds itself.
              </p>
            ) : (
              <BarList
                rows={b.locations.map((l) => ({
                  label: l.label,
                  value: l.value,
                  share: l.share,
                  valueLabel: String(l.value),
                }))}
              />
            )}
          </Panel>

          <Panel
            title="Upcoming renewals"
            icon={<IconRepeat size={15} />}
            sub="Next 60 days"
            bodyClass="flush"
          >
            {b.renewals.length === 0 ? (
              <div className="cc-empty" style={{ padding: "16px" }}>
                <span className="cc-empty-text">
                  No renewal dates yet. These come from Stripe when a subscription
                  bills — nothing here is estimated from a start date.
                </span>
              </div>
            ) : (
              <div className="cc-feed">
                {b.renewals.map((r) => (
                  <Link key={r.id} href={r.href} className="cc-feed-item">
                    <span className="cc-feed-main">
                      <span className="cc-feed-title">{r.businessName}</span>
                      <span className="cc-feed-sub">{r.what}</span>
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className="cc-feed-when" style={r.daysAway <= 7 ? { color: "var(--cc-warn)" } : undefined}>
                        {shortDate(r.renewsAt)}
                      </span>
                      <br />
                      <span className="cc-faint" style={{ fontSize: "0.7rem" }}>
                        {money(r.amountCents)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Bottom row ───────────────────────────────────────────── */}
        <Panel
        title="Client health"
        icon={<IconPulse size={15} />}
        className="cc-s3 cc-m3"
        bodyClass="tight"
        >
          <div className="cc-legend">
            {b.healthBreakdown.map((band) => (
              <div key={band.band} className={`cc-legend-row cc-band-${band.band}`}>
                <span className="cc-legend-key" aria-hidden="true" />
                <span className="cc-legend-label">{band.label}</span>
                <span className="cc-legend-value">{band.count}</span>
                <span className="cc-legend-share">({Math.round(band.share * 100)}%)</span>
              </div>
            ))}
          </div>
          <p className="cc-note">
            Scored from unpaid invoices, projects past their date, subscription
            state, silence and the rating the client last gave. Every point
            taken off is named on the client&rsquo;s own page.
          </p>
        </Panel>

        <Panel
          title="Top clients by revenue"
          icon={<IconDollar size={15} />}
          sub="All time"
          className="cc-s3 cc-m4"
          bodyClass="tight"
        >
          {b.topByRevenue.length === 0 ? (
            <p className="cc-note" style={{ marginTop: 0 }}>No revenue booked yet.</p>
          ) : (
            <BarList
              rows={b.topByRevenue.map((c) => ({
                label: c.name,
                value: c.cents,
                share: c.share,
                valueLabel: money(c.cents),
              }))}
              showShare={false}
            />
          )}
        </Panel>

        <Panel
          title="Recent client activity"
          icon={<IconPulse size={15} />}
          className="cc-s3 cc-m5"
          bodyClass="flush"
        >
          {b.activity.length === 0 ? (
            <div className="cc-empty" style={{ padding: 16 }}>
              <span className="cc-empty-text">Nothing has happened on any account yet.</span>
            </div>
          ) : (
            <div className="cc-feed">
              {b.activity.map((a) => (
                <Link key={a.id} href={`/admin/clients/${a.clientId}`} className="cc-feed-item">
                  <span className={`cc-feed-icon m-${a.kind === "revenue" || a.kind === "invoice" ? "finance" : a.kind === "project" ? "project" : "lead"}`}>
                    {a.kind === "project" ? <IconBriefcase size={13} /> : a.kind === "rating" ? <IconStar size={13} /> : a.kind === "won" ? <IconUsers size={13} /> : <IconDollar size={13} />}
                  </span>
                  <span className="cc-feed-main">
                    <span className="cc-feed-title">{a.client}</span>
                    <span className="cc-feed-sub">{a.title}</span>
                  </span>
                  <span className="cc-feed-when">{ago(a.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Client satisfaction"
          icon={<IconStar size={15} />}
          sub={b.satisfaction.responses > 0 ? `${b.satisfaction.responses} rated` : undefined}
          className="cc-s3 cc-m6"
          bodyClass="tight"
        >
          {b.satisfaction.average === null ? (
            <EmptyState
              title="Nobody has been asked yet"
              text="Record a rating from a client's own page — after a launch, at the 30-day check-in, or any time it comes up. Each one is dated, so this stays a measurement rather than an impression."
              icon={<IconStar size={17} />}
            />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: "1.7rem", fontWeight: 620, letterSpacing: "-0.03em" }}>
                  {b.satisfaction.average.toFixed(1)}
                </span>
                <span className="cc-faint" style={{ fontSize: "0.8rem" }}>/ 5</span>
                <Stars rating={Math.round(b.satisfaction.average)} size={14} />
              </div>

              <BarList
                rows={b.satisfaction.counts.map((c) => ({
                  label: `${c.rating} star${c.rating === 1 ? "" : "s"}`,
                  value: c.count,
                  share: c.share,
                  valueLabel: String(c.count),
                }))}
              />

              <p className="cc-note">
                One score per client — their most recent. A client rated five
                times does not outvote the rest.
              </p>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

function Row({ row }: { row: ClientRow }) {
  const status = STATUS_CHIP[row.status] ?? STATUS_CHIP.active;

  return (
    <tr>
      <td>
        <Link href={row.href} className="cc-client">
          <span className="cc-mono">{initials(row.businessName)}</span>
          <span className="cc-client-text">
            <span className="cc-client-name">{row.businessName}</span>
            <span className="cc-client-sub">
              {row.businessType ?? [row.city, row.state].filter(Boolean).join(", ") ?? "—"}
            </span>
          </span>
        </Link>
      </td>

      <td>
        <span className="cc-client-text">
          <span className="cc-client-name" style={{ fontWeight: 400 }}>
            {row.contactName ?? row.email}
          </span>
          <span className="cc-client-sub">{row.phone ?? row.email}</span>
        </span>
      </td>

      <td>
        {row.services.length === 0 ? (
          <span className="cc-faint">—</span>
        ) : (
          <span className="cc-pips">
            {row.services.slice(0, 5).map((s, i) => (
              <span
                key={s.key}
                className={`cc-pip-dot cc-cat-${(i % 8) + 1}`}
                title={s.label}
              />
            ))}
            {row.services.length > 5 ? (
              <span className="cc-pips-more">+{row.services.length - 5}</span>
            ) : null}
          </span>
        )}
      </td>

      <td className="num">
        {row.projectCount === 0 ? "—" : row.projectCount}
        {row.activeProjectCount > 0 ? (
          <span className="cc-faint" style={{ fontSize: "0.7rem" }}> ({row.activeProjectCount} open)</span>
        ) : null}
      </td>

      <td className="num cc-strong">{row.lifetimeCents > 0 ? money(row.lifetimeCents) : "—"}</td>

      <td><span className={`cc-chip ${status.tone}`}>{status.label}</span></td>

      <td>
        <HealthRing
          score={row.health.score}
          band={row.health.band}
          untested={row.health.untested}
        />
      </td>

      <td><Stars rating={row.latestRating} /></td>

      <td>{row.owner ?? <span className="cc-faint">unassigned</span>}</td>

      <td>{row.lastActivityAt ? ago(row.lastActivityAt) : <span className="cc-faint">—</span>}</td>

      <td>
        <Link href={`${row.href}/edit`} className="cc-btn" aria-label={`Edit ${row.businessName}`}>
          <IconPen size={12} /> Edit
        </Link>
      </td>
    </tr>
  );
}

export function ClientsBoardSkeleton() {
  return (
    <>
      <div className="cc-kpis" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cc-kpi">
            <div className="cc-skel cc-skel-line w-60" style={{ height: 10 }} />
            <div className="cc-skel" style={{ height: 26, width: "70%" }} />
            <div className="cc-skel cc-skel-line w-80" style={{ height: 9 }} />
          </div>
        ))}
      </div>
      <div className="cc-board">
        <section className="cc-panel cc-s8">
          <div className="cc-skel-stack">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`cc-skel cc-skel-line ${i % 2 ? "w-100" : "w-80"}`} />
            ))}
          </div>
        </section>
        <section className="cc-panel cc-s4">
          <div className="cc-skel-stack">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cc-skel cc-skel-line w-100" />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
