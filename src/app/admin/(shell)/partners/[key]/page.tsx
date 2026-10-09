import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getPartner, partnerOverview } from "@/lib/partners/queries";
import { partnerKeyConfigured } from "@/lib/partners/client";
import {
  FEE_BASIS_LABELS, PARTNER_CAMPAIGN_STATUSES, RELATIONSHIP_LABELS,
  SETTLEMENT_LABELS, SETTLEMENT_STATUS_TONE, money, splitSale,
} from "@/lib/partners/config";
import {
  markSettlementPaidAction, pushOrderStatusAction, raisePartnerTaskAction,
  recordSettlementAction, syncPartnerAction,
} from "@/app/admin/partner-actions";
import PartnerActionForm from "@/components/admin/cc/partners/PartnerActionForm";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import { DASH } from "@/components/admin/cc/format";
import { IconBriefcase, IconDollar } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner" };

function when(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function day(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
}

export default async function PartnerPage({ params }: { params: Promise<{ key: string }> }) {
  if (!(await getAdminUser())) redirect("/admin/login");
  const { key } = await params;
  const supabase = await createSupabaseServerClient();
  const partner = await getPartner(supabase, key);
  if (!partner) notFound();

  const o = await partnerOverview(supabase, partner);
  const keyReady = partnerKeyConfigured(partner);
  const example = splitSale(50_000, 1_480, partner.our_share_pct);
  const liveOrders = o.orders.filter((x) => !x.removed_at);

  const checklist = [
    { done: Boolean(o.client), label: "Client record and billing details" },
    { done: o.invoices.some((i) => i.recurring_cents > 0), label: "$29/month management on a recurring invoice" },
    { done: keyReady, label: `API key set in Vercel (${partner.api_key_env ?? "—"})` },
    { done: partner.last_sync_ok === true, label: "First successful sync of work orders" },
    { done: o.orders.some((x) => x.campaigns.length > 0), label: `${partner.name}'s feed includes campaign ids (status push-back)` },
    { done: o.settlements.some((s) => s.source !== "manual"), label: "Automatic settlements (Stripe Connect split on sale)" },
    { done: Boolean(partner.agreement_signed_on), label: "Written partnership agreement on file" },
  ];

  return (
    <>
      <header className="cc-greet cf-head">
        <div>
          <p className="cf-crumb"><Link href="/admin/partners">Partners</Link> / {partner.name}</p>
          <h1>{partner.name}</h1>
          <p>{partner.relationship.map((r) => RELATIONSHIP_LABELS[r] ?? r).join(" · ")}</p>
        </div>
        <div className="cf-head-right">
          <span className={`cf-zoom ${partner.last_sync_ok ? "is-on" : "is-off"}`}>
            <span className="cf-zoom-dot" aria-hidden="true" />
            {partner.last_sync_at
              ? <>Last sync {when(partner.last_sync_at)}{partner.last_sync_ok ? ` · ${partner.last_sync_count ?? 0} orders` : " · failed"}</>
              : "Never synced"}
          </span>
          <PartnerActionForm action={syncPartnerAction} submitLabel="Sync now" pendingLabel="Syncing…" buttonClass="cc-btn primary">
            <input type="hidden" name="partner_key" value={partner.partner_key} />
          </PartnerActionForm>
        </div>
      </header>

      {partner.last_sync_error ? (
        <p className="cc-error cf-err" role="alert">Last sync: {partner.last_sync_error}</p>
      ) : null}

      {/* ── The three relationships ─────────────────────────────── */}
      <div className="pc-cards">
        <section className="pc-card">
          <h3>Client</h3>
          {o.client ? (
            <>
              <p className="pc-big">{money(o.client.mrrCents)}<span>/month</span></p>
              <p>Website &amp; backend management for <Link href={`/admin/clients/${o.client.id}`}>{o.client.name}</Link></p>
              <p className="cc-faint">{o.client.email}</p>
              {o.website ? <p className="cc-faint">Site: <Link href="/admin/websites">{o.website.domain ?? o.website.name}</Link></p> : null}
              {o.invoices.map((i) => (
                <p key={i.id} className="cc-faint">
                  <Link href={`/admin/invoices/${i.id}`}>{i.invoice_number}</Link> · {i.status}
                  {i.recurring_cents ? ` · ${money(i.recurring_cents)}/mo` : ""}
                </p>
              ))}
            </>
          ) : <p className="cc-faint">No client record linked.</p>}
        </section>

        <section className="pc-card">
          <h3>White-label work</h3>
          <p className="pc-big">{liveOrders.length}<span> work order{liveOrders.length === 1 ? "" : "s"}</span></p>
          <p>Marketing {partner.name} sells to its authors, fulfilled by you under {partner.name}&rsquo;s brand.</p>
          <p className="cc-faint">Authors&rsquo; contact details never leave {partner.name}. Anything for an author goes through {partner.name}.</p>
        </section>

        <section className="pc-card">
          <h3>Revenue share</h3>
          <p className="pc-big">{money(o.totals.monthOurCents)}<span> your share this month</span></p>
          <p><b>{partner.our_share_pct}%</b> to Tomorrow&rsquo;s Tech AI / <b>{(100 - partner.our_share_pct).toFixed(0)}%</b> to {partner.name}, {FEE_BASIS_LABELS[partner.fee_basis]}.</p>
          <p className="cc-faint">{SETTLEMENT_LABELS[partner.settlement_method]}. Example: a $500.00 sale with a $14.80 fee → you {money(example.ourCents)}, {partner.name} {money(example.theirCents)}.</p>
        </section>
      </div>

      {/* ── Setup ─────────────────────────────────────────────────── */}
      <Panel title="Setup" sub={`${checklist.filter((c) => c.done).length} of ${checklist.length}`} className="cf-panel">
        <ul className="pc-checklist">
          {checklist.map((c) => (
            <li key={c.label} className={c.done ? "is-done" : ""}>
              <span aria-hidden="true">{c.done ? "✓" : "○"}</span> {c.label}
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Work orders ───────────────────────────────────────────── */}
      <Panel title="Work orders" sub={`synced from ${partner.name}`} bodyClass="flush" className="cf-panel">
        {o.orders.length === 0 ? (
          <div className="cc-panel-body">
            <EmptyState
              title="No work orders yet"
              text={keyReady
                ? `When ${partner.name} assigns marketing to Tomorrow's Tech AI it appears here within 15 minutes, and becomes a project.`
                : `Add ${partner.api_key_env} in Vercel, redeploy, then press Sync now.`}
              icon={<IconBriefcase size={17} />}
            />
          </div>
        ) : (
          <div className="mt-tablewrap">
            <table className="mt-table cf-table">
              <thead>
                <tr><th>Order</th><th>For</th><th>Window</th><th>{partner.name} status</th><th>Your project</th><th>Report status</th></tr>
              </thead>
              <tbody>
                {o.orders.map((w) => (
                  <tr key={w.id} className={w.removed_at ? "pc-removed" : ""}>
                    <td data-label="Order">
                      <b className="cc-strong">{w.order_code ?? w.external_id.slice(0, 8)}</b>
                      <span className="cc-sub">{[w.service, w.campaign_type].filter(Boolean).join(" · ") || DASH}</span>
                      {w.removed_at ? <span className="cc-sub">No longer assigned</span> : null}
                    </td>
                    <td data-label="For">
                      {w.book_title ?? DASH}
                      <span className="cc-sub">{w.author_name ?? ""}</span>
                    </td>
                    <td data-label="Window">
                      {w.starts_on ?? "?"} → {w.ends_on ?? "open"}
                      {w.platforms.length ? <span className="cc-sub">{w.platforms.join(", ")}</span> : null}
                    </td>
                    <td data-label="Status"><span className="cc-chip t-info">{w.partner_status ?? DASH}</span></td>
                    <td data-label="Project">
                      {w.job_id ? <Link href={`/admin/jobs/${w.job_id}`}>{w.jobStage ?? "Open"}</Link> : DASH}
                    </td>
                    <td data-label="Report">
                      {w.campaigns.length > 0 && !w.removed_at ? (
                        <PartnerActionForm action={pushOrderStatusAction} submitLabel="Send" className="pc-inline">
                          <input type="hidden" name="partner_key" value={partner.partner_key} />
                          <input type="hidden" name="order_id" value={w.id} />
                          <select name="campaign_id" className="cc-input" defaultValue={w.campaigns[0].id} aria-label="Campaign">
                            {w.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id.slice(0, 8)} ({c.status ?? "?"})</option>)}
                          </select>
                          <select name="status" className="cc-input" defaultValue={w.campaigns[0].status ?? "planning"} aria-label="Status">
                            {PARTNER_CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </PartnerActionForm>
                      ) : <span className="cc-faint">Awaiting campaign ids</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Ledger ────────────────────────────────────────────────── */}
      <Panel title="Revenue share ledger" sub="your share of each sale" className="cf-panel">
        <div className="cf-analytics pc-totals">
          <div className="cf-stat"><span className="cf-stat-label">Sales</span><b className="cf-stat-value">{money(o.totals.salesCents)}</b><span className="cf-stat-note">{o.settlements.length} recorded</span></div>
          <div className="cf-stat"><span className="cf-stat-label">Processing fees</span><b className="cf-stat-value">{money(o.totals.feesCents)}</b><span className="cf-stat-note">taken off the top</span></div>
          <div className="cf-stat"><span className="cf-stat-label">Your share</span><b className="cf-stat-value">{money(o.totals.ourCents)}</b><span className="cf-stat-note">{money(o.totals.paidCents)} paid · {money(o.totals.pendingCents)} pending</span></div>
          <div className="cf-stat"><span className="cf-stat-label">{partner.name} share</span><b className="cf-stat-value">{money(o.totals.theirCents)}</b><span className="cf-stat-note">{(100 - partner.our_share_pct).toFixed(0)}% of net</span></div>
        </div>

        {o.settlements.length === 0 ? (
          <EmptyState
            title="No settlements yet"
            text="Once the Stripe Connect split is live, every sale lands here automatically. Until then, record one by hand below."
            icon={<IconDollar size={17} />}
          />
        ) : (
          <div className="mt-tablewrap">
            <table className="mt-table cf-table">
              <thead><tr><th>Sold</th><th>What</th><th>Sale</th><th>Fee</th><th>Net</th><th>Yours</th><th>{partner.name}</th><th>Status</th></tr></thead>
              <tbody>
                {o.settlements.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Sold">{day(s.sold_at)}</td>
                    <td data-label="What">{s.description ?? s.external_ref}<span className="cc-sub">{s.source === "manual" ? "entered by hand" : "automatic"}</span></td>
                    <td data-label="Sale">{money(s.sale_cents, s.currency)}</td>
                    <td data-label="Fee">{money(s.fee_cents, s.currency)}</td>
                    <td data-label="Net">{money(s.net_cents, s.currency)}</td>
                    <td data-label="Yours"><b>{money(s.our_share_cents - s.reversed_cents, s.currency)}</b><span className="cc-sub">{s.share_pct}%</span></td>
                    <td data-label="Theirs">{money(s.partner_share_cents, s.currency)}</td>
                    <td data-label="Status">
                      <span className={`cc-chip ${SETTLEMENT_STATUS_TONE[s.status]}`}>{s.status.replace("_", " ")}</span>
                      {s.status === "pending" && s.source === "manual" ? (
                        <form action={markSettlementPaidAction} className="pc-inline-form">
                          <input type="hidden" name="partner_key" value={partner.partner_key} />
                          <input type="hidden" name="settlement_id" value={s.id} />
                          <button type="submit" className="cc-btn is-sm">Mark received</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="pc-details">
          <summary>Record a settlement by hand</summary>
          <PartnerActionForm action={recordSettlementAction} submitLabel="Record settlement" resetOnSuccess>
            <input type="hidden" name="partner_key" value={partner.partner_key} />
            <div className="pc-grid4">
              <label className="tk-stack"><span>Sale amount</span><input name="sale" className="cc-input" inputMode="decimal" placeholder="500.00" required /></label>
              <label className="tk-stack"><span>Processing fee</span><input name="fee" className="cc-input" inputMode="decimal" placeholder="14.80" /></label>
              <label className="tk-stack"><span>Your share %</span><input name="share_pct" className="cc-input" inputMode="decimal" defaultValue={String(partner.our_share_pct)} /></label>
              <label className="tk-stack"><span>Sold on</span><input name="sold_on" type="date" className="cc-input" /></label>
            </div>
            <div className="cf-row2">
              <label className="tk-stack"><span>What it was for</span><input name="description" className="cc-input" placeholder="Book launch campaign — author name" /></label>
              <label className="tk-stack"><span>Reference <i>Stripe transfer id or order code — prevents double entry</i></span><input name="reference" className="cc-input" /></label>
            </div>
            {liveOrders.length > 0 ? (
              <label className="tk-stack"><span>Work order</span>
                <select name="order_id" className="cc-input" defaultValue="">
                  <option value="">— none —</option>
                  {liveOrders.map((w) => <option key={w.id} value={w.id}>{w.order_code ?? w.external_id.slice(0, 8)} · {w.book_title ?? w.service ?? ""}</option>)}
                </select>
              </label>
            ) : null}
            <label className="mt-check"><input type="checkbox" name="paid" /><span>Already received — book it as revenue now</span></label>
          </PartnerActionForm>
        </details>
      </Panel>

      {/* ── Talk to their queue ───────────────────────────────────── */}
      <Panel title={`Raise a task with ${partner.name}`} sub="lands in their marketing queue" className="cf-panel">
        <PartnerActionForm action={raisePartnerTaskAction} submitLabel="Raise task" resetOnSuccess>
          <input type="hidden" name="partner_key" value={partner.partner_key} />
          <div className="cf-row2">
            <label className="tk-stack"><span>Title</span><input name="title" className="cc-input" maxLength={200} required placeholder="Need cover art files for the launch campaign" /></label>
            <label className="tk-stack"><span>Detail</span><input name="description" className="cc-input" maxLength={2000} /></label>
          </div>
          {!keyReady ? <p className="mt-tz">Needs {partner.api_key_env} in Vercel first.</p> : null}
        </PartnerActionForm>
      </Panel>

      {partner.terms_notes ? (
        <Panel title="Terms" className="cf-panel"><p className="mt-prose">{partner.terms_notes}</p></Panel>
      ) : null}
    </>
  );
}
