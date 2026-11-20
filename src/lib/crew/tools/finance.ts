import "server-only";
import { loadFinanceOverview } from "@/lib/finance/overview";
import { sendInvoiceReminder } from "@/lib/invoices/emails";
import { daysOverdue, outstandingCents } from "@/lib/invoices/pricing";
import { loadInvoiceWorkspace } from "@/lib/invoices/queries";
import { invoiceUrl, logInvoiceEvent } from "@/lib/invoices/service";
import type { Invoice, InvoiceItem } from "@/lib/invoices/types";
import { act, GOAL_FIELDS, read, str, type CrewTool } from "./core";

/**
 * Finance's tools: read the bank and the invoices, and nudge an invoice that
 * has gone unpaid. Reminders use the site's own invoice reminder email, the
 * one a client already recognises and that carries the pay link, not a
 * personal note. Finance never moves money; anything like a refund goes to
 * John's list through flag_for_john.
 */

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const financeOverview: CrewTool = {
  name: "finance_overview",
  description: "Read this month's money: revenue, expenses, net, recurring revenue and what is outstanding. From the bank feed.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  station: "bank",
  async run(ctx) {
    const overview = await loadFinanceOverview(ctx.sb, "mtd");
    return read(ctx, this.name, this.station, "read this month's bank and revenue figures", JSON.stringify(overview).slice(0, 6000));
  },
};

export const listUnpaidInvoices: CrewTool = {
  name: "list_unpaid_invoices",
  description: "List invoices that have been sent and still have a balance, with how many days late each one is.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  kind: "read",
  station: "stripe",
  async run(ctx) {
    const { rows } = await loadInvoiceWorkspace(ctx.sb, {});
    const open = rows.filter((r) => r.outstandingCents > 0 && (r.status === "sent" || r.status === "partial"));
    const text = open.length
      ? open.map((r) => `${r.id} | ${r.number} | ${r.clientName} | owes ${dollars(r.outstandingCents)} | due ${r.dueDate ?? "no date"} | ${r.overdue ? `${r.daysLate} days late` : "not late"} | sent ${r.sentAt ?? "?"}`).join("\n")
      : "No sent invoice has a balance.";
    return read(ctx, this.name, this.station, `checked unpaid invoices (${open.length})`, text);
  },
};

export const sendInvoiceReminderTool: CrewTool = {
  name: "send_invoice_reminder",
  description: "Send the standard payment reminder email for one overdue invoice. Use it only when the invoice is past its due date and has not been reminded in the last two days.",
  input_schema: {
    type: "object",
    properties: { invoice_id: { type: "string" }, ...GOAL_FIELDS },
    required: ["invoice_id", "goal_id", "expectation"],
    additionalProperties: false,
  },
  kind: "act",
  station: "stripe",
  async run(ctx, input) {
    const id = str(input, "invoice_id", 80);
    const { data, error } = await ctx.sb.from("invoices").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Could not read the invoice: ${error.message}`);
    const inv = data as Invoice | null;
    if (!inv) return { ok: false, text: "No invoice has that id." };
    if (!inv.client_email) return { ok: false, text: "That invoice has no client email, so no reminder can be sent." };
    if (outstandingCents(inv) <= 0) return { ok: false, text: "Nothing is outstanding on that invoice." };
    if (daysOverdue(inv.due_date) <= 0) return { ok: false, text: "That invoice is not past its due date yet." };

    // The last reminder counts as contact, whoever sent it.
    const { data: last } = await ctx.sb
      .from("invoice_events").select("created_at").eq("invoice_id", id).eq("event_type", "reminder_sent")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const who = inv.client_business_name || inv.client_contact_name || "the client";
    const to = inv.client_email.trim();

    return act(
      ctx,
      this.name,
      input,
      {
        action: { recipientEmail: to },
        station: this.station,
        summary: `sent a payment reminder to ${who} for ${inv.invoice_number}`,
        refusedSummary: `did not remind ${who} about ${inv.invoice_number}`,
        payload: { to: to.toLowerCase(), invoiceId: id },
        lastContactAt: last?.created_at ? new Date(String(last.created_at)).getTime() : null,
      },
      async () => {
        const { data: items } = await ctx.sb.from("invoice_items").select("*").eq("invoice_id", id).order("position");
        const delivered = await sendInvoiceReminder(inv, (items ?? []) as InvoiceItem[], invoiceUrl(inv.public_token), daysOverdue(inv.due_date));
        await logInvoiceEvent(ctx.sb, { invoiceId: id, type: "reminder_sent", body: `Reminder sent to ${to} by Tess's finance desk.`, actor: "tess", metadata: { delivered, crew: ctx.agent.slug } });
        return delivered ? { ok: true, text: `Reminder sent to ${to}.` } : { ok: false, text: "The reminder email could not be delivered." };
      }
    );
  },
};
