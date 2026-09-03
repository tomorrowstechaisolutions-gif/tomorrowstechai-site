import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { OWNERSHIP_SUMMARY, PAYMENT_NOTE } from "@/lib/proposals/config";
import { formatMoney } from "@/lib/proposals/pricing";
import type { FullProposal, ProposalItem } from "@/lib/proposals/types";

/**
 * The proposal as the client reads it.
 *
 * One component renders both the public page and the admin preview, so what
 * is previewed is literally what is sent — a preview built from different
 * markup is a preview of nothing.
 *
 * Everything printed here comes from the stored rows. There is no fallback
 * copy: a proposal with no scope lines shows no scope section rather than
 * inventing one.
 */

const NAV = [
  { id: "summary", label: "Summary" },
  { id: "scope", label: "Scope" },
  { id: "pricing", label: "Pricing" },
  { id: "ownership", label: "Ownership" },
  { id: "agreement", label: "Agreement" },
  { id: "accept", label: "Accept & sign" },
];

// There is no payment section, and there never should be one. A proposal
// quotes; the invoice raised after the work is what collects.

function Paragraphs({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n{2,}/).map((block, index) => (
        <p key={index}>
          {block.split("\n").map((line, i, all) => (
            <span key={i}>
              {line}
              {i < all.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  });
}

/**
 * One priced-or-plain line list. Declared at module scope rather than inside
 * the document component: a component created during render is a new type on
 * every pass, which throws away its subtree instead of updating it.
 */
function ItemList({
  rows,
  currency,
  priced,
}: {
  rows: ProposalItem[];
  currency: string;
  priced?: boolean;
}) {
  return (
    <ul className="pr-list">
      {rows.map((row) => (
        <li key={row.id}>
          <b>{row.title}</b>
          {row.description ? <span>{row.description}</span> : null}
          {priced && row.total_price_cents > 0 ? (
            <em>
              {formatMoney(row.total_price_cents, currency)}
              {row.is_optional ? " · optional" : ""}
            </em>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function ProposalDocument({
  full,
  mode,
  acceptance,
}: {
  full: FullProposal;
  mode: "public" | "preview";
  /** The acceptance and signature form. Absent on the admin preview. */
  acceptance?: ReactNode;
}) {
  const { proposal: p, items, sections, agreement, signature } = full;
  const money = (cents: number) => formatMoney(cents, p.currency);
  const of = (type: string) => items.filter((item) => item.item_type === type);

  const scope = of("scope");
  const deliverables = of("deliverable");
  const pages = of("page");
  const integrations = of("integration");
  const addons = of("addon");
  const exclusions = of("exclusion");
  const clientDuties = of("client_responsibility");
  const providerDuties = of("provider_responsibility");

  const extra = (position: string) =>
    sections.filter((section) => section.is_visible && section.content && section.section_type === position);

  return (
    <div className="pr-doc">
      {mode === "preview" ? (
        <div className="pr-previewbar">
          Admin preview of {p.proposal_number}. This is exactly what the client
          sees, without the acceptance form.
        </div>
      ) : null}

      <header className="pr-nav">
        <a href="https://tomorrowstechai.com" className="pr-brand">
          <BrandMark size={34} />
          <span>TOMORROW&rsquo;S <b>TECH AI</b></span>
        </a>
        <span className="pr-navmeta">
          {p.proposal_number}
          {p.sent_at ? ` · ${longDate(p.sent_at)}` : ""}
        </span>
      </header>

      <nav className="pr-jump" aria-label="Sections">
        {NAV.filter((entry) => entry.id !== "accept" || mode === "public").map((entry) => (
          <a key={entry.id} href={`#${entry.id}`}>{entry.label}</a>
        ))}
      </nav>

      <main className="pr-main">
        {/* 1 · Header ------------------------------------------------ */}
        <section className="pr-hero">
          <div>
            <span className="pr-kicker">
              {p.kind === "change_order" ? "Change order" : "Proposal"} · {p.proposal_number}
            </span>
            <h1>{p.title}</h1>
            <p className="pr-lede">
              Prepared for {p.client_business_name || p.client_contact_name || "your business"}
              {p.client_contact_name && p.client_business_name ? ` — attention ${p.client_contact_name}` : ""}.
            </p>
            {p.valid_until ? (
              <p className="pr-valid">Open for acceptance until {longDate(`${p.valid_until}T12:00:00Z`)}.</p>
            ) : null}
          </div>
          <aside className="pr-price">
            <span>Project investment</span>
            <strong>{money(p.total_cents)}</strong>
            <p>one-time{p.package_name ? ` · ${p.package_name}` : ""}</p>
            {p.recurring_price_cents > 0 ? (
              <div>
                <b>{money(p.recurring_price_cents)}</b>
                {" "}
                per {p.recurring_interval} hosting
              </div>
            ) : null}
          </aside>
        </section>

        {/* 2 · Client / project -------------------------------------- */}
        <section className="pr-facts">
          <div><span>Client</span><b>{p.client_business_name || "—"}</b></div>
          <div><span>Contact</span><b>{p.client_contact_name || "—"}</b></div>
          {p.client_email ? <div><span>Email</span><b>{p.client_email}</b></div> : null}
          {p.turnaround_note ? <div><span>Turnaround</span><b>{p.turnaround_note}</b></div> : null}
          {p.revision_limit !== null ? (
            <div>
              <span>Revisions</span>
              <b>{p.revision_limit} round{p.revision_limit === 1 ? "" : "s"}</b>
            </div>
          ) : null}
          <div><span>Prepared by</span><b>Tomorrow&rsquo;s Tech AI</b></div>
        </section>

        {/* 3 · Executive summary ------------------------------------- */}
        {p.summary || extra("executive_summary").length > 0 ? (
          <section id="summary" className="pr-block">
            <div className="pr-head"><span>01</span><h2>Summary</h2></div>
            <div className="pr-prose">
              <Paragraphs text={p.summary} />
              {extra("executive_summary").map((section) => (
                <div key={section.id}>
                  <h3>{section.title}</h3>
                  <Paragraphs text={section.content} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 4 · Scope of work ----------------------------------------- */}
        {scope.length > 0 ? (
          <section id="scope" className="pr-block">
            <div className="pr-head"><span>02</span><h2>Scope of work</h2></div>
            {extra("scope").map((section) => (
              <div className="pr-prose" key={section.id}><Paragraphs text={section.content} /></div>
            ))}
            <ItemList rows={scope} currency={p.currency} />
          </section>
        ) : null}

        {/* 5 · Deliverables ------------------------------------------ */}
        {deliverables.length + pages.length + integrations.length > 0 ? (
          <section className="pr-block">
            <div className="pr-head"><span>03</span><h2>Deliverables</h2></div>
            {deliverables.length > 0 ? <ItemList rows={deliverables} currency={p.currency} /> : null}
            {pages.length > 0 ? (
              <>
                <h3 className="pr-sub">Pages</h3>
                <ItemList rows={pages} currency={p.currency} />
              </>
            ) : null}
            {integrations.length > 0 ? (
              <>
                <h3 className="pr-sub">Integrations</h3>
                <ItemList rows={integrations} currency={p.currency} />
              </>
            ) : null}
          </section>
        ) : null}

        {/* 6 · Pricing ----------------------------------------------- */}
        <section id="pricing" className="pr-block">
          <div className="pr-head"><span>04</span><h2>Investment</h2></div>
          <div className="pr-pricegrid">
            <div>
              <span>Website build</span>
              <strong>{money(p.total_cents)}</strong>
              <small>
                {p.discount_amount_cents > 0
                  ? `${money(p.subtotal_cents)} less ${money(p.discount_amount_cents)} discount`
                  : "one time"}
              </small>
            </div>
            {p.recurring_price_cents > 0 ? (
              <div>
                <span>Hosting</span>
                <strong>{money(p.recurring_price_cents)}</strong>
                <small>per {p.recurring_interval}</small>
              </div>
            ) : null}
            <div className="is-due">
              <span>Due today</span>
              <strong>Nothing</strong>
              <small>signing records your approval only</small>
            </div>
          </div>

          <p className="pr-note">{PAYMENT_NOTE}</p>

          {addons.length > 0 ? (
            <>
              <h3 className="pr-sub">Add-ons</h3>
              <ItemList rows={addons} currency={p.currency} priced />
            </>
          ) : null}
          {extra("pricing").map((section) => (
            <div className="pr-prose" key={section.id}><Paragraphs text={section.content} /></div>
          ))}
        </section>

        {/* 7 · Hosting ----------------------------------------------- */}
        {p.recurring_price_cents > 0 || p.hosting_note ? (
          <section className="pr-block">
            <div className="pr-head"><span>05</span><h2>Hosting</h2></div>
            <div className="pr-prose">
              <Paragraphs text={p.hosting_note} />
              {extra("hosting").map((section) => (
                <Paragraphs key={section.id} text={section.content} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Responsibilities and exclusions ---------------------------- */}
        {clientDuties.length + providerDuties.length + exclusions.length > 0 ? (
          <section className="pr-block pr-duties">
            <div className="pr-head"><span>06</span><h2>What each side does</h2></div>
            <div className="pr-duty-grid">
              {clientDuties.length > 0 ? (
                <div>
                  <h3 className="pr-sub">What we need from you</h3>
                  <ItemList rows={clientDuties} currency={p.currency} />
                </div>
              ) : null}
              {providerDuties.length > 0 ? (
                <div>
                  <h3 className="pr-sub">What Tomorrow&rsquo;s Tech AI does</h3>
                  <ItemList rows={providerDuties} currency={p.currency} />
                </div>
              ) : null}
            </div>
            {exclusions.length > 0 ? (
              <>
                <h3 className="pr-sub">Not included in this scope</h3>
                <ul className="pr-tags">
                  {exclusions.map((row) => <li key={row.id}>{row.title}</li>)}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {/* 8 · Ownership at a glance ---------------------------------- */}
        <section id="ownership" className="pr-block">
          <div className="pr-head"><span>07</span><h2>Ownership &amp; software license</h2></div>
          <p className="pr-note">
            This summary is here so the ownership position is read rather than
            discovered. The Agreement below is the operative text and controls
            if there is any conflict.
          </p>
          <div className="pr-own">
            <div className="is-yours">
              <h3>{OWNERSHIP_SUMMARY.clientOwns.heading}</h3>
              <ul>{OWNERSHIP_SUMMARY.clientOwns.items.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div>
              <h3>{OWNERSHIP_SUMMARY.providerRetains.heading}</h3>
              <ul>{OWNERSHIP_SUMMARY.providerRetains.items.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
            <div className="is-warn">
              <h3>{OWNERSHIP_SUMMARY.notIncluded.heading}</h3>
              <ul>{OWNERSHIP_SUMMARY.notIncluded.items.map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          </div>
          <p className="pr-licence">{OWNERSHIP_SUMMARY.licenceNote}</p>
          {extra("ownership").map((section) => (
            <div className="pr-prose" key={section.id}><Paragraphs text={section.content} /></div>
          ))}
        </section>

        {/* 9 · Full agreement ---------------------------------------- */}
        <section id="agreement" className="pr-block">
          <div className="pr-head">
            <span>08</span>
            <h2>{agreement ? agreement.title : "Agreement"}</h2>
            {agreement ? <p>Version {agreement.version}</p> : null}
          </div>

          {agreement ? (
            <div className="pr-agreement">
              {agreement.intro ? (
                <div className="pr-prose"><Paragraphs text={agreement.intro} /></div>
              ) : null}

              {agreement.sections.map((section) => (
                <article key={section.n}>
                  <h3>{section.n}. {section.heading}</h3>
                  {(section.paragraphs ?? []).map((text, index) => <p key={index}>{text}</p>)}
                  {(section.bullets ?? []).length > 0 ? (
                    <ul>{section.bullets.map((line, index) => <li key={index}>{line}</li>)}</ul>
                  ) : null}
                </article>
              ))}

              {agreement.ownership_rows.length > 0 ? (
                <article>
                  <h3>Exhibit B — Ownership at a glance</h3>
                  <div className="pr-tablewrap">
                    <table className="pr-table">
                      <thead>
                        <tr>
                          <th>Asset / information</th>
                          <th>Who owns it</th>
                          <th>Typical treatment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agreement.ownership_rows.map((row) => (
                          <tr key={row.asset}>
                            <td>{row.asset}</td>
                            <td>{row.owner}</td>
                            <td>{row.treatment}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : null}
            </div>
          ) : (
            <p className="pr-note">
              No agreement version is attached to this proposal. Please contact
              us before signing.
            </p>
          )}
        </section>

        {/* 10 · Acceptance and signature ------------------------------ */}
        {signature ? (
          <section id="accept" className="pr-block">
            <div className="pr-head"><span>09</span><h2>Signed</h2></div>
            <div className="pr-signed">
              <div className="pr-mark">{signature.signature_text || signature.signer_name}</div>
              <p>
                <b>{signature.signer_name}</b>
                {signature.signer_title ? ` — ${signature.signer_title}` : ""}
                <br />
                {signature.signer_email}
              </p>
              <p className="pr-note">
                Signed {longDate(signature.signed_at)} under agreement version{" "}
                {signature.agreement_version}. A frozen copy of this document is
                stored against the signature record.
              </p>
            </div>
          </section>
        ) : (
          acceptance
        )}

        <footer className="pr-foot">
          <span>Tomorrow&rsquo;s Tech AI · Solutions for tomorrow. Results today.</span>
          <span>john@tomorrowstechai.com · (254) 563-2130</span>
        </footer>
      </main>
    </div>
  );
}
