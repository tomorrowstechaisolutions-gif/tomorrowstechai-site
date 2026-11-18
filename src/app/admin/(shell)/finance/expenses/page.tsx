import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RANGE_LABELS, type RangeKey } from "@/lib/finance/overview";
import { loadExpenses, type ExpensesBoard, type ReviewItem } from "@/lib/finance/expenses";
import { BUSINESSES, CATEGORY_LABEL, EXPENSE_CATEGORIES } from "@/lib/finance/receipts";
import { Panel, EmptyState, ErrorState } from "@/components/admin/cc/Panel";
import { BarList } from "@/components/admin/cc/Viz";
import { money } from "@/components/admin/cc/format";
import { IconAlert, IconCart, IconChart, IconDollar, IconFile } from "@/components/admin/cc/Icons";
import ReceiptCapture from "@/components/admin/cc/finance/ReceiptCapture";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/finance/receipts.module.css";
import { addExpenseAction, confirmExpenseAction, deleteExpenseAction, markReimbursedAction } from "@/app/admin/expense-actions";
import { chicagoDate } from "@/lib/time/chicago";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Expenses" };

/**
 * Expenses. Scan or upload receipts, confirm what the AI read, and see what
 * the business spent — Mercury charges plus anything paid out of pocket,
 * never counted twice — and what it owes John back.
 */

