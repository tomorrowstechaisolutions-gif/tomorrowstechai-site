import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cancelPendingFollowups } = vi.hoisted(() => ({ cancelPendingFollowups: vi.fn(async () => {}) }));
vi.mock("@/lib/campaign/intake", () => ({ cancelPendingFollowups }));

import { becomeClient } from "../become-client";

/**
 * A tiny in-memory stand-in for the Supabase query builder: just the calls
 * becomeClient makes (select / insert / update with eq, is, ilike, limit,
 * order, maybeSingle, single). Every write is recorded so a test can assert
 * on exactly what was changed.
 */
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables, opts: { failInsert?: string } = {}) {
  const writes: { table: string; op: "insert" | "update"; values: Row; matched: number }[] = [];
  let nextId = 1;

  function from(table: string) {
    const rows = (tables[table] ??= []);
    let op: "select" | "insert" | "update" = "select";
    let values: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let inserted: Row | null = null;

    const run = () => {
      if (op === "insert") {
        if (opts.failInsert === table) return { data: null, error: { message: "boom", code: "XX000" } };
        inserted = { id: `${table}-${nextId++}`, ...values };
        rows.push(inserted);
        writes.push({ table, op, values, matched: 1 });
        return { data: [inserted], error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, values);
        writes.push({ table, op, values, matched: matched.length });
      }
      return { data: matched, error: null };
    };

    const q = {
      select: () => q,
      insert: (v: Row) => { op = "insert"; values = v; return q; },
      update: (v: Row) => { op = "update"; values = v; return q; },
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return q; },
      is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return q; },
      ilike: (col: string, val: string) => {
        const want = val.replace(/\\(.)/g, "$1").toLowerCase();
        filters.push((r) => String(r[col] ?? "").toLowerCase() === want);
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return q;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from } as any, writes, tables };
}

const lead = (over: Row = {}): Row => ({
  id: "lead-1", first_name: "Ana", last_name: "Reyes", email: "ana@example.com",
  phone: "555", business_name: "Reyes Roofing", lead_status: "Contacted", ...over,
});

beforeEach(() => cancelPendingFollowups.mockClear());

