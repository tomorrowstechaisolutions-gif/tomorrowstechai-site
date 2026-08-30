import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFinance } from "@/lib/dashboard/finance";
import { panel } from "@/lib/dashboard/panel";
import { Panel, EmptyState, ErrorState } from "../Panel";
import MiniBars from "../MiniBars";
import { IconDollar } from "../Icons";
import { ago, deltaParts, money, shortDate } from "../format";

/** Section 9 — the financial snapshot. */

export default async function FinancePanel({ className = "" }: { className?: string }) {
  const supabase = await createSupabaseServerClient();
  const result = await panel("finance", () => loadFinance(supabase));

  if (!result.ok) {
    return (
      <Panel title="Financial snapshot" icon={<IconDollar size={15} />} className={className} bodyClass="flush">
        <ErrorState message={result.error} />
      </Panel>
    );
  }

  const f = result.data;
  const delta = deltaParts(f.revenueDelta);
  const nothingYet =
    f.revenueCents === 0 && f.mrrCents === 0 && f.outstandingCents === 0 && f.expensesCents === 0;

  return (
    <Panel
      title="Financial snapshot"
      icon={<IconDollar size={15} />}
      sub="This month"
      action={{ href: "/admin/finance", label: "Finance" }}
      className={className}
      bodyClass="flush"
    >
      {nothingYet ? (
        <EmptyState
          title="No money has moved this month"
          text="Revenue books itself when a Stripe checkout is paid, and recurring revenue comes from each active client's monthly figure."
          cta={{ href: "/admin/leads", label: "Send a checkout link" }}
          icon={<IconDollar size={17} />}
        />
      ) : (
        <>
          <div className="cc-stats">
            <div className="cc-stat">
              <div className="cc-stat-label">Revenue</div>
              <div className="cc-stat-value">{money(f.revenueCents)}</div>
              {delta ? (
                <div className={`cc-delta ${delta.tone}`} style={{ marginTop: 2 }}>
                  {delta.text} <span className="cc-faint" style={{ fontWeight: 400 }}>vs last month</span>
                </div>
              ) : null}
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">MRR</div>
              <div className="cc-stat-value">{money(f.mrrCents)}</div>
              <div className="cc-stat-hint">recurring</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Outstanding</div>
              <div className={`cc-stat-value ${f.outstandingCents > 0 ? "t-risk" : ""}`}>
                {money(f.outstandingCents)}
              </div>
              <div className="cc-stat-hint">
                {f.outstandingCount} unpaid link{f.outstandingCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Costs</div>
              <div className="cc-stat-value">{money(f.expensesCents + f.adSpendCents)}</div>
              <div className="cc-stat-hint">incl. {money(f.adSpendCents)} ads</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Net</div>
              <div className={`cc-stat-value ${f.netCents >= 0 ? "t-ok" : "t-risk"}`}>
                {money(f.netCents)}
              </div>
              <div className="cc-stat-hint">revenue less costs</div>
            </div>
            <div className="cc-stat">
              <div className="cc-stat-label">Projected</div>
              <div className={`cc-stat-value ${f.projectedCents === null ? "t-none" : ""}`}>
                {f.projectedCents === null ? "too early" : money(f.projectedCents)}
              </div>
              <div className="cc-stat-hint">month end, straight line</div>
            </div>
          </div>

          <div className="cc-panel-body tight">
            <MiniBars
              points={f.series.map((s) => ({ key: s.date, value: s.cents }))}
              labelLeft={shortDate(`${f.series[0]?.date}T12:00:00Z`)}
              labelRight={shortDate(`${f.series[f.series.length - 1]?.date}T12:00:00Z`)}
              format={(v, k) => `${shortDate(`${k}T12:00:00Z`)}: ${money(v)}`}
            />
          </div>

          {f.needsAttention.length > 0 ? (
            <>
              <div className="cc-panel-head" style={{ borderTop: "1px solid var(--cc-line-soft)" }}>
                <h2>Invoices needing attention</h2>
              </div>
              <div className="cc-feed">
                {f.needsAttention.map((inv) => (
                  <Link key={inv.id} href={inv.href} className="cc-feed-item">
                    <span className="cc-feed-main">
                      <span className="cc-feed-title">{inv.label}</span>
                      <span className="cc-feed-sub">
                        {inv.expired ? "Checkout link has expired" : `Sent ${inv.daysOut} days ago`}
                      </span>
                    </span>
                    <span className="cc-feed-when" style={inv.expired ? { color: "var(--cc-risk)" } : undefined}>
                      {money(inv.amountCents)}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          {f.transactions.length > 0 ? (
            <>
              <div className="cc-panel-head" style={{ borderTop: "1px solid var(--cc-line-soft)" }}>
                <h2>Recent transactions</h2>
              </div>
              <div className="cc-feed">
                {f.transactions.map((t) => (
                  <Link key={t.id} href={t.href} className="cc-feed-item">
                    <span className="cc-feed-main">
                      <span className="cc-feed-title">{t.label}</span>
                      <span className="cc-feed-sub">
                        {t.sublabel} · {ago(t.at)}
                      </span>
                    </span>
                    <span
                      className="cc-feed-when"
                      style={{ color: t.direction === "in" ? "var(--cc-ok)" : "var(--cc-dim)" }}
                    >
                      {t.direction === "in" ? "+" : "−"}
                      {money(t.amountCents)}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}
