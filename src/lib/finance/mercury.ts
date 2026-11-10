import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Mercury → bank_accounts / bank_transactions.
 *
 * Read-only: uses a Mercury API token created as "Read only" (Settings →
 * API tokens), stored server-side as MERCURY_API_TOKEN. Nothing here can move
 * money. Runs from /api/cron/bank-sync every few hours and from "Sync now".
 *
 * Classification (what Finance counts each row as):
 *   cancelled / failed            → ignore
 *   moves between your own money  → transfer  (Mercury↔Mercury, credit card
 *                                    payments, owner top-ups from personal
 *                                    checking, anything categorised "Transfer")
 *   other money in                → revenue
 *   other money out               → expense
 * An admin override (class_override) always wins and is never overwritten.
 */

const API = "https://api.mercury.com/api/v1";
const HISTORY_START = "2024-01-01";

export function mercuryConfigured(): boolean {
  return Boolean(process.env.MERCURY_API_TOKEN);
}

async function mercury<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.MERCURY_API_TOKEN}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Mercury refused the token (HTTP ${res.status}). Check MERCURY_API_TOKEN is a valid read-only token${/ip/i.test(body) ? " and that IP whitelisting is off for it" : ""}.`);
    }
    throw new Error(`Mercury ${path} failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type MercuryAccount = {
  id: string; name: string; nickname?: string | null; kind?: string; type?: string; status?: string;
  accountNumber?: string; availableBalance?: number; currentBalance?: number;
};
type MercuryTxn = {
  id: string; accountId?: string; amount: number; status: string; kind?: string;
  counterpartyName?: string; counterpartyNickname?: string | null; bankDescription?: string | null;
  note?: string | null; externalMemo?: string | null; mercuryCategory?: string | null;
  categoryData?: { name?: string | null } | null; postedAt?: string | null; createdAt: string; dashboardLink?: string;
};

const TRANSFER_KINDS = new Set(["internalTransfer", "treasuryTransfer", "creditCardCredit"]);
// Moves between the owner's own accounts: Mercury checking/credit/savings, or
// a personal bank like "USAA - Checking ••9753".
const OWN_MONEY = /mercury (checking|credit|savings|treasury)|^(to|from) mercury|(checking|savings)\s*[•·.*]{2}\s*\d{4}/i;

export function classify(t: { amount: number; status: string; kind?: string; counterparty?: string | null; category?: string | null; description?: string | null }): "revenue" | "expense" | "transfer" | "ignore" {
  if (t.status === "cancelled" || t.status === "failed") return "ignore";
  if (t.kind && TRANSFER_KINDS.has(t.kind)) return "transfer";
  if (/transfer/i.test(t.category ?? "")) return "transfer";
  if (OWN_MONEY.test(t.counterparty ?? "") || /credit account payment/i.test(t.description ?? "")) return "transfer";
  if (t.amount === 0) return "ignore";
  return t.amount > 0 ? "revenue" : "expense";
}

const cents = (dollars: number | undefined | null) => (typeof dollars === "number" ? Math.round(dollars * 100) : null);

export async function syncMercury(): Promise<{ accounts: number; transactions: number; inserted: number }> {
  if (!mercuryConfigured()) throw new Error("Mercury isn't connected. Add a read-only MERCURY_API_TOKEN in Vercel.");
  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  const { accounts } = await mercury<{ accounts: MercuryAccount[] }>("/accounts");
  // Mercury IO credit accounts live under a separate endpoint on some plans.
  const credit = await mercury<{ accounts?: MercuryAccount[] }>("/credit").then((r) => r.accounts ?? []).catch(() => [] as MercuryAccount[]);
  const all = [...accounts, ...credit.filter((c) => !accounts.some((a) => a.id === c.id)).map((c) => ({ ...c, kind: c.kind ?? "creditCard", name: c.name || "Mercury Credit" }))];

  const { error: accError } = await sb.from("bank_accounts").upsert(all.map((a) => ({
    id: a.id,
    source: "mercury",
    name: a.nickname || a.name,
    kind: a.kind ?? a.type ?? null,
    last4: a.accountNumber ? a.accountNumber.slice(-4) : null,
    available_cents: cents(a.availableBalance),
    current_cents: cents(a.currentBalance),
    status: a.status ?? null,
    synced_at: now,
  })), { onConflict: "id" });
  if (accError) throw new Error(accError.message);

  const { data: before } = await sb.from("bank_transactions").select("id");
  const known = new Set((before ?? []).map((r) => r.id as string));
  let total = 0;
  let inserted = 0;

  for (const account of all) {
    for (let offset = 0; offset < 20_000; offset += 500) {
      const page = await mercury<{ total: number; transactions: MercuryTxn[] }>(
        `/account/${account.id}/transactions?limit=500&offset=${offset}&order=asc&start=${HISTORY_START}`,
      ).catch((error: unknown) => {
        // A credit account may not support the transactions endpoint; skip it, don't fail the sync.
        if (credit.some((c) => c.id === account.id)) return { total: 0, transactions: [] as MercuryTxn[] };
        throw error;
      });
      if (!page.transactions.length) break;

      const rows = page.transactions.map((t) => {
        const counterparty = t.counterpartyNickname || t.counterpartyName || null;
        const category = t.categoryData?.name || null;
        return {
          id: t.id,
          source: "mercury",
          account_id: account.id,
          amount_cents: Math.round(t.amount * 100),
          status: t.status,
          kind: t.kind ?? null,
          counterparty,
          bank_description: t.bankDescription ?? null,
          note: t.note || t.externalMemo || null,
          bank_category: category ?? t.mercuryCategory ?? null,
          posted_at: t.postedAt ?? null,
          bank_created_at: t.createdAt,
          dashboard_link: t.dashboardLink ?? null,
          auto_class: classify({ amount: t.amount, status: t.status, kind: t.kind, counterparty, category, description: t.bankDescription }),
          raw: t as unknown as Record<string, unknown>,
          synced_at: now,
        };
      });
      // class_override is deliberately absent, so an admin's choice survives every sync.
      const { error } = await sb.from("bank_transactions").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
      total += rows.length;
      inserted += rows.filter((r) => !known.has(r.id)).length;
      if (page.transactions.length < 500) break;
    }
  }
  return { accounts: all.length, transactions: total, inserted };
}
