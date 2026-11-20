import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

/**
 * The Stripe webhook, end to end against an in-memory database.
 *
 * The case these exist for: a write fails halfway through, the route answers
 * 500, Stripe delivers the same event again, and the second run must finish
 * the job without booking anything twice.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => state.db,
  supabaseConfigured: () => true,
}));
vi.mock("@/lib/stripe/client", () => ({
  verifyStripeSignature: () => true,
  stripeWebhookConfigured: () => true,
}));
vi.mock("@/lib/meta/capi", () => ({ sendCapiEvent: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/campaign/intake", () => ({ cancelPendingFollowups: vi.fn(async () => {}) }));
vi.mock("@/lib/portal/emails", () => ({ sendBillingChangeAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/invoices/emails", () => ({ notifyAdminInvoice: vi.fn(async () => {}) }));

import { POST } from "../route";

function setup(tables: Tables) {
  const fake = fakeSupabase(tables);
  state.db = fake.db;
  return fake;
}

function deliver(event: unknown) {
  return POST(new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=x" },
    body: JSON.stringify(event),
  }));
}

const launchSession = (over: Record<string, unknown> = {}) => ({
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_launch",
      payment_status: "paid",
      amount_total: 39900,
      customer: "cus_1",
      subscription: "sub_1",
      customer_details: { email: "ana@example.com" },
      metadata: { lead_id: "lead-1", invoice_id: "inv-1", business_name: "Reyes Roofing" },
      ...over,
    },
  },
});

const launchTables = (): Tables => ({
  invoices: [{ id: "inv-1", status: "sent", lead_id: "lead-1", customer_id: null }],
  leads: [{
    id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com", phone: "555",
    business_name: "Reyes Roofing", campaign: null, utm_campaign: "launch-nov", lead_status: "Contacted",
  }],
  customers: [], revenue_events: [], lead_events: [], jobs: [], job_tasks: [], job_events: [], proposals: [], deals: [],
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("launch sale (checkout.session.completed)", () => {
  it("books the sale: client, revenue, lead won, job with its checklist, invoice paid", async () => {
    const { tables } = setup(launchTables());

    const res = await deliver(launchSession());

    expect(res.status).toBe(200);
    expect(tables.customers).toHaveLength(1);
    expect(tables.customers[0]).toMatchObject({ lead_id: "lead-1", stripe_customer_id: "cus_1", status: "active" });
    expect(tables.revenue_events).toHaveLength(1);
    expect(tables.revenue_events[0]).toMatchObject({ amount_cents: 39900, kind: "initial", campaign: "launch-nov" });
    expect(tables.leads[0].lead_status).toBe("Won");
    expect(tables.jobs).toHaveLength(1);
    expect(tables.job_tasks.length).toBeGreaterThan(0);
    expect(tables.invoices[0]).toMatchObject({ status: "paid", customer_id: tables.customers[0].id });
  });

  it("a failed write answers 500 and leaves the invoice unpaid, so Stripe retries", async () => {
    const { tables, failNext } = setup(launchTables());
    failNext("revenue_events", "upsert");

    const res = await deliver(launchSession());

    expect(res.status).toBe(500);
    expect(tables.invoices[0].status).toBe("sent");
    expect(tables.revenue_events).toHaveLength(0);
  });

  it("the retry after a failure finishes the job without doing anything twice", async () => {
    const { tables, failNext } = setup(launchTables());
    failNext("revenue_events", "upsert");
    await deliver(launchSession());

    const retry = await deliver(launchSession());

    expect(retry.status).toBe(200);
    expect(tables.invoices[0].status).toBe("paid");
    expect(tables.customers).toHaveLength(1);
    expect(tables.revenue_events).toHaveLength(1);
    expect(tables.jobs).toHaveLength(1);
    expect(tables.lead_events).toHaveLength(1);
  });

  it("a job opened without its checklist gets the checklist on the retry", async () => {
    const { tables, failNext } = setup(launchTables());
    failNext("job_tasks", "insert");
    const first = await deliver(launchSession());
    expect(first.status).toBe(500);
    expect(tables.jobs).toHaveLength(1);
    expect(tables.job_tasks).toHaveLength(0);

    const retry = await deliver(launchSession());

    expect(retry.status).toBe(200);
    expect(tables.jobs).toHaveLength(1);
    expect(tables.job_tasks.length).toBeGreaterThan(0);
  });

  it("a second delivery of a finished event changes nothing", async () => {
    const { tables } = setup(launchTables());
    await deliver(launchSession());
    const before = JSON.stringify(tables);

    const again = await deliver(launchSession());

    expect(again.status).toBe(200);
    expect(JSON.stringify(tables)).toBe(before);
  });

  it("does not book a session Stripe has not been paid for yet", async () => {
    const { tables } = setup(launchTables());

    const res = await deliver(launchSession({ payment_status: "unpaid" }));

    expect(res.status).toBe(200);
    expect(tables.customers).toHaveLength(0);
    expect(tables.revenue_events).toHaveLength(0);
    expect(tables.invoices[0].status).toBe("sent");
  });

  it("books it when the delayed payment succeeds", async () => {
    const { tables } = setup(launchTables());
    const event = launchSession();

    const res = await deliver({ ...event, type: "checkout.session.async_payment_succeeded" });

    expect(res.status).toBe(200);
    expect(tables.invoices[0].status).toBe("paid");
    expect(tables.revenue_events).toHaveLength(1);
  });

  it("ignores a checkout from another storefront on the shared Stripe account", async () => {
    const { tables } = setup(launchTables());

    const res = await deliver(launchSession({ metadata: {} }));

    expect(res.status).toBe(200);
    expect(tables.customers).toHaveLength(0);
    expect(tables.jobs).toHaveLength(0);
  });
});

const invoiceSession = (over: Record<string, unknown> = {}) => ({
  id: "evt_2",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_invoice",
      payment_status: "paid",
      amount_total: 6000,
      payment_intent: "pi_1",
      customer: "cus_2",
      subscription: null,
      metadata: { kind: "invoice", invoice_id: "inv-9" },
      ...over,
    },
  },
});

const invoiceTables = (invoice: Record<string, unknown> = {}): Tables => ({
  invoices: [{
    id: "inv-9", invoice_number: "INV-2026-0009", title: "Website build", status: "sent", total_cents: 6000,
    amount_paid_cents: 0, currency: "USD", lead_id: "lead-2", customer_id: null,
    client_business_name: "Grimm Outdoor", client_contact_name: "JT Grimm", client_email: "jt@example.com",
    recurring_cents: 0, recurring_interval: null, ...invoice,
  }],
  leads: [{
    id: "lead-2", first_name: "JT", last_name: "Grimm", email: "jt@example.com", phone: null,
    business_name: "Grimm Outdoor", lead_status: "Qualified",
  }],
  customers: [], revenue_events: [], lead_events: [], invoice_payments: [], invoice_events: [],
  client_services: [], proposals: [], deals: [],
});

describe("paying an invoice document", () => {
  it("makes the payer a client and links the invoice to them", async () => {
    const { tables } = setup(invoiceTables());

    const res = await deliver(invoiceSession());

    expect(res.status).toBe(200);
    expect(tables.customers).toHaveLength(1);
    expect(tables.customers[0]).toMatchObject({ lead_id: "lead-2", business_name: "Grimm Outdoor" });
    expect(tables.invoices[0].customer_id).toBe(tables.customers[0].id);
    expect(tables.leads[0].lead_status).toBe("Won");
    expect(tables.invoice_payments).toHaveLength(1);
    expect(tables.invoice_payments[0]).toMatchObject({ amount_cents: 6000, stripe_payment_intent: "pi_1" });
    expect(tables.revenue_events).toHaveLength(1);
    expect(tables.revenue_events[0].customer_id).toBe(tables.customers[0].id);
  });

  it("uses the existing client when the email already matches one", async () => {
    const tables0 = invoiceTables({ lead_id: null });
    tables0.customers.push({ id: "cust-existing", email: "JT@example.com", lead_id: null });
    const { tables } = setup(tables0);

    await deliver(invoiceSession());

    expect(tables.customers).toHaveLength(1);
    expect(tables.invoices[0].customer_id).toBe("cust-existing");
  });

  it("records the payment once across a failure and a retry", async () => {
    const { tables, failNext } = setup(invoiceTables());
    failNext("invoice_payments", "insert");

    const first = await deliver(invoiceSession());
    expect(first.status).toBe(500);
    expect(tables.invoice_payments).toHaveLength(0);

    const retry = await deliver(invoiceSession());

    expect(retry.status).toBe(200);
    expect(tables.invoice_payments).toHaveLength(1);
    expect(tables.revenue_events).toHaveLength(1);
    expect(tables.customers).toHaveLength(1);
  });

  it("a second delivery does not record a second payment", async () => {
    const { tables } = setup(invoiceTables());
    await deliver(invoiceSession());

    await deliver(invoiceSession());

    expect(tables.invoice_payments).toHaveLength(1);
    expect(tables.revenue_events).toHaveLength(1);
    expect(tables.invoice_events).toHaveLength(1);
  });

  it("splits a first recurring period out of the one-time revenue", async () => {
    const { tables } = setup(invoiceTables({ total_cents: 6000, recurring_cents: 4900, recurring_interval: "month" }));

    await deliver(invoiceSession({
      amount_total: 10900,
      subscription: "sub_9",
      metadata: { kind: "invoice", invoice_id: "inv-9", due_now_cents: "6000" },
    }));

    const byKind = Object.fromEntries(tables.revenue_events.map((r) => [r.kind, r.amount_cents]));
    expect(byKind).toEqual({ initial: 6000, recurring: 4900 });
  });
});
