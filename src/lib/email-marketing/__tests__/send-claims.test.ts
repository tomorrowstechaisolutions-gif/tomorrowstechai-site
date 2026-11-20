import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The claim / resume / reap rules in send.ts.
 *
 * These are the rules that decide whether somebody gets one email, two, or
 * none, so they are tested against a fake database rather than trusted. The
 * provider is mocked: nothing in this file can reach the network.
 */

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

// send.ts and its neighbours import "server-only", which throws outside a
// React server build. It guards a bundling mistake, not behaviour.
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/settings/profile-store", () => ({ primeBrand: async () => {} }));
vi.mock("../audience", () => ({ resolveAudience: vi.fn() }));
vi.mock("../render", () => ({
  canSend: () => true,
  preSendChecks: () => [],
  personalize: (text: string) => text,
  renderCampaignHtml: () => "<p>hello</p>",
  renderCampaignText: () => "hello",
}));
vi.mock("../unsubscribe", () => ({
  campaignUnsubscribeUrl: (id: string) => `https://example.test/u/${id}`,
  sequenceUnsubscribeUrl: (id: string) => `https://example.test/s/${id}`,
  listUnsubscribeHeaders: () => ({}),
}));

import { reapStaleRecipients, runDueCampaigns, runDueSequenceSteps, sendCampaign } from "../send";

/* ── A small in-memory stand-in for the Supabase query builder ───────── */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class FakeDb {
  /** Runs just before an update is applied — used to play "another run got there first". */
  beforeUpdate: ((table: string, patch: Row) => void) | null = null;

  constructor(public tables: Tables) {}

  from(table: string) {
    this.tables[table] ??= [];
    return new FakeQuery(this, table);
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }
}

class FakeQuery {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" = "select";
  private patch: Row = {};
  private inserted: Row[] = [];
  private returning = false;
  private countOnly = false;
  private max: number | null = null;
  private one = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.countOnly = Boolean(options?.head);
    else this.returning = true;
    return this;
  }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.inserted = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[]) { return this.insert(rows); }

  private where(column: string, test: (value: unknown) => boolean) {
    // Filters on an embedded table ("email_sequences.status") are not modelled.
    if (!column.includes(".")) this.filters.push((row) => test(row[column]));
    return this;
  }
  eq(column: string, value: unknown) { return this.where(column, (v) => v === value); }
  neq(column: string, value: unknown) { return this.where(column, (v) => v !== value); }
  in(column: string, values: unknown[]) { return this.where(column, (v) => values.includes(v)); }
  // Like Postgres, a null never satisfies a comparison.
  lte(column: string, value: string) { return this.where(column, (v) => typeof v === "string" && v <= value); }
  lt(column: string, value: string) { return this.where(column, (v) => typeof v === "string" && v < value); }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }

  private run(): { data: unknown; error: null; count: number | null } {
    if (this.op === "insert") {
      this.db.rows(this.table).push(...this.inserted.map((row) => ({ ...row })));
      return { data: this.returning ? this.inserted : null, error: null, count: null };
    }

    if (this.op === "update") this.db.beforeUpdate?.(this.table, this.patch);

    let matched = this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row)));
    if (this.max !== null) matched = matched.slice(0, this.max);

    if (this.op === "update") {
      // The touch trigger: every update stamps updated_at.
      for (const row of matched) Object.assign(row, this.patch, { updated_at: new Date().toISOString() });
      const data = this.returning ? matched.map((row) => ({ ...row })) : null;
      return { data: this.one ? (matched[0] ?? null) : data, error: null, count: null };
    }

    if (this.countOnly) return { data: null, error: null, count: matched.length };
    const copies = matched.map((row) => ({ ...row }));
    return { data: this.one ? (copies[0] ?? null) : copies, error: null, count: null };
  }

  then<T>(resolve: (value: { data: unknown; error: null; count: number | null }) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

const asClient = (db: FakeDb) => db as unknown as SupabaseClient;

/* ── Fixtures ────────────────────────────────────────────────────────── */

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function campaign(overrides: Row = {}): Row {
  return {
    id: "c1", name: "Autumn offer", status: "sending", subject: "Hello",
    preview_text: null, from_name: "TTAI", from_email: "hello@example.test", reply_to: null,
    blocks: [], tone: "default", audience_id: "a1", approval_mode: "none",
    approval_status: "not_required", customer_id: null, owner: null, sending_domain_id: null,
    scheduled_at: null, started_sending_at: minutesAgo(30),
    ...overrides,
  };
}

function recipient(id: string, status: string, overrides: Row = {}): Row {
  return {
    id, campaign_id: "c1", email: `${id}@example.test`, first_name: null, last_name: null,
    company: null, lead_id: null, status, updated_at: minutesAgo(1),
    ...overrides,
  };
}

const sentTo = () => sendMock.mock.calls.map((call) => (call[0] as { to: string }).to);
const statusOf = (db: FakeDb, id: string) =>
  db.rows("email_campaign_recipients").find((row) => row.id === id)?.status;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  let n = 0;
  sendMock.mockReset();
  sendMock.mockImplementation(async () => ({ data: { id: `msg_${++n}` }, error: null }));
});

