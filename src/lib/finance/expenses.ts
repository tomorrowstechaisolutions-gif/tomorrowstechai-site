import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate } from "@/lib/time/chicago";
import { windows, type RangeKey } from "@/lib/finance/overview";
import { bankCandidates, BUSINESSES, CATEGORY_LABEL, type Business, type ExpenseCategory } from "@/lib/finance/receipts";

/**
 * Expenses page data.
 *
 * Two kinds of money out, never counted twice:
 *  - Mercury charges (bank feed, finance_class = expense). The bank is the
 *    record; a receipt can be attached to one.
 *  - Out-of-pocket expenses (paid_with = personal). Not in Mercury, so the
 *    expense itself is the record, and it's owed back to John until marked
 *    reimbursed.
 * Mercury-paid expenses with no matching bank line yet (just bought, not
 * posted) show in the list but don't add to totals until the charge lands.
 * Without a bank feed connected, every confirmed expense counts.
 */

export type ExpenseRow = {
  key: string;
  expenseId: string | null;
  bankId: string | null;
  date: string;
  vendor: string;
  description: string | null;
  category: string;
  business: Business | null;
  paidWith: "business" | "personal";
  amountCents: number;
  hasReceipt: boolean;
  reimbursedOn: string | null;
  counts: boolean;
  bankLink: string | null;
};

export type ReviewItem = {
  id: string;
  date: string;
  vendor: string | null;
  description: string | null;
  amountCents: number;
  taxCents: number | null;
  category: ExpenseCategory;
  business: Business;
  paidWith: "business" | "personal";
  bankId: string | null;
  receiptMime: string | null;
  receiptName: string | null;
  items: Array<{ name: string; quantity: number; amount_cents: number | null }>;
  notes: string | null;
  confidence: string | null;
  readError: string | null;
  candidates: Array<{ id: string; label: string }>;
};

export type ExpensesBoard = {
  range: RangeKey;
  bankMode: boolean;
  spentCents: number;
  personalCents: number;
  owed: Array<{ business: Business; cents: number; count: number }>;
  owedTotalCents: number;
  reviewCount: number;
  missingReceipts: number;
  review: ReviewItem[];
  rows: ExpenseRow[];
  byCategory: Array<{ label: string; cents: number }>;
  byBusiness: Array<{ business: Business; cents: number }>;
};

