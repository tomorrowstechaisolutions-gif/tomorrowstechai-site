import type { Metadata } from "next";
import { getPortalViewer } from "@/lib/portal/session";
import { balanceCents, memberHasStripeBilling, memberInvoices, money, shortDate } from "@/lib/portal/data";
import { BillingButton, BillingNotice, InvoiceStatus } from "../parts";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const member = (await getPortalViewer())!;
  const [{ billing }, invoices, hasBilling] = await Promise.all([
    searchParams,
    memberInvoices(member.customerId),
    memberHasStripeBilling(member.customerId),
  ]);

  return (
    <section className="acct-section">
      <BillingNotice code={billing} />
      <div className="acct-section-head">
        <h2>Invoices</h2>
        {hasBilling ? <BillingButton back="/account/invoices" label="Card & receipts" /> : null}
      </div>
      {invoices.length ? (
        <div className="acct-table-wrap">
          <table className="acct-table">
            <thead>
              <tr><th>Invoice</th><th>Date</th><th className="num">Amount</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const owed = balanceCents(i);
                const amount = i.totalCents || i.recurringCents;
                return (
                  <tr key={i.id}>
                    <td><strong>{i.title}</strong><span className="acct-faint">{i.number}</span></td>
                    <td>{shortDate(i.issueDate)}</td>
                    <td className="num">
                      {money(amount)}
                      {!i.totalCents && i.recurringCents ? <small>/{i.recurringInterval === "year" ? "yr" : "mo"}</small> : null}
                    </td>
                    <td><InvoiceStatus status={i.status} /></td>
                    <td className="end">
                      {i.url ? <a className={owed ? "acct-btn small" : ""} href={i.url}>{owed ? "Pay now" : "View"}</a> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="acct-empty">No invoices yet. When we send one, it shows up here and you can pay it online.</p>
      )}
      <p className="acct-faint small" style={{ marginTop: 14 }}>
        Each invoice opens its own secure page, where you can pay by card or download a copy.
      </p>
    </section>
  );
}