/* ── Tests ───────────────────────────────────────────────────────────── */

describe("runDueCampaigns", () => {
  it("resumes a campaign that an earlier run left in 'sending'", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign({ status: "sending" })],
      email_campaign_recipients: [recipient("r1", "sent"), recipient("r2", "pending"), recipient("r3", "pending")],
    });

    const result = await runDueCampaigns(asClient(db), 50);

    expect(result.examined).toBe(1);
    expect(sentTo()).toEqual(["r2@example.test", "r3@example.test"]);
    expect(result.summaries[0]).toMatchObject({ sent: 2, failed: 0, remaining: 0 });
    expect(db.rows("email_campaigns")[0].status).toBe("sent");
  });

  it("leaves a paused campaign and a not-yet-due scheduled one alone", async () => {
    const db = new FakeDb({
      email_campaigns: [
        campaign({ id: "c1", status: "paused" }),
        campaign({ id: "c2", status: "scheduled", scheduled_at: new Date(Date.now() + 3_600_000).toISOString() }),
      ],
      email_campaign_recipients: [recipient("r1", "pending")],
    });

    const result = await runDueCampaigns(asClient(db), 50);

    expect(result.examined).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("closes out a 'sending' campaign with nothing left, instead of re-examining it for ever", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign({ status: "sending" })],
      email_campaign_recipients: [recipient("r1", "sent"), recipient("r2", "failed")],
    });

    await runDueCampaigns(asClient(db), 50);

    expect(sendMock).not.toHaveBeenCalled();
    expect(db.rows("email_campaigns")[0].status).toBe("sent");
  });
});

describe("sendCampaign — the per-recipient claim", () => {
  it("does not send to a recipient another run claimed first", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign()],
      email_campaign_recipients: [recipient("r1", "pending"), recipient("r2", "pending")],
    });
    // Both runs read r1 as pending. The other one wins the race: by the time
    // our claim lands the row is already 'sending', so our update matches nothing.
    db.beforeUpdate = (table, patch) => {
      if (table !== "email_campaign_recipients" || patch.status !== "sending") return;
      const r1 = db.rows(table).find((row) => row.id === "r1")!;
      if (r1.status === "pending") r1.status = "sending";
    };

    const summary = await sendCampaign(asClient(db), "c1");

    expect(sentTo()).toEqual(["r2@example.test"]);
    expect(summary).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    // r1 belongs to the other run: not sent by us, not marked failed by us,
    // and still counted, so the campaign is not declared finished over it.
    expect(statusOf(db, "r1")).toBe("sending");
    expect(summary.remaining).toBe(1);
    expect(db.rows("email_campaigns")[0].status).toBe("sending");
  });

  it("gives each recipient its own idempotency key", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign()],
      email_campaign_recipients: [recipient("r1", "pending")],
    });

    await sendCampaign(asClient(db), "c1");

    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: "campaign-recipient/r1" });
  });

  it("stops at the deadline without claiming anything further", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign()],
      email_campaign_recipients: [recipient("r1", "pending"), recipient("r2", "pending")],
    });

    const summary = await sendCampaign(asClient(db), "c1", { deadline: Date.now() - 1 });

    expect(sendMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ attempted: 0, remaining: 2 });
    expect(statusOf(db, "r1")).toBe("pending");
    expect(db.rows("email_campaigns")[0].status).toBe("sending");
  });
});

