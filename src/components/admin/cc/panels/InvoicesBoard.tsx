import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInvoiceWorkspace, type InvoiceFilters } from "@/lib/invoices/queries";
import { invoiceUrl } from "@/lib/invoices/service";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/invoices/config";
import { duplicateInvoiceAction } from "@/app/admin/invoice-actions";
import InvoiceFiltersBar from "../InvoiceFilters";
import CopyLink from "../CopyLink";
import { EmptyState, PanelSkeleton } from "../Panel";
import { DASH, money, shortDate } from "../format";
import {
  IconAlert, IconCheck, IconDollar, IconFile, IconInbox, IconRepeat, IconSend,
} from "../Icons";

/**
 * The invoice list — the last screen in the sale.
 *
 * The summary cards count EVERYTHING, deliberately, while the table below
 * respects the filters. A card that changed when you filtered would be
 * answering a different question from the one it is labelled with.
 *
 * "Collected" is read from invoice_payments, not from the invoices' asking
 * prices, so it is money that actually arrived by any route — card, cheque,
 * transfer — and not a total of what was hoped for.
 */

export async function InvoicesBoardSkeleton() {
  return <PanelSkeleton title="Invoices" rows={8} />;
}

export default async function InvoicesBoard({ filters }: { filters: InvoiceFilters }) {
  const supabase = await createSupabaseServerClient();

  let board: Awaited<ReturnType<typeof loadInvoiceWorkspace>>;
  try {
    board = await loadInvoiceWorkspace(supabase, filters);
  } catch (err) {
    return (
      <div className="cc-error">
        <IconAlert size={15} />
        <span>{err instanceof Error ? err.message : "Invoices could not be loaded."}</span>
      </div>
    );
  }

  const cards = [
    {
      label: "Outstanding",
      value: board.outstandingCents > 0 ? money(board.outstandingCents) : DASH,
      foot: "Owed on everything sent",
      icon: IconDollar,
    },
    {
      label: "Overdue",
      value: board.overdueCents > 0 ? money(board.overdueCents) : DASH,
      foot: `${board.summary.overdue} past its due date`,
      icon: IconAlert,
    },
    {
      label: "Collected · 30 days",
      value: board.collected30Cents > 0 ? money(board.collected30Cents) : DASH,
      foot: "Money that actually arrived",
      icon: IconCheck,
    },
    {
      label: "Recurring billed",
      value: board.recurringCents > 0 ? `${money(board.recurringCents)}/mo` : DASH,
      foot: "Monthly lines on live invoices",
      icon: IconRepeat,
    },
    { label: "Draft", value: board.summary.draft, foot: "Written, not sent", icon: IconInbox },
    { label: "Sent", value: board.summary.sent, foot: "With the client", icon: IconSend },
    { label: "Part paid", value: board.summary.partial, foot: "Some money in", icon: IconDollar },
    { label: "Paid", value: board.summary.paid, foot: "Settled in full", icon: IconCheck },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Invoices</h1>
          <p>
            The end of the sale. A proposal is what was agreed; this is the
            bill for having done it — the build, the monthly hosting, or both
            on one document.
          </p>
        </div>
        <Link href="/admin/invoices/new" className="cc-btn primary">
          <IconFile size={14} /> New invoice
        </Link>
      </div>

      <div className="cc-kpis">
        {cards.map(({ label, value, foot, icon: Icon }) => (
          <div className="cc-kpi" key={label}>
            <div className="cc-kpi-top">
              <span className="cc-kpi-icon"><Icon size={14} /></span>
              <span className="cc-kpi-label">{label}</span>
            </div>
            <span className="cc-kpi-value">{value}</span>
            <div className="cc-kpi-foot"><span>{foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12 cc-m1">
          <div className="cc-panel-head">
            <IconFile size={15} />
            <h2>All invoices</h2>
            <span className="cc-sub">
              {board.outstandingCents > 0
                ? `${money(board.outstandingCents)} outstanding`
                : "Nothing outstanding"}
            </span>
          </div>

          <div className="cc-panel-body">
            <InvoiceFiltersBar owners={board.owners} />
          </div>

          {board.rows.length === 0 ? (
            <div className="cc-panel-body">
              <EmptyState
                title={board.total === 0 ? "No invoices yet" : "Nothing matches those filters"}
                text={
                  board.total === 0
                    ? "Raise one from a signed proposal — the lines and the price come across already filled in — or write one from scratch for work that never had a proposal."
                    : "Clear the filters to see the whole list again."
                }
                cta={{ href: "/admin/invoices/new", label: "Write an invoice" }}
                icon={<IconFile size={17} />}
              />
            </div>
          ) : (
            <>
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Client</th>
                      <th>For</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Outstanding</th>
                      <th className="num">Monthly</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/admin/invoices/${row.id}`} className="cc-strong">
                            {row.number}
                          </Link>
                          {row.sentMethod === "manual" ? (
                            <>
                              <br />
                              <span className="cc-chip t-muted">Sent by hand</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <span className="cc-client-name">{row.clientName}</span>
                          {row.clientEmail ? (
                            <span className="cc-client-sub">{row.clientEmail}</span>
                          ) : null}
                        </td>
                        <td>
                          <span className="cc-client-name">{row.title}</span>
                          {row.proposalId ? (
                            <span className="cc-client-sub">From a proposal</span>
                          ) : null}
                        </td>
                        <td className="num">{row.totalCents > 0 ? money(row.totalCents) : DASH}</td>
                        <td className="num">{row.paidCents > 0 ? money(row.paidCents) : DASH}</td>
                        <td className="num">
                          {row.outstandingCents > 0 ? money(row.outstandingCents) : DASH}
                        </td>
                        <td className="num">
                          {row.recurringCents > 0
                            ? `${money(row.recurringCents)}/${row.recurringInterval === "year" ? "yr" : "mo"}`
                            : DASH}
                        </td>
                        <td>
                          <span className={`cc-chip ${STATUS_TONE[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                          {row.overdue ? (
                            <>
                              {" "}
                              <span className="cc-chip t-risk">
                                {row.daysLate}d late
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td>{row.issueDate ? shortDate(`${row.issueDate}T12:00:00Z`) : DASH}</td>
                        <td>{row.dueDate ? shortDate(`${row.dueDate}T12:00:00Z`) : DASH}</td>
                        <td>
                          <div className="cc-rowacts">
                            <Link href={`/admin/invoices/${row.id}`} className="cc-btn">View</Link>
                            <Link href={`/admin/invoices/${row.id}/preview`} className="cc-btn">Preview</Link>
                            {row.status === "paid" ? null : (
                              <Link href={`/admin/invoices/${row.id}/edit`} className="cc-btn">Edit</Link>
                            )}
                            <CopyLink url={invoiceUrl(row.publicToken)} label="Link" />
                            <form action={duplicateInvoiceAction}>
                              <input type="hidden" name="invoice_id" value={row.id} />
                              <button type="submit" className="cc-btn">Duplicate</button>
                            </form>
                            {row.proposalId ? (
                              <Link href={`/admin/proposals/${row.proposalId}`} className="cc-btn">
                                Proposal
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cc-panel-foot">
                <span className="cc-faint" style={{ fontSize: "0.73rem" }}>
                  Showing {board.rows.length} of {board.total}
                  {board.rows.length === board.total ? "" : " (filtered)"}
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
