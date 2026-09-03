"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ITEM_KINDS, ITEM_KIND_LABELS, PAYMENT_TERMS, TERM_LABELS, dueDateFor,
  type InvoiceItemKind, type PaymentTerm,
} from "@/lib/invoices/config";
import { computeInvoice, formatMoney } from "@/lib/invoices/pricing";
import type { LinkCandidate } from "@/lib/proposals/queries";
import { IconPlus, IconX, IconUsers, IconDollar, IconFile, IconLayers } from "./Icons";

/**
 * The invoice builder.
 *
 * Lines are held in component state and posted as one JSON field rather than
 * as fifty numbered inputs. The running total shown here is a preview only —
 * the server recomputes every figure from the same function before anything
 * is saved, so what is displayed can never become what is charged.
 *
 * One-time and monthly are totalled separately and shown separately, because
 * they are two different promises about money. Adding them into a single
 * number would misstate both.
 */

export type BuilderLine = {
  key: string;
  item_kind: InvoiceItemKind;
  title: string;
  description: string;
  quantity: number;
  unit_price: string;
};

export type InvoiceInitial = {
  id?: string;
  number?: string;
  title: string;
  description: string;
  owner: string;
  clientBusinessName: string;
  clientContactName: string;
  clientEmail: string;
  clientPhone: string;
  clientBillingAddress: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: PaymentTerm;
  recurringInterval: "month" | "year";
  recurringStartsOn: string;
  terms: string;
  footerNote: string;
  notes: string;
  notesInternal: string;
  leadId: string;
  customerId: string;
  dealId: string;
  proposalId: string;
  jobId: string;
  lines: BuilderLine[];
};

let seq = 0;
const nextKey = () => `l${(seq += 1)}`;

/** Drops the client-only React key before a row is posted to the server. */
function payload(rows: BuilderLine[]): Omit<BuilderLine, "key">[] {
  return rows.map((row) => {
    const copy = { ...row } as Partial<BuilderLine>;
    delete copy.key;
    return copy as Omit<BuilderLine, "key">;
  });
}

