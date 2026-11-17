import type { Metadata } from "next";
import Link from "next/link";
import { getPortalMember } from "@/lib/portal/session";
import { memberCatalog, money, OFFER_ORDER, type MemberOffer } from "@/lib/portal/data";
import { requestServiceAction } from "../../member-actions";

export const metadata: Metadata = { title: "More services" };

const NOTICE: Record<string, [string, string]> = {
  ok: ["ok", "Got it. We'll reach out by email, usually within one business day, with details and a quote. Nothing has been charged."],
  already: ["ok", "You've already asked about that one. We'll be in touch soon."],
  busy: ["err", "You've sent several requests in the last hour. We'll get to them; for anything urgent, call (254) 563-2130."],
  missing: ["err", "That service isn't available any more. Send us a request and we'll point you to the right option."],
  error: ["err", "Your request couldn't be sent. Email info@tomorrowstechai.com instead."],
};

function price(o: MemberOffer): string {
  if (o.pricingMode === "custom_quote" || !o.priceCents) return "Custom quote";
  const from = o.pricingMode === "starting_at" ? "From " : "";
  return `${from}${money(o.priceCents).replace(/\.00$/, "")}${o.billingType === "recurring" ? "/mo" : ""}`;
}

function RequestButton({ offer, label }: { offer: MemberOffer; label: string }) {
  if (offer.requested) return <span className="acct-chip info">Requested</span>;
  return (
    <form action={requestServiceAction} className="acct-inline-form">
      <input type="hidden" name="item_id" value={offer.id} />
      <button className="acct-link-btn">{label}</button>
    </form>
  );
}

export default async function MoreServicesPage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
  const member = (await getPortalMember())!;
  const [{ requested }, offers] = await Promise.all([searchParams, memberCatalog(member.customerId)]);
  const notice = requested ? NOTICE[requested] : undefined;

  const packages = offers.filter((o) => o.pricingMode !== "custom_quote" && o.priceCents > 0);
  const addOns = offers.filter((o) => !packages.includes(o));
  const groups = (list: MemberOffer[]) =>
    OFFER_ORDER.map((name) => [name, list.filter((o) => o.category === name)] as const).filter(([, l]) => l.length);

  return (
    <>
      {notice ? <p className={`acct-msg ${notice[0]}`} role={notice[0] === "err" ? "alert" : "status"}>{notice[1]}</p> : null}
      <p className="acct-faint" style={{ marginTop: 0 }}>
        Want to add something? Tap <strong>I&rsquo;m interested</strong> and we&rsquo;ll follow up with details and a quote. Nothing is charged until you approve it.
      </p>

      {groups(packages).map(([name, list]) => (
        <section key={name} className="acct-section">
          <h2>{name}</h2>
          <div className="acct-cards">
            {list.map((o) => (
              <article key={o.id} className={`acct-svc${o.featured ? " is-featured" : ""}`}>
                <div className="acct-svc-top">
                  <h3>{o.name}</h3>
                  {o.badge ? <span className="acct-chip info">{o.badge}</span> : null}
                </div>
                {o.blurb ? <p>{o.blurb}</p> : null}
                <dl>
                  <div><dt>Price</dt><dd>{price(o)}</dd></div>
                  {o.setupCents ? <div><dt>Setup</dt><dd>{money(o.setupCents).replace(/\.00$/, "")} one-time</dd></div> : null}
                </dl>
                <div className="acct-svc-actions">
                  <RequestButton offer={o} label="I'm interested" />
                  {o.detailsUrl ? <Link href={o.detailsUrl} target="_blank" rel="noopener">See details</Link> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {addOns.length ? (
        <section className="acct-section">
          <h2>Add-ons and custom work</h2>
          <p className="acct-faint">Priced to fit what you need.</p>
          {groups(addOns).map(([name, list]) => (
            <div key={name} className="acct-addon-group">
              <h3>{name}</h3>
              <ul className="acct-list">
                {list.map((o) => (
                  <li key={o.id}>
                    <div>
                      <strong>{o.name}</strong>
                      {o.blurb ? <span className="acct-faint">{o.blurb}</span> : null}
                    </div>
                    <div className="acct-list-end">
                      {o.detailsUrl ? <Link href={o.detailsUrl} target="_blank" rel="noopener">Details</Link> : null}
                      <RequestButton offer={o} label="Ask about this" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {!offers.length ? <p className="acct-empty">You already have everything we offer. Nice. <Link href="/account/help">Ask us</Link> about anything custom.</p> : null}
    </>
  );
}
