import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chicagoDate } from "@/lib/time/chicago";

/**
 * Receipts → expenses.
 *
 * A receipt (phone photo, screenshot, or an Amazon invoice PDF) is stored in
 * the private `receipts` bucket, read by an AI model into structured fields,
 * and saved as an expense in `needs_review`. Nothing counts toward Finance
 * until John confirms it — the AI proposes, he decides.
 *
 * The model key stays on the server (OPENAI_API_KEY). The model can be
 * changed with RECEIPT_MODEL without a code change.
 */

export const RECEIPT_BUCKET = "receipts";
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024; // under Vercel's request body limit
export const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export const EXPENSE_CATEGORIES = [
  "supplies", "equipment", "hardware", "software", "hosting", "office", "marketing",
  "shipping", "education", "travel", "meals", "contractor", "fees", "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  supplies: "Supplies", equipment: "Equipment", hardware: "Hardware", software: "Software",
  hosting: "Hosting", office: "Office", marketing: "Marketing", shipping: "Shipping",
  education: "Education", travel: "Travel", meals: "Meals", contractor: "Contractor",
  fees: "Fees", other: "Other",
};

export const BUSINESSES = { ttai: "Tomorrow's Tech AI", tomorrowstek: "Tomorrowstek LLC" } as const;
export type Business = keyof typeof BUSINESSES;

export type ReceiptRead = {
  vendor: string | null;
  date: string | null;
  total_cents: number | null;
  tax_cents: number | null;
  order_number: string | null;
  description: string | null;
  category: ExpenseCategory;
  items: Array<{ name: string; quantity: number; amount_cents: number | null }>;
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "date", "total_cents", "tax_cents", "order_number", "description", "category", "items", "confidence", "notes"],
  properties: {
    vendor: { type: ["string", "null"], description: "Store or company charged, e.g. 'Amazon', 'Home Depot'." },
    date: { type: ["string", "null"], description: "Purchase or order date as YYYY-MM-DD." },
    total_cents: { type: ["integer", "null"], description: "Grand total actually charged, in cents, including tax and shipping." },
    tax_cents: { type: ["integer", "null"], description: "Sales tax in cents, if shown." },
    order_number: { type: ["string", "null"], description: "Order or receipt number, if shown." },
    description: { type: ["string", "null"], description: "Short plain summary of what was bought, under 80 characters." },
    category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "amount_cents"],
        properties: {
          name: { type: "string" },
          quantity: { type: "integer" },
          amount_cents: { type: ["integer", "null"] },
        },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: ["string", "null"], description: "Anything uncertain, e.g. 'total partly cut off'. Null if clear." },
  },
} as const;

const PROMPT = `You read purchase receipts and order invoices for a small technology consulting business.
Extract the fields exactly as printed. Never guess a number you cannot see: use null and say why in notes.
total_cents is the final amount charged (after discounts, with tax and shipping). For an Amazon order or invoice
with several shipments, use the order's grand total. Pick the closest category:
supplies (consumables, cables, small parts), equipment (furniture, tools, larger gear), hardware (computers,
GPUs, phones, components), software (apps, licences, subscriptions), hosting (servers, domains, cloud),
office, marketing (ads, printing, promo items), shipping, education (books, courses), travel, meals,
contractor, fees (bank, platform fees), other.`;

/** Reads one receipt file. Throws with a plain message if the model can't be reached. */
export async function readReceipt(bytes: Buffer, mime: string, filename: string): Promise<ReceiptRead> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY isn't set, so receipts can't be read automatically.");
  const data = `data:${mime};base64,${bytes.toString("base64")}`;
  const file = mime === "application/pdf"
    ? { type: "input_file", filename: filename || "receipt.pdf", file_data: data }
    : { type: "input_image", image_url: data, detail: "high" };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.RECEIPT_MODEL || "gpt-5.4-mini",
      input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, file] }],
      text: { format: { type: "json_schema", name: "receipt", strict: true, schema: SCHEMA } },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  };
  if (!res.ok) throw new Error(`Receipt reader failed (HTTP ${res.status}): ${body.error?.message ?? "no detail"}`);
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("The receipt reader returned nothing.");
  const parsed = JSON.parse(text) as ReceiptRead;
  if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) parsed.date = null;
  return parsed;
}

type BankLine = { id: string; amount_cents: number; counterparty: string | null; posted_at: string | null; bank_created_at: string };

/**
 * Mercury charges that could be this receipt: same amount, within a week of
 * the receipt date, money out, not already attached to another expense.
 */
export async function bankCandidates(sb: SupabaseClient, totalCents: number | null, date: string | null, excludeExpenseId?: string): Promise<Array<BankLine & { day: string }>> {
  if (!totalCents) return [];
  const center = date ? new Date(`${date}T12:00:00Z`) : new Date();
  const from = new Date(center.getTime() - 7 * 86_400_000).toISOString();
  const to = new Date(center.getTime() + 10 * 86_400_000).toISOString();
  const [lines, linked] = await Promise.all([
    sb.from("bank_transactions").select("id, amount_cents, counterparty, posted_at, bank_created_at")
      .eq("amount_cents", -Math.abs(totalCents)).gte("bank_created_at", from).lte("bank_created_at", to),
    sb.from("expenses").select("id, bank_transaction_id").not("bank_transaction_id", "is", null),
  ]);
  const taken = new Set((linked.data ?? []).filter((e) => e.id !== excludeExpenseId).map((e) => e.bank_transaction_id));
  return ((lines.data ?? []) as BankLine[])
    .filter((l) => !taken.has(l.id))
    .map((l) => ({ ...l, day: chicagoDate(new Date(l.posted_at ?? l.bank_created_at)) }));
}
