"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PACKAGE_TEMPLATES,
  PAYMENT_NOTE,
  templateByKey,
} from "@/lib/proposals/config";
import { computePricing, formatMoney } from "@/lib/proposals/pricing";
import type { ProposalItemType, ProposalSectionType } from "@/lib/proposals/types";
import type { LinkCandidate } from "@/lib/proposals/queries";
import { IconPlus, IconX, IconLayers, IconUsers, IconDollar, IconFile } from "./Icons";

/**
 * The proposal builder.
 *
 * Line items and prose sections are held in component state and posted as two
 * JSON fields rather than as fifty numbered inputs. The running total shown
 * here is a preview only — the server recomputes every figure from the same
 * function before anything is saved, so what is displayed can never become
 * what is quoted.
 *
 * There is no deposit field and no payment mode. A proposal states a price;
 * the invoice raised after the work is what asks for it.
 */

const ITEM_GROUPS: { type: ProposalItemType; label: string; priced: boolean; hint: string }[] = [
  { type: "scope", label: "Scope of work", priced: false, hint: "What is being built." },
  { type: "deliverable", label: "Deliverables", priced: false, hint: "What they receive." },
  { type: "page", label: "Pages", priced: false, hint: "Named pages in scope." },
  { type: "integration", label: "Integrations", priced: false, hint: "Third-party services being connected." },
  { type: "addon", label: "Add-ons", priced: true, hint: "Priced extras. Mark optional to show without charging." },
  { type: "recurring", label: "Recurring extras", priced: true, hint: "Shown for context; the monthly figure is set under Pricing." },
  { type: "exclusion", label: "Not included", priced: false, hint: "Said plainly, so the boundary is on the page." },
  { type: "client_responsibility", label: "What we need from the client", priced: false, hint: "Their side of the deal." },
  { type: "provider_responsibility", label: "What Tomorrow's Tech AI does", priced: false, hint: "Our side of the deal." },
];

const SECTION_TYPES: { type: ProposalSectionType; label: string }[] = [
  { type: "executive_summary", label: "Executive summary" },
  { type: "scope", label: "Scope narrative" },
  { type: "deliverables", label: "Deliverables narrative" },
  { type: "timeline", label: "Timeline" },
  { type: "pricing", label: "Pricing notes" },
  { type: "hosting", label: "Hosting notes" },
  { type: "ownership", label: "Ownership notes" },
  { type: "custom", label: "Custom section" },
];

export type BuilderItem = {
  key: string;
  item_type: ProposalItemType;
  title: string;
  description: string;
  quantity: number;
  unit_price: string;
  is_billable: boolean;
  is_optional: boolean;
};

export type BuilderSection = {
  key: string;
  section_type: ProposalSectionType;
  title: string;
  content: string;
  is_visible: boolean;
};

export type BuilderInitial = {
  id?: string;
  title: string;
  summary: string;
  packageKey: string;
  packageName: string;
  owner: string;
  clientBusinessName: string;
  clientContactName: string;
  clientEmail: string;
  clientPhone: string;
  clientTitle: string;
  clientBillingAddress: string;
  oneTimePrice: string;
  discountAmount: string;
  recurringPrice: string;
  recurringInterval: "month" | "year";
  turnaroundNote: string;
  revisionLimit: string;
  hostingNote: string;
  validUntil: string;
  notesInternal: string;
  leadId: string;
  customerId: string;
  dealId: string;
  items: BuilderItem[];
  sections: BuilderSection[];
};

let seq = 0;
const nextKey = () => `k${(seq += 1)}`;

/** Drops the client-only React key before a row is posted to the server. */
function payload<T extends { key: string }>(rows: T[]): Omit<T, "key">[] {
  return rows.map((row) => {
    const copy = { ...row } as Partial<T>;
    delete copy.key;
    return copy as Omit<T, "key">;
  });
}

function dollars(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : "";
}