const RANGES = Object.keys(RANGE_LABELS) as RangeKey[];
const day = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";
const dollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = typeof params.range === "string" ? params.range : "mtd";
  const range: RangeKey = RANGES.includes(raw as RangeKey) ? (raw as RangeKey) : "mtd";

  let data: ExpensesBoard | null = null;
  let error: string | null = null;
  try {
    data = await loadExpenses(await createSupabaseServerClient(), range);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Expenses could not be loaded.";
  }

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Expenses</h1>
          <p>Scan a receipt, confirm what was read, and see what each business spent.</p>
        </div>
        <div className="cc-tabs" role="group" aria-label="Date range" style={{ marginLeft: "auto", borderBottom: 0 }}>
          {RANGES.map((k) => (
            <Link key={k} href={`/admin/finance/expenses?range=${k}`} className={`cc-tab ${k === range ? "is-on" : ""}`} aria-current={k === range ? "page" : undefined}>
              {RANGE_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>
      {typeof params.notice === "string" ? <div className={fin.flashOk}>{params.notice}</div> : null}
      {typeof params.error === "string" ? <div className={fin.flashErr}>{params.error}</div> : null}
      {error || !data ? <ErrorState message={error ?? "Expenses could not be loaded."} /> : <Board d={data} />}
    </>
  );
}

function Board({ d }: { d: ExpensesBoard }) {
  const kpis: Array<{ label: string; value: string; foot: ReactNode; warn?: boolean }> = [
    { label: "Spent", value: money(d.spentCents, { cents: true }), foot: RANGE_LABELS[d.range] },
    { label: "Paid personally", value: money(d.personalCents, { cents: true }), foot: "Out of pocket, this period" },
    { label: "Business owes you", value: money(d.owedTotalCents, { cents: true }), foot: d.owedTotalCents ? "Not paid back yet" : "All squared up", warn: d.owedTotalCents > 0 },
    { label: "To review", value: String(d.reviewCount), foot: d.reviewCount ? "Receipts waiting below" : "Nothing waiting", warn: d.reviewCount > 0 },
    { label: "Missing receipts", value: String(d.missingReceipts), foot: d.bankMode ? "Mercury charges without one" : "Connect Mercury to track", warn: d.missingReceipts > 0 },
  ];
  const catTotal = d.byCategory.reduce((t, r) => t + r.cents, 0);

  return (
    <>
      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value" style={k.warn ? { color: "#FBBF24" } : undefined}>{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Add receipts" sub="Camera on your phone, files on your computer" icon={<IconFile size={15} />} className="cc-s8">
          <ReceiptCapture />
        </Panel>

        <Panel title="Business owes you" sub={money(d.owedTotalCents, { cents: true })} icon={<IconDollar size={15} />} className="cc-s4">
          {d.owed.length ? (
            <div>
              {d.owed.map((o) => (
                <div key={o.business} className={styles.owedRow}>
                  <div><b>{BUSINESSES[o.business]}</b><small>{o.count} out-of-pocket expense{o.count === 1 ? "" : "s"}</small></div>
                  <span className={fin.amount}>{money(o.cents, { cents: true })}</span>
                  <form action={markReimbursedAction}>
                    <input type="hidden" name="business" value={o.business} />
                    <input type="hidden" name="range" value={d.range} />
                    <button className={fin.btnSmall}>Paid back</button>
                  </form>
                </div>
              ))}
              <p className={fin.note}>When the business pays you back (a transfer from Mercury to your personal account), press <b>Paid back</b> to clear it.</p>
            </div>
          ) : <EmptyState title="Nothing owed" text="Business purchases you pay for with a personal card add up here until the business pays you back." />}
        </Panel>

        {d.review.length ? (
          <Panel title="Review receipts" sub={`${d.review.length} waiting · nothing counts until you confirm`} icon={<IconAlert size={15} />} className="cc-s12">
            <div className={styles.queue}>{d.review.map((r) => <ReviewCard key={r.id} r={r} range={d.range} />)}</div>
          </Panel>
        ) : null}

        <Panel title="Expenses" sub={`${d.rows.length} · ${RANGE_LABELS[d.range]}`} icon={<IconCart size={15} />} className="cc-s8">
          {d.rows.length ? (
            <div className="cc-scroll">
              <table className="cc-table dense">
                <thead>
                  <tr><th>Date</th><th>Vendor</th><th>Category</th><th>Business</th><th>Paid with</th><th className="num">Amount</th><th>Receipt</th></tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.key} style={r.counts ? undefined : { opacity: 0.6 }}>
                      <td className="cc-dim">{day(r.date)}</td>
                      <td>
                        <span className="cc-strong">{r.vendor}</span>
                        {r.description ? <span className="cc-client-sub">{r.description}</span> : null}
                        {!r.counts ? <span className="cc-client-sub">Waiting for the Mercury charge to post</span> : null}
                      </td>
                      <td className="cc-dim">{r.category}</td>
                      <td>{r.business ? <span className={`cc-chip ${r.business === "ttai" ? "t-info" : "t-warn"}`}>{r.business === "ttai" ? "TTAI" : "Tomorrowstek"}</span> : <span className="cc-dim">—</span>}</td>
                      <td>
                        {r.paidWith === "business"
                          ? r.bankLink ? <a className="cc-link" href={r.bankLink} target="_blank" rel="noreferrer">Mercury ↗</a> : <span className="cc-dim">Mercury</span>
                          : <span className={`cc-chip ${r.reimbursedOn ? "t-muted" : "t-warn"}`}>{r.reimbursedOn ? "Personal · paid back" : "Personal"}</span>}
                      </td>
                      <td className="num cc-strong">{money(r.amountCents, { cents: true })}</td>
                      <td>
                        {r.hasReceipt && r.expenseId
                          ? <a className="cc-link" href={`/admin/finance/expenses/receipt/${r.expenseId}`} target="_blank" rel="noreferrer">View</a>
                          : r.bankId ? <ReceiptCapture compact bankTransactionId={r.bankId} /> : <span className="cc-dim">—</span>}
                        {r.expenseId && !r.bankId ? (
                          <form action={deleteExpenseAction} style={{ display: "inline", marginLeft: 8 }}>
                            <input type="hidden" name="id" value={r.expenseId} />
                            <input type="hidden" name="range" value={d.range} />
                            <button className={fin.btnSmall} aria-label={`Delete ${r.vendor}`}>✕</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No expenses in this period" text="Scan or upload a receipt above, or pick a longer range." />}
        </Panel>

        <Panel title="By category" sub={RANGE_LABELS[d.range]} icon={<IconChart size={15} />} className="cc-s4">
          {d.byCategory.length
            ? <BarList rows={d.byCategory.map((r) => ({ label: r.label, value: r.cents, share: catTotal ? r.cents / catTotal : 0, valueLabel: money(r.cents, { cents: true }) }))} color="#E84D8A" />
            : <EmptyState title="Nothing yet" text="Spending by category shows here." />}
          {d.byBusiness.length ? (
            <p className={fin.note}>
              {d.byBusiness.map((b) => <span key={b.business}><b>{BUSINESSES[b.business]}</b> {money(b.cents, { cents: true })}<br /></span>)}
            </p>
          ) : null}
        </Panel>

        <Panel title="Add one without a receipt" sub="Cash, a lost slip" icon={<IconCart size={15} />} className="cc-s8">
          <ExpenseFields action={addExpenseAction} range={d.range} submit="Add expense" />
        </Panel>

        <Panel title="How this works" icon={<IconAlert size={15} />} className="cc-s4">
          <p className={fin.note} style={{ marginTop: 0 }}>
            <b>Receipts</b> are read automatically: vendor, date, total, tax, items and a suggested category. Nothing counts until you confirm it.<br />
            <b>Paid with Mercury</b>: the bank charge is the record. The receipt attaches to it, so nothing is counted twice. If the charge hasn&apos;t posted yet, it&apos;s matched when you confirm, or it shows greyed out until it does.<br />
            <b>Paid personally</b>: counts as a business expense and adds to what the business owes you, until you mark it paid back.<br />
            <b>Same Amazon order twice</b> (the email and the invoice PDF) is caught by order number and kept once.<br />
            Receipts are stored privately and open through links that expire after 10 minutes.
          </p>
        </Panel>
      </div>
    </>
  );
}

function ReviewCard({ r, range }: { r: ReviewItem; range: RangeKey }) {
  const src = `/admin/finance/expenses/receipt/${r.id}`;
  return (
    <div className={styles.card}>
      <a className={styles.thumb} href={src} target="_blank" rel="noreferrer">
        {r.receiptMime?.startsWith("image/") && !r.receiptMime.includes("hei")
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={`Receipt ${r.receiptName ?? ""}`} />
          : <span className={styles.pdf}>{r.receiptName ?? "Receipt"}<br />Open ↗</span>}
      </a>
      <form action={confirmExpenseAction} className={styles.form}>
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="range" value={range} />
        <label className={styles.wide}>Vendor<input name="vendor" defaultValue={r.vendor ?? ""} placeholder="Amazon" /></label>
        <label>Date<input name="date" type="date" defaultValue={r.date} required /></label>
        <label>Total $<input name="amount" inputMode="decimal" defaultValue={dollars(r.amountCents)} required /></label>
        <label className={styles.wide}>What was it<input name="description" defaultValue={r.description ?? ""} /></label>
        <label>Tax $<input name="tax" inputMode="decimal" defaultValue={dollars(r.taxCents)} /></label>
        <label>Category
          <select name="category" defaultValue={r.category}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label>Business
          <select name="business" defaultValue={r.business}>
            {Object.entries(BUSINESSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Paid with
          <select name="paid_with" defaultValue={r.paidWith}>
            <option value="personal">Personal card</option>
            <option value="business">Mercury</option>
          </select>
        </label>
        <label className={styles.wide}>Mercury charge
          <select name="bank_transaction_id" defaultValue={r.bankId ?? ""}>
            <option value="">{r.candidates.length ? "Not linked" : "No matching charge yet"}</option>
            {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className={styles.full}>Notes<input name="notes" defaultValue={r.notes ?? ""} /></label>
        {r.items.length ? (
          <ul className={styles.items}>
            {r.items.slice(0, 8).map((it, i) => <li key={i}>{it.quantity > 1 ? `${it.quantity} × ` : ""}{it.name}{it.amount_cents != null ? ` · $${dollars(it.amount_cents)}` : ""}</li>)}
          </ul>
        ) : null}
        <p className={styles.meta}>
          {r.readError ? <span className={styles.warn}>Couldn&apos;t read this one automatically. Fill it in from the receipt. </span>
            : r.confidence && r.confidence !== "high" ? <span className={styles.warn}>Read with {r.confidence} confidence. Check the total. </span>
            : <>Read automatically. Check it and confirm. </>}
        </p>
        <div className={styles.actions}>
          <button className={styles.confirm}>Confirm</button>
          <button className={styles.delete} formAction={deleteExpenseAction}>Delete</button>
        </div>
      </form>
    </div>
  );
}

function ExpenseFields({ action, range, submit }: { action: (fd: FormData) => Promise<void>; range: RangeKey; submit: string }) {
  return (
    <form action={action} className={styles.addForm}>
      <input type="hidden" name="range" value={range} />
      <label>Vendor<input name="vendor" required /></label>
      <label>Date<input name="date" type="date" defaultValue={chicagoDate()} required /></label>
      <label>Total $<input name="amount" inputMode="decimal" required /></label>
      <label>Category
        <select name="category" defaultValue="supplies">
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </label>
      <label style={{ gridColumn: "span 2" }}>What was it<input name="description" /></label>
      <label>Business
        <select name="business" defaultValue="ttai">
          {Object.entries(BUSINESSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>Paid with
        <select name="paid_with" defaultValue="personal">
          <option value="personal">Personal card</option>
          <option value="business">Mercury</option>
        </select>
      </label>
      <div style={{ gridColumn: "1 / -1" }}><button className={styles.confirm}>{submit}</button></div>
    </form>
  );
}