export default function InvoiceBuilder({
  action,
  initial,
  leads,
  customers,
  deals,
  locked,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: InvoiceInitial;
  leads: LinkCandidate[];
  customers: LinkCandidate[];
  deals: { id: string; label: string; leadId: string | null; companyId: string | null }[];
  locked: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [lines, setLines] = useState<BuilderLine[]>(initial.lines);

  const field = <K extends keyof InvoiceInitial>(key: K, value: InvoiceInitial[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Changing the terms moves the due date with them, unless it was typed. */
  const applyTerm = (term: PaymentTerm) =>
    setForm((prev) => ({
      ...prev,
      paymentTerms: term,
      dueDate: dueDateFor(term, prev.issueDate || new Date().toISOString().slice(0, 10)),
    }));

  const applyContact = (candidate: LinkCandidate | undefined, kind: "lead" | "customer") => {
    if (!candidate) return;
    setForm((prev) => ({
      ...prev,
      leadId: kind === "lead" ? candidate.id : "",
      customerId: kind === "customer" ? candidate.id : "",
      clientBusinessName: candidate.businessName ?? prev.clientBusinessName,
      clientContactName: kind === "lead" ? candidate.label : prev.clientContactName,
      clientEmail: candidate.email ?? prev.clientEmail,
      clientPhone: candidate.phone ?? prev.clientPhone,
    }));
  };

  const totals = useMemo(
    () =>
      computeInvoice(
        lines.map((line) => ({
          item_kind: line.item_kind,
          quantity: line.quantity,
          unit_price_cents: Math.round(Number.parseFloat(line.unit_price || "0") * 100) || 0,
        }))
      ),
    [lines]
  );

  const addLine = (kind: InvoiceItemKind) =>
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        item_kind: kind,
        title: kind === "recurring" ? "Hosting & management" : "",
        description: "",
        quantity: 1,
        unit_price: "",
      },
    ]);

  const patchLine = (key: string, patch: Partial<BuilderLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const removeLine = (key: string) => setLines((prev) => prev.filter((line) => line.key !== key));

  if (locked) {
    return (
      <div className="cc-error">
        This invoice has been paid, so what it charged can no longer be edited.
        Duplicate it if you need another one like it, or refund it first.
      </div>
    );
  }

  return (
    <form action={action} className="cc-board pr-builder">
      {form.id ? <input type="hidden" name="invoice_id" value={form.id} /> : null}
      <input type="hidden" name="lead_id" value={form.leadId} />
      <input type="hidden" name="customer_id" value={form.customerId} />
      <input type="hidden" name="deal_id" value={form.dealId} />
      <input type="hidden" name="proposal_id" value={form.proposalId} />
      <input type="hidden" name="job_id" value={form.jobId} />
      <input type="hidden" name="owner" value={form.owner} />
      <input
        type="hidden"
        name="lines_json"
        value={JSON.stringify(payload(lines.filter((line) => line.title.trim())))}
      />

      {/* ── Client ──────────────────────────────────────────────── */}
      <section className="cc-panel cc-s6">
        <div className="cc-panel-head">
          <IconUsers size={15} />
          <h2>Who it is for</h2>
        </div>
        <div className="cc-panel-body">
          <div className="cc-field">
            <label className="cc-label" htmlFor="pick_lead">Attach an existing lead</label>
            <select
              id="pick_lead" className="cc-select" value={form.leadId}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return field("leadId", "");
                applyContact(leads.find((l) => l.id === value), "lead");
              }}
            >
              <option value="">Not attached to a lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.label}{lead.sub ? ` — ${lead.sub}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="pick_customer">Or an existing client</label>
            <select
              id="pick_customer" className="cc-select" value={form.customerId}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return field("customerId", "");
                applyContact(customers.find((c) => c.id === value), "customer");
              }}
            >
              <option value="">Not attached to a client</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}{customer.sub ? ` — ${customer.sub}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="pick_deal">Deal</label>
            <select
              id="pick_deal" className="cc-select" value={form.dealId}
              onChange={(e) => field("dealId", e.target.value)}
            >
              <option value="">Not attached to a deal</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>{deal.label}</option>
              ))}
            </select>
          </div>

          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="client_business_name">Business</label>
              <input id="client_business_name" name="client_business_name" className="cc-input"
                value={form.clientBusinessName}
                onChange={(e) => field("clientBusinessName", e.target.value)}
                placeholder="The Key Konnect" />
            </span>
            <span>
              <label className="cc-label" htmlFor="client_contact_name">Contact</label>
              <input id="client_contact_name" name="client_contact_name" className="cc-input"
                value={form.clientContactName}
                onChange={(e) => field("clientContactName", e.target.value)} />
            </span>
          </div>

          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="client_email">Email</label>
              <input id="client_email" name="client_email" type="email" className="cc-input"
                value={form.clientEmail}
                onChange={(e) => field("clientEmail", e.target.value)} />
            </span>
            <span>
              <label className="cc-label" htmlFor="client_phone">Phone</label>
              <input id="client_phone" name="client_phone" className="cc-input"
                value={form.clientPhone}
                onChange={(e) => field("clientPhone", e.target.value)} />
            </span>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="client_billing_address">Billing address</label>
            <textarea id="client_billing_address" name="client_billing_address" className="cc-textarea" rows={2}
              value={form.clientBillingAddress}
              onChange={(e) => field("clientBillingAddress", e.target.value)}
              placeholder="Printed on the invoice. Leave blank if there isn't one." />
          </div>
        </div>
      </section>

      {/* ── The invoice itself ──────────────────────────────────── */}
      <section className="cc-panel cc-s6">
        <div className="cc-panel-head">
          <IconFile size={15} />
          <h2>The invoice</h2>
          {form.number ? <span className="cc-sub">{form.number}</span> : null}
        </div>
        <div className="cc-panel-body">
          <div className="cc-field">
            <label className="cc-label" htmlFor="title">What it is for</label>
            <input id="title" name="title" className="cc-input"
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
              placeholder="The Key Konnect website launch" />
          </div>

          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="issue_date">Issued</label>
              <input id="issue_date" name="issue_date" type="date" className="cc-input"
                value={form.issueDate}
                onChange={(e) => field("issueDate", e.target.value)} />
            </span>
            <span>
              <label className="cc-label" htmlFor="due_date">Due</label>
              <input id="due_date" name="due_date" type="date" className="cc-input"
                value={form.dueDate}
                onChange={(e) => field("dueDate", e.target.value)} />
            </span>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="payment_terms">Terms</label>
            <select id="payment_terms" name="payment_terms" className="cc-select"
              value={form.paymentTerms}
              onChange={(e) => applyTerm(e.target.value as PaymentTerm)}>
              {PAYMENT_TERMS.map((term) => (
                <option key={term} value={term}>{TERM_LABELS[term]}</option>
              ))}
            </select>
            <span className="cc-note">
              Choosing a term moves the due date to match. Type over it if this
              one is different.
            </span>
          </div>

          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="recurring_interval">Recurring lines billed</label>
              <select id="recurring_interval" name="recurring_interval" className="cc-select"
                value={form.recurringInterval}
                onChange={(e) => field("recurringInterval", e.target.value as "month" | "year")}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </span>
            <span>
              <label className="cc-label" htmlFor="recurring_starts_on">First recurring charge</label>
              <input id="recurring_starts_on" name="recurring_starts_on" type="date" className="cc-input"
                value={form.recurringStartsOn}
                onChange={(e) => field("recurringStartsOn", e.target.value)} />
            </span>
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="notes">Note to the client</label>
            <textarea id="notes" name="notes" className="cc-textarea" rows={2}
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="Printed on the invoice above the terms." />
          </div>

          <div className="cc-field">
            <label className="cc-label" htmlFor="notes_internal">Internal notes (never shown to the client)</label>
            <textarea id="notes_internal" name="notes_internal" className="cc-textarea" rows={2}
              value={form.notesInternal}
              onChange={(e) => field("notesInternal", e.target.value)} />
          </div>
        </div>
      </section>

      {/* ── Lines ───────────────────────────────────────────────── */}
      <section className="cc-panel cc-s12">
        <div className="cc-panel-head">
          <IconLayers size={15} />
          <h2>What is being charged</h2>
          <span className="cc-sub">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
        </div>
        <div className="cc-panel-body">
          <div className="pr-addrow">
            {ITEM_KINDS.map((kind) => (
              <button key={kind} type="button" className="cc-btn" onClick={() => addLine(kind)}>
                <IconPlus size={12} /> {ITEM_KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          {lines.length === 0 ? (
            <p className="cc-note">
              Add a one-time line for the build, a monthly line for hosting, or
              both. An invoice can carry either on its own.
            </p>
          ) : (
            <div className="cc-scroll">
              <table className="cc-table dense pr-items">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Line</th>
                    <th>Detail</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const unit = Math.round(Number.parseFloat(line.unit_price || "0") * 100) || 0;
                    return (
                      <tr key={line.key}>
                        <td>
                          <select className="cc-select" value={line.item_kind}
                            onChange={(e) => patchLine(line.key, { item_kind: e.target.value as InvoiceItemKind })}>
                            {ITEM_KINDS.map((kind) => (
                              <option key={kind} value={kind}>{ITEM_KIND_LABELS[kind]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="cc-input" value={line.title}
                            onChange={(e) => patchLine(line.key, { title: e.target.value })}
                            placeholder="Seven-page website build" />
                        </td>
                        <td>
                          <input className="cc-input" value={line.description}
                            onChange={(e) => patchLine(line.key, { description: e.target.value })}
                            placeholder="One sentence of detail" />
                        </td>
                        <td className="num">
                          <input className="cc-input" inputMode="decimal" value={String(line.quantity)}
                            onChange={(e) => patchLine(line.key, { quantity: Number.parseFloat(e.target.value) || 0 })}
                            style={{ width: 62 }} />
                        </td>
                        <td className="num">
                          <input className="cc-input" inputMode="decimal" value={line.unit_price}
                            onChange={(e) => patchLine(line.key, { unit_price: e.target.value })}
                            style={{ width: 90 }} placeholder="0" />
                        </td>
                        <td className="num">
                          {line.item_kind === "discount" ? "−" : ""}
                          {formatMoney(Math.round(line.quantity * unit))}
                        </td>
                        <td>
                          <button type="button" className="cc-btn" onClick={() => removeLine(line.key)}
                            aria-label="Remove line">
                            <IconX size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pr-total">
            <div><span>Subtotal</span><b>{formatMoney(totals.subtotalCents)}</b></div>
            {totals.discountCents > 0 ? (
              <div><span>Discount</span><b>−{formatMoney(totals.discountCents)}</b></div>
            ) : null}
            <div className="is-total"><span>Amount due</span><b>{formatMoney(totals.totalCents)}</b></div>
            <div className="is-due">
              <span>Then recurring</span>
              <b>
                {totals.recurringCents > 0
                  ? `${formatMoney(totals.recurringCents)}/${form.recurringInterval === "year" ? "yr" : "mo"}`
                  : "—"}
              </b>
            </div>
          </div>
        </div>
      </section>

      {/* ── Terms ───────────────────────────────────────────────── */}
      <section className="cc-panel cc-s12">
        <div className="cc-panel-head">
          <IconDollar size={15} />
          <h2>Terms and footer</h2>
          <span className="cc-sub">Printed at the bottom of the invoice</span>
        </div>
        <div className="cc-panel-body">
          <div className="cc-field">
            <label className="cc-label" htmlFor="terms">Payment terms</label>
            <textarea id="terms" name="terms" className="cc-textarea" rows={3}
              value={form.terms}
              onChange={(e) => field("terms", e.target.value)} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="footer_note">Closing line</label>
            <input id="footer_note" name="footer_note" className="cc-input"
              value={form.footerNote}
              onChange={(e) => field("footerNote", e.target.value)} />
          </div>
          <input type="hidden" name="description" value={form.description} />
        </div>
      </section>

      <section className="cc-panel cc-s12">
        <div className="cc-panel-body pr-actions">
          <button type="submit" className="cc-btn primary">
            {form.id ? "Save invoice" : "Create invoice"}
          </button>
          <Link href={form.id ? `/admin/invoices/${form.id}` : "/admin/invoices"} className="cc-btn">
            Cancel
          </Link>
          <span className="cc-note" style={{ marginTop: 0 }}>
            Saving does not send anything. The client sees nothing until you
            send it — by email, or by copying the link and sending it yourself.
          </span>
        </div>
      </section>
    </form>
  );
}
