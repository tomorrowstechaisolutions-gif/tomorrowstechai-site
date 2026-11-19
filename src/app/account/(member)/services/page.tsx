import type { Metadata } from "next";
import Link from "next/link";
import { getPortalViewer } from "@/lib/portal/session";
import { cadence, memberHasStripeBilling, memberServices, money, shortDate } from "@/lib/portal/data";
import { BillingButton, BillingNotice, ServiceStatus } from "../parts";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const member = (await getPortalViewer())!;
  const [{ billing }, services, hasBilling] = await Promise.all([
    searchParams,
    memberServices(member.customerId),
    memberHasStripeBilling(member.customerId),
  ]);
  const current = services.filter((s) => !["cancelled", "canceled", "ended", "completed"].includes(s.status));
  const past = services.filter((s) => !current.includes(s));

  return (
    <>
      <BillingNotice code={billing} />
      <section className="acct-section">
        <div className="acct-section-head">
          <h2>Your services</h2>
          {hasBilling ? <BillingButton back="/account/services" /> : null}
        </div>
        {current.length ? (
          <div className="acct-cards">
            {current.map((s) => {
              const ending = s.status === "active" && Boolean(s.endDate);
              const recurring = s.billingType === "recurring";
              const helpLink = (category: string) =>
                `/account/help?category=${category}&about=${encodeURIComponent(s.name)}`;
              return (
                <article key={s.id} className="acct-svc">
                  <div className="acct-svc-top">
                    <h3>{s.name}</h3>
                    {ending ? <span className="acct-chip due">Ends {shortDate(s.endDate)}</span> : <ServiceStatus status={s.status} />}
                  </div>
                  {s.description ? <p>{s.description}</p> : null}
                  {ending ? (
                    <p className="acct-note">
                      Cancelled. You won&rsquo;t be charged again, and it stays on until {shortDate(s.endDate)}.
                      {s.selfServe && hasBilling ? " Changed your mind? Use Manage billing to keep it." : null}
                    </p>
                  ) : null}
                  {s.billingStatus === "past_due" ? (
                    <p className="acct-note">Your last payment didn&rsquo;t go through. Update your card under Manage billing to keep this running.</p>
                  ) : null}
                  <dl>
                    <div><dt>Price</dt><dd>{money(s.priceCents)}{cadence(s.billingType, s.intervalMonths)}</dd></div>
                    <div><dt>Started</dt><dd>{shortDate(s.startDate)}</dd></div>
                    {recurring && !ending ? <div><dt>Next billing</dt><dd>{shortDate(s.nextBillingDate)}</dd></div> : null}
                    {recurring ? <div><dt>Billing</dt><dd>{s.selfServe ? "Card on file (automatic)" : "By invoice"}</dd></div> : null}
                  </dl>
                  <div className="acct-svc-actions">
                    {recurring && s.selfServe && hasBilling ? (
                      ending ? null : <BillingButton back="/account/services" label="Cancel or update card" />
                    ) : recurring && !ending ? (
                      <Link className="acct-link-btn" href={helpLink("cancel")}>Request cancellation</Link>
                    ) : null}
                    <Link className="acct-link-btn" href={helpLink("change")}>Request a change</Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="acct-empty">No active services yet.</p>
        )}
        {current.some((s) => s.billingType === "recurring") ? (
          <p className="acct-faint small" style={{ marginTop: 12 }}>
            Cancelling stops the next charge. Your service stays on through the period you&rsquo;ve already paid for. No partial refunds.
          </p>
        ) : null}
      </section>

      {past.length ? (
        <section className="acct-section">
          <h2>Past services</h2>
          <ul className="acct-list">
            {past.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="acct-faint">{shortDate(s.startDate)} to {shortDate(s.endDate)}</span>
                </div>
                <ServiceStatus status={s.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
