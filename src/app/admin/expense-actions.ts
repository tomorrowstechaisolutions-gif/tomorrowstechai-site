"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chicagoDate } from "@/lib/time/chicago";
import { BUSINESSES, EXPENSE_CATEGORIES, RECEIPT_BUCKET } from "@/lib/finance/receipts";

const PAGE = "/admin/finance/expenses";

async function requireAdmin() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  return session;
}

function back(fd: FormData, message: string, error = false): never {
  revalidatePath(PAGE);
  revalidatePath("/admin/finance");
  const params = new URLSearchParams({ [error ? "error" : "notice"]: message });
  const range = fd.get("range");
  if (typeof range === "string" && range) params.set("range", range);
  redirect(`${PAGE}?${params}`);
}

const str = (fd: FormData, k: string, max = 300) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

/** "$12.34", "12.34", "1,234" → cents. */
function cents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function fields(fd: FormData) {
  const amount = cents(str(fd, "amount", 20));
  if (amount === null) throw new Error("Enter the total as a number, like 24.99.");
  const tax = str(fd, "tax", 20);
  const date = str(fd, "date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick the purchase date.");
  const category = str(fd, "category", 30);
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Pick a category.");
  const business = str(fd, "business", 20);
  if (!(business in BUSINESSES)) throw new Error("Pick which business this is for.");
  const paidWith = str(fd, "paid_with", 20) === "business" ? "business" : "personal";
  const bank = str(fd, "bank_transaction_id", 80);
  return {
    occurred_at: date,
    vendor: str(fd, "vendor", 120) || null,
    description: str(fd, "description", 300) || null,
    amount_cents: amount,
    tax_cents: tax ? cents(tax) : null,
    category,
    business,
    paid_with: paidWith,
    // A Mercury charge only makes sense for a Mercury-paid expense.
    bank_transaction_id: paidWith === "business" && bank ? bank : null,
    notes: str(fd, "notes", 1000) || null,
  };
}

/** Saves the reviewed fields and makes the expense count. */
export async function confirmExpenseAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 40);
  let msg = "Expense saved.";
  try {
    const f = fields(fd);
    const { error } = await supabaseAdmin().from("expenses").update({ ...f, review_status: "confirmed", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.code === "23505" ? "That Mercury charge is already attached to another expense." : error.message);
    msg = `Saved ${f.vendor ?? "expense"} · $${(f.amount_cents / 100).toFixed(2)}.`;
  } catch (cause) {
    back(fd, cause instanceof Error ? cause.message : "Couldn't save that expense.", true);
  }
  back(fd, msg);
}

/** Deletes an expense and its stored receipt. */
export async function deleteExpenseAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const db = supabaseAdmin();
  const { data } = await db.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  const { error } = await db.from("expenses").delete().eq("id", id);
  if (error) back(fd, error.message, true);
  if (data?.receipt_path) await db.storage.from(RECEIPT_BUCKET).remove([data.receipt_path]);
  back(fd, "Expense deleted.");
}

/** A purchase with no receipt to scan (cash, a forgotten slip). */
export async function addExpenseAction(fd: FormData) {
  await requireAdmin();
  try {
    const f = fields(fd);
    const { error } = await supabaseAdmin().from("expenses").insert({ ...f, review_status: "confirmed", source: "manual", recurring: false });
    if (error) throw new Error(error.message);
  } catch (cause) {
    back(fd, cause instanceof Error ? cause.message : "Couldn't add that expense.", true);
  }
  back(fd, "Expense added.");
}

/**
 * Records that the business paid John back for personally-paid expenses.
 * With `id`, just that one; otherwise every unreimbursed one for `business`.
 */
export async function markReimbursedAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const business = str(fd, "business", 20);
  const db = supabaseAdmin();
  let q = db.from("expenses").update({ reimbursed_on: chicagoDate() })
    .eq("paid_with", "personal").eq("review_status", "confirmed").is("reimbursed_on", null);
  if (id) q = q.eq("id", id);
  else if (business in BUSINESSES) q = q.eq("business", business);
  else back(fd, "Nothing to mark.", true);
  const { error } = await q;
  if (error) back(fd, error.message, true);
  back(fd, id ? "Marked as paid back." : `All ${BUSINESSES[business as keyof typeof BUSINESSES]} out-of-pocket expenses marked as paid back.`);
}
