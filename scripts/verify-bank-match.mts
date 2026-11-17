/**
 * Bank-deposit → client attribution tests.
 *
 *   node --experimental-strip-types scripts/verify-bank-match.mts
 *
 * The Clients page credits Mercury deposits to clients by name. These pin the
 * matching down. No network, no database.
 */
import { bankClientRevenue } from "../src/lib/clients/bank-match.ts";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) { console.log(`  ok   ${name}`); passed++; }
  else { console.log(`  FAIL ${name}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ""}`); failed++; }
}

const LINES = ["launch_package", "hosting", "other"] as const;
const txn = (counterparty: string | null, category: string | null, cents: number, extra: Partial<{ status: string; financeClass: string }> = {}) => ({
  date: "2026-11-13", amountCents: cents, status: "sent", counterparty, category, financeClass: "revenue", ...extra,
});
const customers = [
  { id: "romar", name: "Marilyn Robitaille, Ph.D.", business_name: "ROMAR Press" },
  { id: "temple", name: "JT Grimm", business_name: "Temple Outdoor Living" },
];
const services = [
  { customer_id: "romar", status: "ended", catalog_items: { category: "launch_package" } },
  { customer_id: "romar", status: "active", catalog_items: [{ category: "hosting" }] },
];

console.log("\n── matching ──");
{
  const r = bankClientRevenue([txn("Romar Press", "RomarPress Subscription", 23227)], customers, services, LINES);
  ok("counterparty matches the business name regardless of case and spacing", r.length === 1 && r[0].customer_id === "romar", r);
  ok("filed under the client's active service line", r[0]?.category === "hosting", r);
  ok("amount carried through", r[0]?.amount_cents === 23227, r);
  const c = bankClientRevenue([txn("ACH deposit", "Temple Outdoor Living invoice", 5000)], customers, services, LINES);
  ok("Mercury category can carry the match", c.length === 1 && c[0].customer_id === "temple", c);
  ok("a client with no service files under other", c[0]?.category === "other", c);
  const s = bankClientRevenue([txn("Stripe", "Dark Tides Supply Sales", 3717)], customers, services, LINES);
  ok("store sales through Stripe are not client revenue", s.length === 0, s);
}

console.log("\n── what counts ──");
{
  const r = bankClientRevenue([
    txn("Romar Press", null, 100, { status: "pending" }),
    txn("Romar Press", null, 100, { financeClass: "transfer" }),
    txn("Romar Press", null, -100),
  ], customers, services, LINES);
  ok("pending, transfers and outflows are skipped", r.length === 0, r);
  const twin = bankClientRevenue([txn("Romar Press", null, 100)], [...customers, { id: "dup", name: null, business_name: "Romar Press LLC" }], services, LINES);
  ok("a deposit two clients could claim is left unattributed", twin.length === 0, twin);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