const settled = (s: string) => s === "sent" || s === "posted" || s === "completed";
const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function loadExpenses(sb: SupabaseClient, range: RangeKey): Promise<ExpensesBoard> {
  const { current } = windows(range, chicagoDate());
  const [exp, review, bank, accounts, owedQ] = await Promise.all([
    sb.from("expenses").select("id, occurred_at, vendor, description, category, business, paid_with, amount_cents, receipt_path, reimbursed_on, bank_transaction_id")
      .eq("review_status", "confirmed").gte("occurred_at", current.fromDate).lte("occurred_at", current.toDate),
    sb.from("expenses").select("id, occurred_at, vendor, description, category, business, paid_with, amount_cents, tax_cents, bank_transaction_id, receipt_mime, receipt_name, items, notes, ai_read")
      .eq("review_status", "needs_review").order("created_at", { ascending: true }),
    sb.from("bank_transactions").select("id, amount_cents, status, counterparty, bank_category, posted_at, bank_created_at, dashboard_link, finance_class")
      .eq("finance_class", "expense").lt("amount_cents", 0).order("bank_created_at", { ascending: false }).limit(2000),
    sb.from("bank_accounts").select("id").limit(1),
    sb.from("expenses").select("business, amount_cents").eq("paid_with", "personal").eq("review_status", "confirmed").is("reimbursed_on", null),
  ]);
  for (const r of [exp, review, owedQ]) if (r.error) throw new Error(r.error.message);
  const bankMode = Boolean(accounts.data?.length);

  const linkedBank = new Map<string, NonNullable<typeof exp.data>[number]>();
  for (const e of exp.data ?? []) if (e.bank_transaction_id) linkedBank.set(e.bank_transaction_id, e);

  const rows: ExpenseRow[] = [];
  const bankRows = bankMode ? (bank.data ?? []).filter((t) => settled(t.status)) : [];
  const bankIds = new Set(bankRows.map((t) => t.id));

  for (const t of bankRows) {
    const date = chicagoDate(new Date(t.posted_at ?? t.bank_created_at));
    if (date < current.fromDate || date > current.toDate) continue;
    const e = linkedBank.get(t.id);
    rows.push({
      key: `bank-${t.id}`,
      expenseId: e?.id ?? null,
      bankId: t.id,
      date,
      vendor: e?.vendor || t.counterparty || "Mercury charge",
      description: e?.description ?? t.bank_category ?? null,
      category: e ? CATEGORY_LABEL[e.category as ExpenseCategory] ?? cap(e.category) : t.bank_category ?? "Uncategorised",
      business: (e?.business as Business) ?? null,
      paidWith: "business",
      amountCents: Math.abs(t.amount_cents),
      hasReceipt: Boolean(e?.receipt_path),
      reimbursedOn: null,
      counts: true,
      bankLink: t.dashboard_link,
    });
  }
  for (const e of exp.data ?? []) {
    if (e.bank_transaction_id && bankIds.has(e.bank_transaction_id)) continue; // shown on its bank row
    const counts = !bankMode || e.paid_with === "personal";
    rows.push({
      key: `exp-${e.id}`,
      expenseId: e.id,
      bankId: null,
      date: e.occurred_at,
      vendor: e.vendor || "Expense",
      description: e.description,
      category: CATEGORY_LABEL[e.category as ExpenseCategory] ?? cap(e.category),
      business: e.business as Business,
      paidWith: e.paid_with as "business" | "personal",
      amountCents: e.amount_cents,
      hasReceipt: Boolean(e.receipt_path),
      reimbursedOn: e.reimbursed_on,
      counts,
      bankLink: null,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));

  const counted = rows.filter((r) => r.counts);
  const sum = (xs: ExpenseRow[]) => xs.reduce((t, r) => t + r.amountCents, 0);
  const group = <K extends string>(xs: ExpenseRow[], key: (r: ExpenseRow) => K) => {
    const m = new Map<K, number>();
    for (const r of xs) m.set(key(r), (m.get(key(r)) ?? 0) + r.amountCents);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const owedMap = new Map<Business, { cents: number; count: number }>();
  for (const o of owedQ.data ?? []) {
    const b = o.business as Business;
    const v = owedMap.get(b) ?? { cents: 0, count: 0 };
    owedMap.set(b, { cents: v.cents + o.amount_cents, count: v.count + 1 });
  }

  const reviewItems: ReviewItem[] = await Promise.all((review.data ?? []).map(async (e) => {
    const ai = (e.ai_read ?? {}) as { confidence?: string; error?: string };
    const cands = await bankCandidates(sb, e.amount_cents, e.occurred_at, e.id);
    const list = cands.map((c) => ({ id: c.id, label: `${c.counterparty ?? "Mercury"} · ${c.day} · $${(Math.abs(c.amount_cents) / 100).toFixed(2)}` }));
    // Keep the current link selectable even if it's outside the search window.
    if (e.bank_transaction_id && !list.some((c) => c.id === e.bank_transaction_id)) list.unshift({ id: e.bank_transaction_id, label: "Linked Mercury charge" });
    return {
      id: e.id,
      date: e.occurred_at,
      vendor: e.vendor,
      description: e.description,
      amountCents: e.amount_cents,
      taxCents: e.tax_cents,
      category: e.category as ExpenseCategory,
      business: e.business as Business,
      paidWith: e.paid_with as "business" | "personal",
      bankId: e.bank_transaction_id,
      receiptMime: e.receipt_mime,
      receiptName: e.receipt_name,
      items: Array.isArray(e.items) ? e.items : [],
      notes: e.notes,
      confidence: ai.confidence ?? null,
      readError: ai.error ?? null,
      candidates: list,
    };
  }));

  return {
    range,
    bankMode,
    spentCents: sum(counted),
    personalCents: sum(rows.filter((r) => r.paidWith === "personal")),
    owed: (Object.keys(BUSINESSES) as Business[]).filter((b) => owedMap.has(b)).map((b) => ({ business: b, ...owedMap.get(b)! })),
    owedTotalCents: [...owedMap.values()].reduce((t, v) => t + v.cents, 0),
    reviewCount: reviewItems.length,
    missingReceipts: rows.filter((r) => r.bankId && !r.hasReceipt).length,
    review: reviewItems,
    rows,
    byCategory: group(counted, (r) => r.category).map(([label, cents]) => ({ label, cents })),
    byBusiness: group(counted.filter((r) => r.business), (r) => r.business as Business).map(([business, cents]) => ({ business, cents })),
  };
}
