import {
  INVOICE_SLOTS, buildInvoiceEmail, buildInvoiceReceiptEmail, buildInvoiceReminderEmail, buildAdminInvoiceEmail,
} from "@/lib/invoices/email-content";
import type { Invoice, InvoiceItem } from "@/lib/invoices/types";
import type { SystemEmailDef } from "../types";

/** Sample data for previews. Never sent anywhere. */
const SAMPLE_INVOICE = {
  id: "sample", invoice_number: "INV-2026-0042", title: "Website build & launch",
  client_business_name: "Hill Country Roofing", client_contact_name: "Dana Ortiz", client_email: "dana@example.com",
  issue_date: "2026-11-18", due_date: "2026-12-02", currency: "USD",
  subtotal_cents: 150000, discount_cents: 0, total_cents: 150000, amount_paid_cents: 0,
  recurring_cents: 4900, recurring_interval: "month", recurring_starts_on: "2026-12-02",
} as unknown as Invoice;

const SAMPLE_ITEMS = [
  { id: "1", invoice_id: "sample", item_kind: "one_time", title: "Website design & build", description: null, quantity: 1, unit_price_cents: 120000, total_price_cents: 120000, sort_order: 0, created_at: "" },
  { id: "2", invoice_id: "sample", item_kind: "one_time", title: "Launch & setup", description: null, quantity: 1, unit_price_cents: 30000, total_price_cents: 30000, sort_order: 1, created_at: "" },
  { id: "3", invoice_id: "sample", item_kind: "recurring", title: "Website Hosting & Management", description: null, quantity: 1, unit_price_cents: 4900, total_price_cents: 4900, sort_order: 2, created_at: "" },
] as unknown as InvoiceItem[];

const URL = "https://www.tomorrowstechai.com/invoice/sample";
const common = [
  { name: "greeting", label: "\"Hi Dana,\" (or \"Hi,\" with no name)", sample: "Hi Dana," },
  { name: "first_name", label: "Client's first name", sample: "Dana" },
  { name: "invoice_number", label: "Invoice number", sample: "INV-2026-0042" },
  { name: "title", label: "Invoice title", sample: "Website build & launch" },
  { name: "business_name", label: "Client business", sample: "Hill Country Roofing" },
];

export const INVOICE_EMAILS: SystemEmailDef[] = [
  {
    key: "invoice.sent", module: "Invoices", name: "Invoice", audience: "client",
    trigger: "You press Email to client on an invoice.",
    slots: INVOICE_SLOTS.sent,
    vars: [...common,
      { name: "amount_due", label: "Amount due now", sample: "$1,500" },
      { name: "monthly", label: "Monthly amount", sample: "$49/month" },
      { name: "due_date", label: "Due date", sample: "Dec 2, 2026" }],
    preview: (copy) => buildInvoiceEmail(SAMPLE_INVOICE, SAMPLE_ITEMS, URL, null, copy),
  },
  {
    key: "invoice.receipt", module: "Invoices", name: "Payment receipt", audience: "client",
    trigger: "A payment lands on an invoice (card or recorded by hand with 'email a receipt').",
    slots: INVOICE_SLOTS.receipt,
    vars: [...common,
      { name: "amount_paid", label: "Amount just paid", sample: "$1,500" },
      { name: "amount_remaining", label: "Balance left", sample: "$0" }],
    preview: (copy) => buildInvoiceReceiptEmail({ ...SAMPLE_INVOICE, amount_paid_cents: 150000 } as Invoice, 150000, URL, null, copy),
  },
  {
    key: "invoice.reminder", module: "Invoices", name: "Overdue reminder", audience: "client",
    trigger: "You press Send reminder on an overdue invoice.",
    slots: INVOICE_SLOTS.reminder,
    vars: [...common,
      { name: "amount_due", label: "Amount still due", sample: "$1,500" },
      { name: "late_line", label: "When it was due, in words", sample: "It was due on Dec 2, 2026, which is 5 days ago." },
      { name: "days_late", label: "Days late", sample: "5" },
      { name: "due_date", label: "Due date", sample: "Dec 2, 2026" }],
    preview: (copy) => buildInvoiceReminderEmail(SAMPLE_INVOICE, SAMPLE_ITEMS, URL, 5, copy),
  },
  {
    key: "invoice.owner", module: "Invoices", name: "To you: invoice paid / opened", audience: "owner",
    trigger: "A client pays (in full or in part). Switch it on or off on Notifications.",
    slots: INVOICE_SLOTS.admin,
    vars: [{ name: "client", label: "Client name", sample: "Hill Country Roofing" }, ...common.filter((v) => v.name === "invoice_number")],
    preview: (copy) => buildAdminInvoiceEmail("paid", { ...SAMPLE_INVOICE, amount_paid_cents: 150000 } as Invoice, "Stripe collected 1500.00 USD.", copy),
  },
];
