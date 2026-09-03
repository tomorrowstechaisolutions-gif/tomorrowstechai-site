import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getInvoiceById, invoiceUrl } from "@/lib/invoices/service";
import { loadInvoiceTimeline } from "@/lib/invoices/queries";
import {
  ITEM_KIND_LABELS, METHOD_LABELS, PAYMENT_METHODS, SOURCE_LABELS,
  STATUS_LABELS, STATUS_TONE, TERM_LABELS, type PaymentTerm,
} from "@/lib/invoices/config";
import { daysOverdue, formatDate, formatMoney, isOverdue, outstandingCents } from "@/lib/invoices/pricing";
import {
  addInvoiceNoteAction, deleteInvoiceAction, deleteInvoicePaymentAction,
  duplicateInvoiceAction, markInvoiceSentAction, recordInvoicePaymentAction,
  sendInvoiceAction, sendInvoiceReminderAction, setInvoiceStatusAction,
} from "@/app/admin/invoice-actions";
import CopyLink from "@/components/admin/cc/CopyLink";
import { DASH, ago } from "@/components/admin/cc/format";
import {
  IconAlert, IconCheck, IconDollar, IconFile, IconLayers,
  IconPulse, IconSend, IconUsers,
} from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice" };

const EVENT_TONE: Record<string, string> = {
  paid: "s-ok", payment_recorded: "s-ok", created: "s-info",
  sent: "s-info", resent: "s-info", viewed: "s-info",
  reminder_sent: "s-warning", voided: "s-warning", refunded: "s-error",
};

