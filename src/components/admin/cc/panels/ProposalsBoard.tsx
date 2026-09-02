import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadProposalWorkspace, type ProposalFilters } from "@/lib/proposals/queries";
import { proposalUrl } from "@/lib/proposals/service";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/proposals/config";
import { duplicateProposalAction } from "@/app/admin/proposal-actions";
import ProposalFiltersBar from "../ProposalFilters";
import CopyLink from "../CopyLink";
import { EmptyState, PanelSkeleton } from "../Panel";
import { DASH, money, shortDate } from "../format";
import {
  IconCheck, IconDollar, IconFile, IconInbox,
  IconPen, IconSend, IconAlert, IconSearch,
} from "../Icons";

/**
 * The proposal list.
 *
 * The summary cards count EVERYTHING, deliberately, while the table below
 * respects the filters. A card that changed when you filtered would be
 * answering a different question from the one it is labelled with.
 */

export async function ProposalsBoardSkeleton() {
  return <PanelSkeleton title="Proposals" rows={8} />;
}

export default async function ProposalsBoard({
  filters,
}: {
  filters: ProposalFilters;
}) {
  const supabase = await createSupabaseServerClient();

  let board: Awaited<ReturnType<typeof loadProposalWorkspace>>;
  try {
    board = await loadProposalWorkspace(supabase, filters);
  } catch (err) {
    return (
      <div className="cc-error">
        <IconAlert size={15} />
        <span>{err instanceof Error ? err.message : "Proposals could not be loaded."}</span>
      </div>
    );
  }

  const cards = [
    { label: "Draft", value: board.summary.draft, foot: "Written, not sent", icon: IconInbox },
    { label: "Sent", value: board.summary.sent, foot: "Delivered, not opened", icon: IconSend },
    { label: "Viewed", value: board.summary.viewed, foot: "Client has read it", icon: IconSearch },
    { label: "Awaiting signature", value: board.summary.awaiting_signature, foot: "Accepted, not signed", icon: IconPen },
    { label: "Awaiting payment", value: board.summary.awaiting_payment, foot: "Signed, money not in", icon: IconDollar },
    { label: "Accepted", value: board.summary.accepted, foot: "Agreed on paper", icon: IconCheck },
    { label: "Paid", value: board.summary.paid, foot: "Payment recorded", icon: IconCheck },
    { label: "Expired", value: board.summary.expired, foot: "Past its valid-until date", icon: IconAlert },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Proposals</h1>
          <p>
            Scope, price, agreement, signature and payment — one document per
            sale, from the first draft to the project it becomes.
          </p>
        </div>
        <Link href="/admin/proposals/new" className="cc-btn primary">
          <IconFile size={14} /> New proposal
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
            <h2>All proposals</h2>
            <span className="cc-sub">
              {board.openValueCents > 0
                ? `${money(board.openValueCents)} still open · ${money(board.wonValueCents)} closed`
                : "Nothing open right now"}
            </span>
          </div>

          <div className="cc-panel-body">
            <ProposalFiltersBar owners={board.owners} packages={board.packages} />
          </div>

          {board.rows.length === 0 ? (
            <div className="cc-panel-body">
              <EmptyState
                title={board.total === 0 ? "No proposals yet" : "Nothing matches those filters"}
                text={
                  board.total === 0
                    ? "Start one from a lead, a client, or from scratch. The package templates fill in the scope and the pricing for you."
                    : "Clear the filters to see the whole list again."
                }
                cta={{ href: "/admin/proposals/new", label: "Write a proposal" }}
                icon={<IconFile size={17} />}
              />
            </div>
          ) : (
            <>
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Proposal</th>
                      <th>Client</th>
                      <th>Project / package</th>
                      <th className="num">One-time</th>
                      <th className="num">Monthly</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Viewed</th>
                      <th>Expires</th>
                      <th>Owner</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/admin/proposals/${row.id}`} className="cc-strong">
                            {row.number}
                          </Link>
                          {row.kind === "change_order" ? (
                            <>
                              <br />
                              <span className="cc-chip t-info">Change order</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <span className="cc-client-name">{row.clientName}</span>
                          {row.clientEmail ? (
                            <>
                              <br />
                              <span className="cc-client-sub">{row.clientEmail}</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          {row.title}
                          {row.packageName ? (
                            <>
                              <br />
                              <span className="cc-client-sub">{row.packageName}</span>
                            </>
                          ) : null}
                        </td>
                        <td className="num">{row.oneTimeCents > 0 ? money(row.oneTimeCents) : DASH}</td>
                        <td className="num">
                          {row.recurringCents > 0 ? `${money(row.recurringCents)}/${row.recurringInterval === "year" ? "yr" : "mo"}` : DASH}
                        </td>
                        <td>
                          <span className={`cc-chip ${STATUS_TONE[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                          {row.staleExpired && row.status !== "expired" ? (
                            <>
                              {" "}
                              <span className="cc-chip t-risk">Past date</span>
                            </>
                          ) : null}
                        </td>
                        <td>{shortDate(row.sentAt)}</td>
                        <td>{shortDate(row.viewedAt)}</td>
                        <td>{row.validUntil ? shortDate(`${row.validUntil}T12:00:00Z`) : DASH}</td>
                        <td>{row.owner ?? DASH}</td>
                        <td>
                          <div className="cc-rowacts">
                            <Link href={`/admin/proposals/${row.id}`} className="cc-btn">View</Link>
                            {row.signedAt ? null : (
                              <Link href={`/admin/proposals/${row.id}/edit`} className="cc-btn">Edit</Link>
                            )}
                            <Link href={`/admin/proposals/${row.id}/preview`} className="cc-btn">Preview</Link>
                            <CopyLink url={proposalUrl(row.publicToken)} label="Link" />
                            <form action={duplicateProposalAction}>
                              <input type="hidden" name="proposal_id" value={row.id} />
                              <button type="submit" className="cc-btn">Duplicate</button>
                            </form>
                            {row.jobId ? (
                              <Link href={`/admin/jobs/${row.jobId}`} className="cc-btn">Project</Link>
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
