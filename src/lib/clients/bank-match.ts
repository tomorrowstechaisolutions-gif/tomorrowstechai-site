import type { RevenueCategory } from "@/lib/supabase/types";

/**
 * Attributes Mercury deposits to clients.
 *
 * The bank feed knows who paid (counterparty, e.g. "Romar Press") and Mercury's
 * category (e.g. "RomarPress Subscription"), but not which client record that
 * is. A deposit belongs to a client when either name, squashed to lowercase
 * letters and digits, equals or contains the client's business or contact name.
 * Each match is filed under the client's service line from client_services
 * (the active one first); a client with no service files under "other".
 *
 * Pure and import-free at runtime (the valid service lines are passed in), so
 * scripts/verify-bank-match.mts can pin it down.
 */

type Txn = { date: string; amountCents: number; status: string; counterparty: string | null; category: string | null; financeClass: string };
type Customer = { id: string; name: string | null; business_name: string | null };
type Service = { customer_id: string; status: string; catalog_items: { category: string | null } | { category: string | null }[] | null };

export type ClientRevenue = {
  customer_id: string;
  category: RevenueCategory;
  amount_cents: number;
  occurred_at: string;
  description: string | null;
};

// Shorter names ("JT", "Ace") would match inside unrelated words.
const MIN_MATCH = 5;
const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Same rule Finance uses: a deposit counts once it clears.
const settled = (t: Txn) => t.status === "sent" || t.status === "posted" || t.status === "completed";
export function bankClientRevenue(
  txns: Txn[],
  customers: Customer[],
  services: Service[],
  serviceLines: readonly RevenueCategory[],
): ClientRevenue[] {
  const isCategory = (c: string | null | undefined): c is RevenueCategory =>
    !!c && (serviceLines as readonly string[]).includes(c);
  const keys = customers.map((c) => ({
    id: c.id,
    names: [squash(c.business_name), squash(c.name)].filter((n) => n.length >= MIN_MATCH),
  }));

  const lineOf = new Map<string, RevenueCategory>();
  // Active services win over paused or ended ones.
  for (const s of [...services].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))) {
    if (lineOf.has(s.customer_id)) continue;
    const item = Array.isArray(s.catalog_items) ? s.catalog_items[0] : s.catalog_items;
    if (isCategory(item?.category)) lineOf.set(s.customer_id, item.category);
  }

  const matchOf = (t: Txn) => {
    const labels = [squash(t.counterparty), squash(t.category)].filter(Boolean);
    const hit = keys.filter((k) => k.names.some((n) => labels.some((l) => l === n || l.includes(n) || (l.length >= MIN_MATCH && n.includes(l)))));
    // Two clients claiming one deposit is ambiguous: leave it unattributed.
    return hit.length === 1 ? hit[0].id : null;
  };

  const out: ClientRevenue[] = [];
  for (const t of txns) {
    if (t.financeClass !== "revenue" || !settled(t) || t.amountCents <= 0) continue;
    const id = matchOf(t);
    if (!id) continue;
    out.push({
      customer_id: id,
      category: lineOf.get(id) ?? "other",
      amount_cents: t.amountCents,
      occurred_at: `${t.date}T12:00:00.000Z`,
      description: t.category ?? t.counterparty,
    });
  }
  return out;
}