function stamp(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const full = await getInvoiceById(supabase, id);
  if (!full) notFound();

  const timeline = await loadInvoiceTimeline(supabase, id);
  const { invoice: inv, items, payments } = full;

  const money = (cents: number) => formatMoney(cents, inv.currency);
  const outstanding = outstandingCents(inv);
  const overdue = isOverdue(inv);
  const publicLink = invoiceUrl(inv.public_token);
  const oneTimeLines = items.filter((item) => item.item_kind !== "recurring");
  const recurringLines = items.filter((item) => item.item_kind === "recurring");

  const facts: { label: string; value: string }[] = [
    { label: "Client", value: inv.client_business_name || DASH },
    { label: "Contact", value: inv.client_contact_name || DASH },
    { label: "Email", value: inv.client_email || DASH },
    { label: "Phone", value: inv.client_phone || DASH },
    { label: "Issued", value: formatDate(inv.issue_date) },
    { label: "Due", value: formatDate(inv.due_date) },
    { label: "Terms", value: TERM_LABELS[(inv.payment_terms as PaymentTerm)] ?? inv.payment_terms ?? DASH },
    { label: "Origin", value: SOURCE_LABELS[inv.source] ?? inv.source },
    { label: "Owner", value: inv.owner || DASH },
    {
      label: "Sent",
      value: inv.sent_at
        ? `${stamp(inv.sent_at)}${inv.sent_method === "manual" ? " · by hand" : " · emailed"}`
        : DASH,
    },
    { label: "First viewed", value: stamp(inv.first_viewed_at) },
    { label: "Views", value: String(inv.view_count ?? 0) },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>
            {inv.invoice_number}{" "}
            <span className={`cc-chip ${STATUS_TONE[inv.status]}`}>{STATUS_LABELS[inv.status]}</span>
            {overdue ? (
              <span className="cc-chip t-risk"> {daysOverdue(inv.due_date)} days overdue</span>
            ) : null}
          </h1>
          <p>
            {inv.title} · {inv.client_business_name || inv.client_contact_name || "no client recorded"} ·{" "}
            {money(inv.total_cents)}
            {inv.recurring_cents > 0
              ? ` · ${money(inv.recurring_cents)}/${inv.recurring_interval}`
              : ""}
          </p>
        </div>
        <Link href="/admin/invoices" className="cc-btn">All invoices</Link>
      </div>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-body pr-actions">
            <Link href={`/admin/invoices/${inv.id}/preview`} className="cc-btn">Preview</Link>
            {inv.status === "paid" ? null : (
              <Link href={`/admin/invoices/${inv.id}/edit`} className="cc-btn">Edit</Link>
            )}
            <CopyLink url={publicLink} label="Copy client link" />
            <a href={publicLink} target="_blank" rel="noreferrer" className="cc-btn">Open client view</a>

            <form action={sendInvoiceAction} className="pr-sendform">
              <input type="hidden" name="invoice_id" value={inv.id} />
              <input
                className="cc-input" name="note" maxLength={2000}
                placeholder="Optional note to include in the email"
              />
              <button type="submit" className="cc-btn primary">
                <IconSend size={13} /> {inv.sent_at ? "Email again" : "Email to client"}
              </button>
            </form>

            <form action={markInvoiceSentAction} className="pr-sendform">
              <input type="hidden" name="invoice_id" value={inv.id} />
              <input
                className="cc-input" name="how" maxLength={200}
                placeholder="How you sent it — Messenger, text, in person"
              />
              <button type="submit" className="cc-btn">
                Mark as sent — I&rsquo;ll send the link myself
              </button>
            </form>

            {outstanding > 0 && inv.sent_at ? (
              <form action={sendInvoiceReminderAction}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button type="submit" className="cc-btn">Send a reminder</button>
              </form>
            ) : null}

            <form action={duplicateInvoiceAction}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <button type="submit" className="cc-btn">Duplicate</button>
            </form>

            {inv.status === "draft" && !inv.sent_at ? (
              <form action={deleteInvoiceAction}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button type="submit" className="cc-btn">Delete draft</button>
              </form>
            ) : null}

            {inv.status === "void" ? null : (
              <form action={setInvoiceStatusAction} className="pr-sendform">
                <input type="hidden" name="invoice_id" value={inv.id} />
                <input type="hidden" name="status" value="void" />
                <input className="cc-input" name="reason" maxLength={1000} placeholder="Why it is being voided" />
                <button type="submit" className="cc-btn">Void</button>
              </form>
            )}
          </div>
          {inv.client_email ? null : (
            <div className="cc-panel-body">
              <p className="cc-note" style={{ marginTop: 0 }}>
                There is no email address on this invoice, so it cannot be
                emailed. Copy the link and send it however you normally reach
                this client, then mark it as sent.
              </p>
            </div>
          )}
        </section>

        {/* ── Overview ───────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head">
            <IconUsers size={15} />
            <h2>Overview</h2>
          </div>
          <div className="cc-panel-body">
            <div className="pr-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <span>{fact.label}</span>
                  <b>{fact.value}</b>
                </div>
              ))}
            </div>

            {inv.notes ? (
              <>
                <p className="cc-label" style={{ marginTop: 16 }}>Note on the invoice</p>
                <p className="cc-note" style={{ marginTop: 4 }}>{inv.notes}</p>
              </>
            ) : null}

            {inv.notes_internal ? (
              <>
                <p className="cc-label" style={{ marginTop: 16 }}>Internal notes</p>
                <p className="cc-note" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                  {inv.notes_internal}
                </p>
              </>
            ) : null}

            <div className="pr-actions" style={{ marginTop: 14 }}>
              {inv.proposal_id ? (
                <Link href={`/admin/proposals/${inv.proposal_id}`} className="cc-btn">Proposal</Link>
              ) : null}
              {inv.lead_id ? (
                <Link href={`/admin/leads/${inv.lead_id}`} className="cc-btn">Lead record</Link>
              ) : null}
              {inv.job_id ? (
                <Link href={`/admin/jobs/${inv.job_id}`} className="cc-btn">Project</Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Money ──────────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head">
            <IconDollar size={15} />
            <h2>Money</h2>
            <span className="cc-sub">
              {outstanding > 0 ? `${money(outstanding)} still owed` : "Nothing outstanding"}
            </span>
          </div>
          <div className="cc-panel-body">
            <div className="pr-total">
              <div><span>Subtotal</span><b>{money(inv.subtotal_cents)}</b></div>
              {inv.discount_cents > 0 ? (
                <div><span>Discount</span><b>−{money(inv.discount_cents)}</b></div>
              ) : null}
              <div className="is-total"><span>Invoice total</span><b>{money(inv.total_cents)}</b></div>
              <div><span>Collected</span><b>{money(inv.amount_paid_cents)}</b></div>
              <div className="is-due">
                <span>Outstanding</span>
                <b>{money(outstanding)}</b>
              </div>
              {inv.recurring_cents > 0 ? (
                <div>
                  <span>Recurring</span>
                  <b>
                    {money(inv.recurring_cents)}/{inv.recurring_interval}
                    {inv.recurring_starts_on ? ` from ${formatDate(inv.recurring_starts_on)}` : ""}
                  </b>
                </div>
              ) : null}
            </div>

            {inv.status === "paid" ? (
              <p className="cc-note">
                Paid in full. What this invoice charged is now frozen — the
                database will refuse a change to it. Anything that needs
                correcting is a new invoice.
              </p>
            ) : null}

            {/* Recording money that arrived any way other than the Pay button. */}
            {inv.status === "void" ? null : (
              <form action={recordInvoicePaymentAction} style={{ marginTop: 14 }}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <p className="cc-label">Record a payment</p>
                <div className="cc-field row2">
                  <span>
                    <label className="cc-label" htmlFor="amount">Amount</label>
                    <input id="amount" name="amount" className="cc-input" inputMode="decimal"
                      defaultValue={outstanding > 0 ? (outstanding / 100).toFixed(2) : ""}
                      placeholder="0.00" />
                  </span>
                  <span>
                    <label className="cc-label" htmlFor="method">How it arrived</label>
                    <select id="method" name="method" className="cc-select" defaultValue="check">
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>{METHOD_LABELS[method]}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="cc-field row2">
                  <span>
                    <label className="cc-label" htmlFor="paid_on">Date</label>
                    <input id="paid_on" name="paid_on" type="date" className="cc-input" />
                  </span>
                  <span>
                    <label className="cc-label" htmlFor="reference">Reference</label>
                    <input id="reference" name="reference" className="cc-input"
                      placeholder="Cheque number, transfer ref" />
                  </span>
                </div>
                <div className="cc-field">
                  <label className="cc-label" htmlFor="payment_note">Note</label>
                  <input id="payment_note" name="note" className="cc-input" />
                </div>
                <label className="cc-toggle-row">
                  <input type="checkbox" className="cc-check" name="send_receipt" value="1" />
                  <span className="cc-note" style={{ marginTop: 0 }}>Email the client a receipt</span>
                </label>
                <button type="submit" className="cc-btn primary" style={{ marginTop: 10 }}>
                  <IconCheck size={13} /> Record it
                </button>
                <p className="cc-note">
                  This records money that arrived outside Stripe. It does not
                  write to the revenue ledger — that stays Stripe-sourced so the
                  campaign numbers can be trusted against ad spend.
                </p>
              </form>
            )}
          </div>
        </section>

        {/* ── Lines ──────────────────────────────────────────────── */}
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <IconLayers size={15} />
            <h2>What is being charged</h2>
            <span className="cc-sub">{items.length} line{items.length === 1 ? "" : "s"}</span>
          </div>
          <div className="cc-panel-body">
            {items.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>
                Nothing on this invoice yet. Edit it and add a line before
                sending it to anybody.
              </p>
            ) : (
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Line</th>
                      <th>Detail</th>
                      <th className="num">Qty</th>
                      <th className="num">Unit</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...oneTimeLines, ...recurringLines].map((item) => (
                      <tr key={item.id}>
                        <td>{ITEM_KIND_LABELS[item.item_kind]}</td>
                        <td><span className="cc-strong">{item.title}</span></td>
                        <td>{item.description || DASH}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{money(item.unit_price_cents)}</td>
                        <td className="num">
                          {item.item_kind === "discount" ? "−" : ""}
                          {money(item.total_price_cents)}
                          {item.item_kind === "recurring" ? `/${inv.recurring_interval}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Payments ───────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head">
            <IconCheck size={15} />
            <h2>Payments</h2>
            <span className="cc-sub">{money(inv.amount_paid_cents)} collected</span>
          </div>
          <div className="cc-panel-body">
            {payments.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>
                Nothing has been received against this invoice yet.
              </p>
            ) : (
              <div className="cc-scroll">
                <table className="cc-table dense">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num">Amount</th>
                      <th>How</th>
                      <th>Reference</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.paid_on)}</td>
                        <td className="num">{money(payment.amount_cents)}</td>
                        <td>{METHOD_LABELS[payment.method] ?? payment.method}</td>
                        <td>{payment.reference || payment.note || DASH}</td>
                        <td>
                          {payment.stripe_payment_intent ? (
                            <span className="cc-chip t-ok">Stripe</span>
                          ) : (
                            <form action={deleteInvoicePaymentAction}>
                              <input type="hidden" name="invoice_id" value={inv.id} />
                              <input type="hidden" name="payment_id" value={payment.id} />
                              <button type="submit" className="cc-btn">Remove</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── History ────────────────────────────────────────────── */}
        <section className="cc-panel cc-s6">
          <div className="cc-panel-head">
            <IconPulse size={15} />
            <h2>History</h2>
            <span className="cc-sub">{timeline.length} events</span>
          </div>
          <div className="cc-panel-body">
            <form action={addInvoiceNoteAction} className="pr-sendform" style={{ marginBottom: 12 }}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <input className="cc-input" name="body" maxLength={4000} placeholder="Add a note to the history" />
              <button type="submit" className="cc-btn">Add</button>
            </form>

            {timeline.length === 0 ? (
              <p className="cc-note" style={{ marginTop: 0 }}>Nothing has happened yet.</p>
            ) : (
              <ol className="pr-timeline">
                {timeline.map((event) => (
                  <li key={event.id}>
                    <span className={`cc-dot ${EVENT_TONE[event.event_type] ?? "s-info"}`} />
                    <div>
                      <b>{event.event_type.replace(/_/g, " ")}</b>
                      {event.body ? <span>{event.body}</span> : null}
                      <i>
                        {stamp(event.created_at)} · {ago(event.created_at)}
                        {event.actor ? ` · ${event.actor}` : ""}
                      </i>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {overdue ? (
          <section className="cc-panel cc-s12">
            <div className="cc-panel-body">
              <div className="cc-error">
                <IconAlert size={15} />
                <span>
                  This invoice was due {formatDate(inv.due_date)} and{" "}
                  {money(outstanding)} is still outstanding. Send a reminder, or
                  record the payment if it has already arrived some other way.
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {inv.terms ? (
          <section className="cc-panel cc-s12">
            <div className="cc-panel-head">
              <IconFile size={15} />
              <h2>Terms as printed</h2>
            </div>
            <div className="cc-panel-body">
              <p className="cc-note" style={{ marginTop: 0 }}>{inv.terms}</p>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
