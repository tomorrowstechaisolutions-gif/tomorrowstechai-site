import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { formatDate, formatMoney, isOverdue, outstandingCents } from "@/lib/invoices/pricing";
import { STATUS_LABELS } from "@/lib/invoices/config";
import type { FullInvoice } from "@/lib/invoices/types";

/**
 * The invoice as the client reads it.
 *
 * One component renders both the public page and the admin preview, so what
 * is previewed is literally what is sent — a preview built from different
 * markup is a preview of nothing.
 *
 * It shares the proposal document's stylesheet on purpose. A client who has
 * just signed a proposal and then receives an invoice should recognise it as
 * coming from the same business, and one set of `.pr-*` rules is one set to
 * keep working rather than two that drift.
 *
 * Everything printed here comes from the stored rows. There is no fallback
 * copy: an invoice with no lines shows no line table rather than inventing
 * one.
 */

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

export default function InvoiceDocument({
  full,
  mode,
  payment,
}: {
  full: FullInvoice;
  mode: "public" | "preview";
  /** The pay block, once there is something to pay. */
  payment?: ReactNode;
}) {
  const { invoice: inv, items, payments } = full;
  const money = (cents: number) => formatMoney(cents, inv.currency);

  const oneTime = items.filter((item) => item.item_kind === "one_time");
  const discounts = items.filter((item) => item.item_kind === "discount");
  const recurring = items.filter((item) => item.item_kind === "recurring");
  const outstanding = outstandingCents(inv);
  const overdue = isOverdue(inv);

  return (
    <div className="pr-doc">
      {mode === "preview" ? (
        <div className="pr-previewbar">
          Admin preview of {inv.invoice_number}. This is exactly what the client
          sees.
        </div>
      ) : null}

      <header className="pr-nav">
        <a href="https://tomorrowstechai.com" className="pr-brand">
          <BrandMark size={34} />
          <span>TOMORROW&rsquo;S <b>TECH AI</b></span>
        </a>
        <span className="pr-navmeta">
          {inv.invoice_number}
          {inv.issue_date ? ` · ${formatDate(inv.issue_date)}` : ""}
        </span>
      </header>

      <main className="pr-main">
        {/* 1 · Header ------------------------------------------------ */}
        <section className="pr-hero">
          <div>
            <span className="pr-kicker">Invoice · {inv.invoice_number}</span>
            <h1>{inv.title}</h1>
            <p className="pr-lede">
              For {inv.client_business_name || inv.client_contact_name || "your business"}
              {inv.client_contact_name && inv.client_business_name
                ? ` — attention ${inv.client_contact_name}`
                : ""}
              .
            </p>
            {inv.due_date ? (
              <p className="pr-valid">
                {outstanding <= 0
                  ? `Settled in full — thank you.`
                  : overdue
                    ? `This was due on ${formatDate(inv.due_date)}.`
                    : `Due by ${formatDate(inv.due_date)}.`}
              </p>
            ) : null}
          </div>
          <aside className="pr-price">
            <span>{outstanding > 0 ? "Amount due" : "Invoice total"}</span>
            <strong>{money(outstanding > 0 ? outstanding : inv.total_cents)}</strong>
            <p>
              {outstanding > 0 && inv.amount_paid_cents > 0
                ? `${money(inv.amount_paid_cents)} of ${money(inv.total_cents)} already received`
                : STATUS_LABELS[inv.status].toLowerCase()}
            </p>
            {inv.recurring_cents > 0 ? (
              <div>
                <b>{money(inv.recurring_cents)}</b>
                {" "}
                per {inv.recurring_interval}
                {inv.recurring_starts_on ? ` from ${formatDate(inv.recurring_starts_on)}` : ""}
              </div>
            ) : null}
          </aside>
        </section>

        {/* 2 · Who and when ------------------------------------------ */}
        <section className="pr-facts">
          <div><span>Billed to</span><b>{inv.client_business_name || inv.client_contact_name || "—"}</b></div>
          {inv.client_email ? <div><span>Email</span><b>{inv.client_email}</b></div> : null}
          <div><span>Issued</span><b>{formatDate(inv.issue_date)}</b></div>
          <div><span>Due</span><b>{inv.due_date ? formatDate(inv.due_date) : "On receipt"}</b></div>
          <div><span>From</span><b>Tomorrow&rsquo;s Tech AI</b></div>
        </section>

        {inv.client_billing_address ? (
          <section className="pr-block">
            <div className="pr-prose">
              <Paragraphs text={inv.client_billing_address} />
            </div>
          </section>
        ) : null}

        {/* 3 · The lines --------------------------------------------- */}
        {items.length > 0 ? (
          <section id="lines" className="pr-block">
            <div className="pr-head"><span>01</span><h2>What this covers</h2></div>

            {oneTime.length > 0 ? (
              <ul className="pr-list">
                {oneTime.map((item) => (
                  <li key={item.id}>
                    <b>{item.title}</b>
                    {item.description ? <span>{item.description}</span> : null}
                    <em>
                      {item.quantity !== 1
                        ? `${item.quantity} × ${money(item.unit_price_cents)} · `
                        : ""}
                      {money(item.total_price_cents)}
                    </em>
                  </li>
                ))}
              </ul>
            ) : null}

            {discounts.length > 0 ? (
              <>
                <h3 className="pr-sub">Discounts</h3>
                <ul className="pr-list">
                  {discounts.map((item) => (
                    <li key={item.id}>
                      <b>{item.title}</b>
                      {item.description ? <span>{item.description}</span> : null}
                      <em>− {money(item.total_price_cents)}</em>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {recurring.length > 0 ? (
              <>
                <h3 className="pr-sub">Ongoing, billed {inv.recurring_interval}ly</h3>
                <ul className="pr-list">
                  {recurring.map((item) => (
                    <li key={item.id}>
                      <b>{item.title}</b>
                      {item.description ? <span>{item.description}</span> : null}
                      <em>
                        {money(item.total_price_cents)} per {inv.recurring_interval}
                        {inv.recurring_starts_on ? ` from ${formatDate(inv.recurring_starts_on)}` : ""}
                      </em>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {/* 4 · The figures ------------------------------------------- */}
        <section id="totals" className="pr-block">
          <div className="pr-head"><span>02</span><h2>The figures</h2></div>
          <div className="pr-pricegrid">
            <div>
              <span>Subtotal</span>
              <strong>{money(inv.subtotal_cents)}</strong>
              <small>before anything already paid</small>
            </div>
            {inv.discount_cents > 0 ? (
              <div>
                <span>Discount</span>
                <strong>− {money(inv.discount_cents)}</strong>
                <small>as agreed</small>
              </div>
            ) : null}
            <div>
              <span>Invoice total</span>
              <strong>{money(inv.total_cents)}</strong>
              <small>one-time</small>
            </div>
            {inv.amount_paid_cents > 0 ? (
              <div>
                <span>Already received</span>
                <strong>{money(inv.amount_paid_cents)}</strong>
                <small>thank you</small>
              </div>
            ) : null}
            <div className="is-due">
              <span>Amount due</span>
              <strong>{money(outstanding)}</strong>
              <small>{inv.due_date ? `by ${formatDate(inv.due_date)}` : "on receipt"}</small>
            </div>
            {inv.recurring_cents > 0 ? (
              <div>
                <span>Then</span>
                <strong>{money(inv.recurring_cents)}</strong>
                <small>
                  per {inv.recurring_interval}
                  {inv.recurring_starts_on ? `, from ${formatDate(inv.recurring_starts_on)}` : ""}
                </small>
              </div>
            ) : null}
          </div>

          {payments.length > 0 ? (
            <>
              <h3 className="pr-sub">Payments received</h3>
              <ul className="pr-list">
                {payments.map((p) => (
                  <li key={p.id}>
                    <b>{formatDate(p.paid_on)}</b>
                    <span>{p.reference ? `Reference ${p.reference}` : "Received with thanks"}</span>
                    <em>{money(p.amount_cents)}</em>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {inv.notes ? (
            <div className="pr-prose" style={{ marginTop: 22 }}>
              <Paragraphs text={inv.notes} />
            </div>
          ) : null}
        </section>

        {payment ?? null}

        {/* 5 · Terms -------------------------------------------------- */}
        {inv.terms ? (
          <section id="terms" className="pr-block">
            <div className="pr-head"><span>04</span><h2>Terms</h2></div>
            <div className="pr-prose">
              <Paragraphs text={inv.terms} />
            </div>
          </section>
        ) : null}

        {inv.footer_note ? <p className="pr-note">{inv.footer_note}</p> : null}
      </main>
    </div>
  );
}