export function itemsFromTemplate(key: string): BuilderItem[] {
  return templateByKey(key).items.map((item) => ({
    key: nextKey(),
    item_type: item.item_type,
    title: item.title,
    description: item.description ?? "",
    quantity: 1,
    unit_price: dollars(item.unit_price_cents ?? 0),
    is_billable: Boolean(item.is_billable),
    is_optional: Boolean(item.is_optional),
  }));
}

export default function ProposalBuilder({
  action,
  initial,
  leads,
  customers,
  deals,
  agreementLabel,
  locked,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial: BuilderInitial;
  leads: LinkCandidate[];
  customers: LinkCandidate[];
  deals: { id: string; label: string; leadId: string | null; companyId: string | null }[];
  agreementLabel: string | null;
  locked: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState<BuilderItem[]>(initial.items);
  const [sections, setSections] = useState<BuilderSection[]>(initial.sections);

  const field = <K extends keyof BuilderInitial>(key: K, value: BuilderInitial[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Fills the whole form from a package. Only ever on an explicit click. */
  const applyTemplate = (key: string) => {
    const template = templateByKey(key);
    setForm((prev) => ({
      ...prev,
      packageKey: template.key,
      packageName: template.name,
      title: prev.title || template.defaultTitle,
      summary: prev.summary || template.summary,
      oneTimePrice: dollars(template.oneTimeCents),
      recurringPrice: dollars(template.recurringCents),
      turnaroundNote: template.turnaroundNote ?? "",
      revisionLimit: template.revisionLimit === null ? "" : String(template.revisionLimit),
      hostingNote: template.hostingNote,
    }));
    setItems(itemsFromTemplate(key));
  };

  /** Copies a lead's or client's details onto the document. */
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

  const pricing = useMemo(() => {
    const parsed = items.map((item) => ({
      item_type: item.item_type,
      quantity: item.quantity,
      unit_price_cents: Math.round(Number.parseFloat(item.unit_price || "0") * 100) || 0,
      is_billable: item.is_billable,
      is_optional: item.is_optional,
    }));
    const discount = Math.round(Number.parseFloat(form.discountAmount || "0") * 100) || 0;
    if (discount > 0) {
      parsed.push({
        item_type: "discount",
        quantity: 1,
        unit_price_cents: discount,
        is_billable: true,
        is_optional: false,
      });
    }
    return computePricing({
      items: parsed,
      basePriceCents: Math.round(Number.parseFloat(form.oneTimePrice || "0") * 100) || 0,
      recurringCents: Math.round(Number.parseFloat(form.recurringPrice || "0") * 100) || 0,
    });
  }, [items, form.oneTimePrice, form.discountAmount, form.recurringPrice]);

  const addItem = (type: ProposalItemType) =>
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        item_type: type,
        title: "",
        description: "",
        quantity: 1,
        unit_price: "",
        is_billable: type === "addon" || type === "discount",
        is_optional: false,
      },
    ]);

  const patchItem = (key: string, patch: Partial<BuilderItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const removeItem = (key: string) => setItems((prev) => prev.filter((item) => item.key !== key));

  if (locked) {
    return (
      <div className="cc-error">
        This proposal has been signed and can no longer be edited. Duplicate it
        as a revision, or raise a change order.
      </div>
    );
  }

  return (
    <form action={action} className="cc-board pr-builder">
      {form.id ? <input type="hidden" name="proposal_id" value={form.id} /> : null}
      <input type="hidden" name="lead_id" value={form.leadId} />
      <input type="hidden" name="customer_id" value={form.customerId} />
      <input type="hidden" name="deal_id" value={form.dealId} />
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(payload(items.filter((item) => item.title.trim())))}
      />
      <input
        type="hidden"
        name="sections_json"
        value={JSON.stringify(payload(sections.filter((section) => section.title.trim())))}
      />

      {/* ── Package ─────────────────────────────────────────────── */}
      <section className="cc-panel cc-s12">
        <div className="cc-panel-head">
          <IconLayers size={15} />
          <h2>Package</h2>
          <span className="cc-sub">
            {agreementLabel
              ? `Agreement ${agreementLabel} will be attached`
              : "No published agreement — publish one in Settings first"}
          </span>
        </div>
        <div className="cc-panel-body">
          <div className="pr-templates">
            {PACKAGE_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                className={`pr-template ${form.packageKey === template.key ? "is-on" : ""}`}
                onClick={() => applyTemplate(template.key)}
              >
                <b>{template.name}</b>
                <span>
                  {template.oneTimeCents > 0 ? formatMoney(template.oneTimeCents) : "Priced per job"}
                  {template.recurringCents > 0 ? ` · ${formatMoney(template.recurringCents)}/mo` : ""}
                </span>
              </button>
            ))}
          </div>
          <p className="cc-note">
            Choosing a package fills in the scope, the pricing and the terms.
            Every one of them is editable afterwards — the template is a
            starting point, not a rule.
          </p>
          <input type="hidden" name="package_key" value={form.packageKey} />
          <div className="cc-field">
            <label className="cc-label" htmlFor="package_name">Package name on the document</label>
            <input
              id="package_name" name="package_name" className="cc-input"
              value={form.packageName}
              onChange={(e) => field("packageName", e.target.value)}
              placeholder="Classic Business Website"
            />
          </div>
        </div>
      </section>

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
            <label className="cc-label" htmlFor="pick_deal">Deal in the CRM</label>
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

          <p className="cc-note">
            Attaching is optional. The details below are what get printed on
            the proposal, and they are kept as written even if the CRM record
            is edited later.
          </p>

          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="client_business_name">Business name</label>
              <input id="client_business_name" name="client_business_name" className="cc-input"
                value={form.clientBusinessName}
                onChange={(e) => field("clientBusinessName", e.target.value)} />
            </span>
            <span>
              <label className="cc-label" htmlFor="client_contact_name">Contact name</label>
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
          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="client_title">Their title or role</label>
              <input id="client_title" name="client_title" className="cc-input"
                value={form.clientTitle}
                onChange={(e) => field("clientTitle", e.target.value)}
                placeholder="Owner" />
            </span>
            <span>
              <label className="cc-label" htmlFor="owner">Owned by</label>
              <input id="owner" name="owner" className="cc-input"
                value={form.owner}
                onChange={(e) => field("owner", e.target.value)} />
            </span>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="client_billing_address">Billing address</label>
            <textarea id="client_billing_address" name="client_billing_address" className="cc-textarea" rows={2}
              value={form.clientBillingAddress}
              onChange={(e) => field("clientBillingAddress", e.target.value)} />
          </div>
        </div>
      </section>

      {/* ── Project ─────────────────────────────────────────────── */}
      <section className="cc-panel cc-s6">
        <div className="cc-panel-head">
          <IconFile size={15} />
          <h2>The project</h2>
        </div>
        <div className="cc-panel-body">
          <div className="cc-field">
            <label className="cc-label" htmlFor="title">Proposal title</label>
            <input id="title" name="title" className="cc-input" required
              value={form.title}
              onChange={(e) => field("title", e.target.value)} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="summary">Executive summary</label>
            <textarea id="summary" name="summary" className="cc-textarea" rows={5}
              value={form.summary}
              onChange={(e) => field("summary", e.target.value)}
              placeholder="A paragraph in plain language: what they are getting and why it is the right thing for their business." />
          </div>
          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="turnaround_note">Turnaround</label>
              <input id="turnaround_note" name="turnaround_note" className="cc-input"
                value={form.turnaroundNote}
                onChange={(e) => field("turnaroundNote", e.target.value)}
                placeholder="7–14 days from content" />
            </span>
            <span>
              <label className="cc-label" htmlFor="revision_limit">Revision rounds</label>
              <input id="revision_limit" name="revision_limit" className="cc-input" inputMode="numeric"
                value={form.revisionLimit}
                onChange={(e) => field("revisionLimit", e.target.value.replace(/[^0-9]/g, ""))} />
            </span>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="valid_until">Open until</label>
            <input id="valid_until" name="valid_until" type="date" className="cc-input"
              value={form.validUntil}
              onChange={(e) => field("validUntil", e.target.value)} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="hosting_note">Hosting note</label>
            <textarea id="hosting_note" name="hosting_note" className="cc-textarea" rows={3}
              value={form.hostingNote}
              onChange={(e) => field("hostingNote", e.target.value)} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="notes_internal">Internal notes (never shown to the client)</label>
            <textarea id="notes_internal" name="notes_internal" className="cc-textarea" rows={3}
              value={form.notesInternal}
              onChange={(e) => field("notesInternal", e.target.value)} />
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <section className="cc-panel cc-s6">
        <div className="cc-panel-head">
          <IconDollar size={15} />
          <h2>Pricing</h2>
          <span className="cc-sub">Recomputed on the server before it saves</span>
        </div>
        <div className="cc-panel-body">
          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="one_time_price">Build price</label>
              <input id="one_time_price" name="one_time_price" className="cc-input" inputMode="decimal"
                value={form.oneTimePrice}
                onChange={(e) => field("oneTimePrice", e.target.value)}
                placeholder="399" />
            </span>
            <span>
              <label className="cc-label" htmlFor="discount_amount">Discount</label>
              <input id="discount_amount" name="discount_amount" className="cc-input" inputMode="decimal"
                value={form.discountAmount}
                onChange={(e) => field("discountAmount", e.target.value)}
                placeholder="0" />
            </span>
          </div>
          <div className="cc-field row2">
            <span>
              <label className="cc-label" htmlFor="recurring_price">Hosting</label>
              <input id="recurring_price" name="recurring_price" className="cc-input" inputMode="decimal"
                value={form.recurringPrice}
                onChange={(e) => field("recurringPrice", e.target.value)}
                placeholder="29" />
            </span>
            <span>
              <label className="cc-label" htmlFor="recurring_interval">Billed</label>
              <select id="recurring_interval" name="recurring_interval" className="cc-select"
                value={form.recurringInterval}
                onChange={(e) => field("recurringInterval", e.target.value as "month" | "year")}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </span>
          </div>
          <p className="cc-note">{PAYMENT_NOTE} Raise the invoice from this
          proposal when the work is done.</p>

          <div className="pr-total">
            <div><span>Subtotal</span><b>{formatMoney(pricing.subtotalCents)}</b></div>
            {pricing.discountCents > 0 ? (
              <div><span>Discount</span><b>−{formatMoney(pricing.discountCents)}</b></div>
            ) : null}
            <div className="is-total"><span>One-time total</span><b>{formatMoney(pricing.totalCents)}</b></div>
            <div>
              <span>Hosting</span>
              <b>
                {pricing.recurringCents > 0
                  ? `${formatMoney(pricing.recurringCents)}/${form.recurringInterval === "year" ? "yr" : "mo"}`
                  : "—"}
              </b>
            </div>
            <div className="is-due">
              <span>Due at signature</span>
              <b>Nothing</b>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sections ────────────────────────────────────────────── */}
      <section className="cc-panel cc-s6">
        <div className="cc-panel-head">
          <IconFile size={15} />
          <h2>Extra sections</h2>
          <span className="cc-sub">Optional prose blocks</span>
        </div>
        <div className="cc-panel-body">
          {sections.length === 0 ? (
            <p className="cc-note" style={{ marginTop: 0 }}>
              The proposal already prints the summary, scope, pricing, hosting,
              ownership and the full agreement. Add a section only when this
              particular client needs something the standard document does not
              say.
            </p>
          ) : null}

          {sections.map((section) => (
            <div key={section.key} className="pr-section-row">
              <div className="cc-field row2">
                <span>
                  <label className="cc-label">Heading</label>
                  <input className="cc-input" value={section.title}
                    onChange={(e) =>
                      setSections((prev) => prev.map((s) => s.key === section.key ? { ...s, title: e.target.value } : s))
                    } />
                </span>
                <span>
                  <label className="cc-label">Kind</label>
                  <select className="cc-select" value={section.section_type}
                    onChange={(e) =>
                      setSections((prev) => prev.map((s) => s.key === section.key
                        ? { ...s, section_type: e.target.value as ProposalSectionType } : s))
                    }>
                    {SECTION_TYPES.map((entry) => (
                      <option key={entry.type} value={entry.type}>{entry.label}</option>
                    ))}
                  </select>
                </span>
              </div>
              <textarea className="cc-textarea" rows={4} value={section.content}
                onChange={(e) =>
                  setSections((prev) => prev.map((s) => s.key === section.key ? { ...s, content: e.target.value } : s))
                } />
              <button type="button" className="cc-btn"
                onClick={() => setSections((prev) => prev.filter((s) => s.key !== section.key))}>
                <IconX size={12} /> Remove section
              </button>
            </div>
          ))}

          <button type="button" className="cc-btn"
            onClick={() =>
              setSections((prev) => [
                ...prev,
                { key: nextKey(), section_type: "custom", title: "", content: "", is_visible: true },
              ])
            }>
            <IconPlus size={13} /> Add a section
          </button>
        </div>
      </section>

      {/* ── Items ───────────────────────────────────────────────── */}
      <section className="cc-panel cc-s12">
        <div className="cc-panel-head">
          <IconLayers size={15} />
          <h2>Scope, deliverables and obligations</h2>
          <span className="cc-sub">{items.length} lines</span>
        </div>
        <div className="cc-panel-body">
          <div className="pr-addrow">
            {ITEM_GROUPS.map((group) => (
              <button key={group.type} type="button" className="cc-btn"
                onClick={() => addItem(group.type)} title={group.hint}>
                <IconPlus size={12} /> {group.label}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="cc-note">
              Pick a package above to load its standard scope, or add lines one
              at a time.
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
                    <th>Charged</th>
                    <th>Optional</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <select className="cc-select" value={item.item_type}
                          onChange={(e) => patchItem(item.key, { item_type: e.target.value as ProposalItemType })}>
                          {ITEM_GROUPS.map((group) => (
                            <option key={group.type} value={group.type}>{group.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="cc-input" value={item.title}
                          onChange={(e) => patchItem(item.key, { title: e.target.value })}
                          placeholder="Line title" />
                      </td>
                      <td>
                        <input className="cc-input" value={item.description}
                          onChange={(e) => patchItem(item.key, { description: e.target.value })}
                          placeholder="One sentence of detail" />
                      </td>
                      <td className="num">
                        <input className="cc-input" inputMode="decimal" value={String(item.quantity)}
                          onChange={(e) =>
                            patchItem(item.key, { quantity: Number.parseFloat(e.target.value) || 0 })
                          }
                          style={{ width: 62 }} />
                      </td>
                      <td className="num">
                        <input className="cc-input" inputMode="decimal" value={item.unit_price}
                          onChange={(e) => patchItem(item.key, { unit_price: e.target.value })}
                          style={{ width: 90 }} placeholder="0" />
                      </td>
                      <td>
                        <input type="checkbox" checked={item.is_billable}
                          onChange={(e) => patchItem(item.key, { is_billable: e.target.checked })}
                          aria-label="Counted in the total" />
                      </td>
                      <td>
                        <input type="checkbox" checked={item.is_optional}
                          onChange={(e) => patchItem(item.key, { is_optional: e.target.checked })}
                          aria-label="Shown but not charged" />
                      </td>
                      <td>
                        <button type="button" className="cc-btn" onClick={() => removeItem(item.key)}
                          aria-label="Remove line">
                          <IconX size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cc-note">
            Only lines with <b>Charged</b> ticked are added to the total, and an{" "}
            <b>Optional</b> line is printed on the proposal without being
            counted. Everything else is text on the page.
          </p>
        </div>
      </section>

      <section className="cc-panel cc-s12">
        <div className="cc-panel-body pr-actions">
          <button type="submit" className="cc-btn primary">
            {form.id ? "Save proposal" : "Create proposal"}
          </button>
          <Link href={form.id ? `/admin/proposals/${form.id}` : "/admin/proposals"} className="cc-btn">
            Cancel
          </Link>
          <span className="cc-note" style={{ marginTop: 0 }}>
            Saving does not send anything. The client sees nothing until you
            press Send on the proposal itself.
          </span>
        </div>
      </section>
    </form>
  );
}
