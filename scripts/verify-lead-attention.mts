/**
 * Lead-attention rule tests.
 *
 *   node --experimental-strip-types scripts/verify-lead-attention.mts
 *
 * The sidebar badge, the Alerts bell and the AI insights card all count
 * "leads that need me" with leadAttention(). These pin the rule down so the
 * three can't drift apart again. No network, no database.
 */
import { FIRST_CONTACT_HOURS, leadAttention } from "../src/lib/leads/attention.ts";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) { console.log(`  ok   ${name}`); passed++; }
  else { console.log(`  FAIL ${name}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`); failed++; }
}

const now = Date.UTC(2026, 10, 17, 15, 0, 0);
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const lead = (id: string, created: number, contacted: number | null, followup: number | null) => ({
  id,
  created_at: hoursAgo(created),
  last_contacted_at: contacted === null ? null : hoursAgo(contacted),
  next_followup_at: followup === null ? null : hoursAgo(followup),
});

console.log("\n── first contact ──");
{
  const a = leadAttention([lead("fresh", FIRST_CONTACT_HOURS - 1, null, null)], now);
  ok("a lead inside the first-contact window is not flagged", a.total === 0, a);
  const b = leadAttention([lead("waiting", FIRST_CONTACT_HOURS + 1, null, null)], now);
  ok("an uncontacted lead past the window is flagged", b.total === 1 && b.uncontacted[0] === "waiting", b);
  const c = leadAttention([lead("called", 200, 100, null)], now);
  ok("a contacted lead with no follow-up date is not flagged", c.total === 0, c);
}

console.log("\n── follow-ups ──");
{
  const a = leadAttention([lead("due", 200, 100, 1)], now);
  ok("a follow-up date in the past is flagged", a.total === 1 && a.followupsDue[0] === "due", a);
  const b = leadAttention([lead("later", 200, 100, -24)], now);
  ok("a follow-up date in the future is not flagged", b.total === 0, b);
}

console.log("\n── one lead, one count ──");
{
  const a = leadAttention([lead("both", 200, null, 5)], now);
  ok("uncontacted AND past follow-up counts once in total", a.total === 1, a);
  ok("…but appears in both breakdowns", a.uncontacted.length === 1 && a.followupsDue.length === 1, a);
  const b = leadAttention([lead("x", 200, null, null), lead("y", 200, 50, 2), lead("z", 1, null, null)], now);
  ok("mixed set totals the distinct flagged leads", b.total === 2, b);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
