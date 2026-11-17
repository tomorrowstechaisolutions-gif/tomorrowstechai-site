import type { Metadata } from "next";
import Link from "next/link";
import { getPortalMember } from "@/lib/portal/session";
import { cadence, memberServices, money, shortDate } from "@/lib/portal/data";
import { ServiceStatus } from "../parts";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const member = (await getPortalMember())!;
  const services = await memberServices(member.customerId);
  const current = services.filter((s) => !["cancelled", "canceled", "ended", "completed"].includes(s.status));
  const past = services.filter((s) => !current.includes(s));

  return (
    <>
      <section className="acct-section">
        <h2>Your services</h2>
        {current.length ? (
          <div className="acct-cards">
            {current.map((s) => (
              <article key={s.id} className="acct-svc">
                <div className="acct-svc-top">
                  <h3>{s.name}</h3>
                  <ServiceStatus status={s.status} />
                </div>
                {s.description ? <p>{s.description}</p> : null}
                <dl>
                  <div><dt>Price</dt><dd>{money(s.priceCents)}{cadence(s.billingType, s.intervalMonths)}</dd></div>
                  <div><dt>Started</dt><dd>{shortDate(s.startDate)}</dd></div>
                  {s.billingType === "recurring" ? <div><dt>Next billing</dt><dd>{shortDate(s.nextBillingDate)}</dd></div> : null}
                </dl>
                <p className="acct-faint small">
                  Need a change, or want to cancel? <Link href={`/account/help?about=${encodeURIComponent(s.name)}`}>Send us a request</Link>.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="acct-empty">No active services yet.</p>
        )}
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