describe("becomeClient", () => {
  it("creates the client from the lead, closes the lead and cancels follow-ups", async () => {
    const { db, tables } = fakeDb({ leads: [lead()], customers: [], lead_events: [], invoices: [], proposals: [], deals: [] });

    const result = await becomeClient(db, { leadId: "lead-1", actor: "stripe", note: "Paid." });

    expect(result.created).toBe(true);
    expect(tables.customers).toHaveLength(1);
    expect(tables.customers[0]).toMatchObject({
      lead_id: "lead-1", name: "Ana Reyes", business_name: "Reyes Roofing", email: "ana@example.com", status: "active",
    });
    expect(tables.leads[0].lead_status).toBe("Won");
    expect(tables.leads[0].closed_at).toEqual(expect.any(String));
    expect(tables.lead_events).toHaveLength(1);
    expect(tables.lead_events[0]).toMatchObject({ lead_id: "lead-1", body: "Paid.", actor: "stripe" });
    expect(cancelPendingFollowups).toHaveBeenCalledWith("lead-1", "status:Won");
  });

  it("is safe to run twice: one client, one timeline note", async () => {
    const { db, tables } = fakeDb({ leads: [lead()], customers: [], lead_events: [], invoices: [], proposals: [], deals: [] });

    const first = await becomeClient(db, { leadId: "lead-1", actor: "stripe", note: "Paid." });
    const second = await becomeClient(db, { leadId: "lead-1", actor: "stripe", note: "Paid." });

    expect(second.customerId).toBe(first.customerId);
    expect(second.created).toBe(false);
    expect(tables.customers).toHaveLength(1);
    expect(tables.lead_events).toHaveLength(1);
  });

  it("finds an existing client by email instead of creating a second one", async () => {
    const { db, tables } = fakeDb({
      leads: [], lead_events: [], invoices: [], proposals: [], deals: [],
      customers: [{ id: "cust-9", email: "Owner@Example.com", lead_id: null }],
    });

    const result = await becomeClient(db, {
      email: "owner@example.com", matchByEmail: true, actor: "stripe", note: "Invoice paid.",
    });

    expect(result).toEqual({ customerId: "cust-9", created: false });
    expect(tables.customers).toHaveLength(1);
  });

  it("does not match by email unless asked to", async () => {
    const { db, tables } = fakeDb({
      leads: [], lead_events: [], invoices: [], proposals: [], deals: [],
      customers: [{ id: "cust-9", email: "owner@example.com", lead_id: null }],
    });

    const result = await becomeClient(db, { email: "owner@example.com", actor: "a", note: "n" });

    expect(result.created).toBe(true);
    expect(tables.customers).toHaveLength(2);
  });

  it("links the lead's unowned invoices, proposals and deals to the client", async () => {
    const { db, tables } = fakeDb({
      leads: [lead()], customers: [], lead_events: [],
      invoices: [
        { id: "inv-1", lead_id: "lead-1", customer_id: null },
        { id: "inv-2", lead_id: "lead-1", customer_id: "someone-else" },
        { id: "inv-3", lead_id: "other-lead", customer_id: null },
      ],
      proposals: [{ id: "p-1", lead_id: "lead-1", customer_id: null }],
      deals: [{ id: "d-1", lead_id: "lead-1", customer_id: null, stage: "proposal" }],
    });

    const { customerId } = await becomeClient(db, { leadId: "lead-1", actor: "a", note: "n" });

    expect(tables.invoices.map((i) => i.customer_id)).toEqual([customerId, "someone-else", null]);
    expect(tables.proposals[0].customer_id).toBe(customerId);
    expect(tables.deals[0].customer_id).toBe(customerId);
    // Linking a deal is not winning it: only a named deal is won.
    expect(tables.deals[0].stage).toBe("proposal");
  });

  it("wins the named deal", async () => {
    const { db, tables } = fakeDb({
      leads: [lead()], customers: [], lead_events: [], invoices: [], proposals: [],
      deals: [{ id: "d-1", lead_id: "lead-1", customer_id: null, stage: "proposal" }],
    });

    await becomeClient(db, { leadId: "lead-1", dealId: "d-1", actor: "a", note: "n" });

    expect(tables.deals[0].stage).toBe("won");
    expect(tables.deals[0].won_at).toEqual(expect.any(String));
  });

  it("leaves an already-Won lead's timeline alone but still cancels follow-ups", async () => {
    const { db, tables } = fakeDb({
      leads: [lead({ lead_status: "Won" })], customers: [], lead_events: [], invoices: [], proposals: [], deals: [],
    });

    await becomeClient(db, { leadId: "lead-1", actor: "a", note: "n" });

    expect(tables.lead_events).toHaveLength(0);
    expect(cancelPendingFollowups).toHaveBeenCalledTimes(1);
  });

  it("ignores a lead id that matches no row rather than writing a dangling key", async () => {
    const { db, tables } = fakeDb({ leads: [], customers: [], lead_events: [], invoices: [], proposals: [], deals: [] });

    const result = await becomeClient(db, { leadId: "gone", email: "x@example.com", actor: "a", note: "n" });

    expect(result.created).toBe(true);
    expect(tables.customers[0].lead_id).toBeNull();
    expect(cancelPendingFollowups).not.toHaveBeenCalled();
  });

  it("throws when the client cannot be created, so the caller can retry", async () => {
    const { db } = fakeDb(
      { leads: [lead()], customers: [], lead_events: [], invoices: [], proposals: [], deals: [] },
      { failInsert: "customers" }
    );

    await expect(becomeClient(db, { leadId: "lead-1", actor: "a", note: "n" })).rejects.toThrow(/client record/);
  });
});