describe("the stale-claim reaper", () => {
  it("returns an abandoned 'sending' row to pending and leaves a fresh claim alone", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign()],
      email_campaign_recipients: [
        recipient("stale", "sending", { updated_at: minutesAgo(20) }),
        recipient("fresh", "sending", { updated_at: minutesAgo(1) }),
        recipient("done", "sent", { updated_at: minutesAgo(20) }),
      ],
    });

    const reaped = await reapStaleRecipients(asClient(db), "c1");

    expect(reaped).toBe(1);
    expect(statusOf(db, "stale")).toBe("pending");
    expect(statusOf(db, "fresh")).toBe("sending");
    expect(statusOf(db, "done")).toBe("sent");
  });

  it("is run by sendCampaign, so the abandoned recipient is finally mailed", async () => {
    const db = new FakeDb({
      email_campaigns: [campaign()],
      email_campaign_recipients: [
        recipient("stale", "sending", { updated_at: minutesAgo(20) }),
        recipient("fresh", "sending", { updated_at: minutesAgo(1) }),
      ],
    });

    const summary = await sendCampaign(asClient(db), "c1");

    expect(sentTo()).toEqual(["stale@example.test"]);
    expect(statusOf(db, "stale")).toBe("sent");
    // The live claim is still somebody else's work in progress.
    expect(summary.remaining).toBe(1);
    expect(db.rows("email_campaigns")[0].status).toBe("sending");
  });
});

describe("runDueSequenceSteps — the enrollment lease", () => {
  const enrollment = (): Row => ({
    id: "e1", sequence_id: "s1", email: "lead@example.test", first_name: null, last_name: null,
    company: null, current_step: 0, lead_id: null, status: "active", next_send_at: minutesAgo(5),
    email_sequences: { id: "s1", name: "Nurture", status: "active", from_name: null, from_email: "hello@example.test", reply_to: null, customer_id: null, owner: null },
  });
  const step = (n: number): Row => ({
    id: `st${n}`, sequence_id: "s1", step_number: n, subject: `Step ${n}`, preview_text: null,
    blocks: [], delay_amount: 2, delay_unit: "days", status: "active",
  });

  it("sends the due step once and advances the enrollment", async () => {
    const db = new FakeDb({ email_sequence_enrollments: [enrollment()], email_sequence_steps: [step(1), step(2)] });

    const summary = await runDueSequenceSteps(asClient(db));

    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: "sequence-step/e1/1" });
    const row = db.rows("email_sequence_enrollments")[0];
    expect(row.current_step).toBe(1);
    expect(new Date(row.next_send_at as string).getTime()).toBeGreaterThan(Date.now() + 86_400_000);
  });

  it("skips an enrollment an overlapping run has already leased", async () => {
    const db = new FakeDb({ email_sequence_enrollments: [enrollment()], email_sequence_steps: [step(1), step(2)] });
    // The other run read the same due row and took the lease first.
    db.beforeUpdate = (table) => {
      if (table !== "email_sequence_enrollments") return;
      db.rows(table)[0].next_send_at = new Date(Date.now() + 600_000).toISOString();
    };

    const summary = await runDueSequenceSteps(asClient(db));

    expect(sendMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ sent: 0, failed: 0 });
    expect(db.rows("email_sequence_enrollments")[0].current_step).toBe(0);
  });
});
