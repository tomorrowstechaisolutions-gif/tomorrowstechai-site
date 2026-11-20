import type { Metadata } from "next";
import Link from "next/link";
import { getPortalViewer } from "@/lib/portal/session";
import { balanceCents, cadence, memberHasReviewed, memberInvoices, memberServices, money, shortDate } from "@/lib/portal/data";
import { reviewUrl } from "@/lib/reviews/emails";
import { markReviewLeftAction } from "../member-actions";
import { InvoiceStatus } from "./parts";

export const metadata: Metadata = { title: "Overview" };

export default async function AccountOverview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const member = (await getPortalViewer())!;
  const [{ welcome }, services, invoices, reviewed, reviewLink] = await Promise.all([
    searchParams, memberServices(member.customerId), memberInvoices(member.customerId), memberHasReviewed(member.customerId), reviewUrl(),
  ]);

  const active = services.filter((s) => s.status === "active");
  const monthly = active.filter((s) => s.billingType === "recurring" && !s.endDate).reduce((sum, s) => sum + s.priceCents / Math.max(1, s.intervalMonths ?? 1), 0);
  const due = invoices.filter((i) => balanceCents(i) > 0);
  const dueTotal = due.reduce((sum, i) => sum + balanceCents(i), 0);
  const nextBill = active.map((s) => s.nextBillingDate).filter((d): d is string => Boolean(d)).sort()[0] ?? null;

  return (
    <>
      {welcome ? <p className="acct-msg ok">Your password is set. You&rsquo;re signed in.</p> : null}
      <div className="acct-stats">
        <div className="acct-stat">
          <span>Active services</span>
          <strong>{active.length}</strong>
          <small>{monthly ? `${money(monthly)}/mo` : "No recurring charges"}</small>
        </div>
        <div className={`acct-stat${dueTotal ? " is-due" : ""}`}>
          <span>Balance due</span>
          <strong>{money(dueTotal)}</strong>
          <small>{due.length ? `${due.length} open invoice${due.length === 1 ? "" : "s"}` : "You're all paid up"}</small>
        </div>
        <div className="acct-stat">
          <span>Next billing date</span>
          <strong>{shortDate(nextBill)}</strong>
          <small>{nextBill ? "For your recurring services" : "Nothing scheduled"}</small>
        </div>
      </div>

      {due.length ? (
        <section className="acct-section">
          <h2>Ready to pay</h2>
          <ul className="acct-list">
            {due.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.title}</strong>
                  <span className="acct-faint">{i.number} · due {shortDate(i.dueDate)}</span>
                </div>
                <div className="acct-list-end">
                  <span className="acct-amount">{money(balanceCents(i))}</span>
                  {i.url ? <a className="acct-btn small" href={i.url}>Pay now</a> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Shown until the client has left a review; see memberHasReviewed. */}
      {!reviewed ? (
        <section className="acct-section">
          <h2>Happy with the work?</h2>
          <ul className="acct-list">
            <li>
              <div>
                <strong>Leave us a Google review</strong>
                <span className="acct-faint">It takes about a minute. An honest sentence or two is plenty, and it helps other local businesses find us.</span>
              </div>
              <div className="acct-list-end">
                <a className="acct-btn small" href={reviewLink} target="_blank" rel="noopener noreferrer">Leave a review</a>
                <form action={markReviewLeftAction} className="acct-inline-form">
                  <button className="acct-link-btn" disabled={member.preview} title={member.preview ? "View only" : undefined}>I&rsquo;ve left one</button>
                </form>
              </div>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="acct-section">
        <div className="acct-section-head">
          <h2>Your services</h2>
          <Link href="/account/services">See all</Link>
        </div>
        {active.length ? (
          <ul className="acct-list">
            {active.slice(0, 4).map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="acct-faint">{s.endDate ? `Ends ${shortDate(s.endDate)}` : `Since ${shortDate(s.startDate)}`}</span>
                </div>
                <span className="acct-amount">{money(s.priceCents)}<small>{cadence(s.billingType, s.intervalMonths)}</small></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="acct-empty">No active services yet.</p>
        )}
      </section>

      <section className="acct-section">
        <div className="acct-section-head">
          <h2>Recent invoices</h2>
          <Link href="/account/invoices">See all</Link>
        </div>
        {invoices.length ? (
          <ul className="acct-list">
            {invoices.slice(0, 3).map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.title}</strong>
                  <span className="acct-faint">{i.number} · {shortDate(i.issueDate)}</span>
                </div>
                <div className="acct-list-end">
                  <InvoiceStatus status={i.status} />
                  {i.url ? <a href={i.url}>View</a> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="acct-empty">No invoices yet. When we send one, it shows up here.</p>
        )}
      </section>
    </>
  );
}
