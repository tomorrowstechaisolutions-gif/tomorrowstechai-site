import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadLinkCandidates } from "@/lib/proposals/queries";
import { DEFAULT_FOOTER, DEFAULT_TERMS, dueDateFor } from "@/lib/invoices/config";
import { createInvoiceAction } from "@/app/admin/invoice-actions";
import InvoiceBuilder, { type InvoiceInitial } from "@/components/admin/cc/InvoiceBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New invoice" };

/**
 * Awaited rather than inlined, so the clock is read outside the render pass.
 * A component body is meant to be pure; Date.now() in one is a lint error and,
 * more to the point, a value that differs between render and hydration.
 */
async function todayISO(): Promise<string> {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const [candidates, issueDate] = await Promise.all([
    loadLinkCandidates(supabase),
    todayISO(),
  ]);

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  // Opened from a lead's page: prefill from that lead without a second click.
  const leadId = pick("lead");
  const fromLead = leadId ? candidates.leads.find((l) => l.id === leadId) : undefined;

  const initial: InvoiceInitial = {
    title: "",
    description: "",
    owner: session.admin.email,
    clientBusinessName: fromLead?.businessName ?? "",
    clientContactName: fromLead?.label ?? "",
    clientEmail: fromLead?.email ?? "",
    clientPhone: fromLead?.phone ?? "",
    clientBillingAddress: "",
    issueDate,
    dueDate: dueDateFor("due_on_receipt", issueDate),
    paymentTerms: "due_on_receipt",
    recurringInterval: "month",
    recurringStartsOn: "",
    terms: DEFAULT_TERMS,
    footerNote: DEFAULT_FOOTER,
    notes: "",
    notesInternal: "",
    leadId: fromLead?.id ?? "",
    customerId: pick("customer"),
    dealId: pick("deal"),
    proposalId: pick("proposal"),
    jobId: pick("job"),
    lines: [],
  };

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>New invoice</h1>
          <p>
            For work that never had a proposal, or for anything extra. If there
            is a signed proposal for this job, raise the invoice from that
            instead — the lines and the price come across already filled in.
          </p>
        </div>
        <Link href="/admin/invoices" className="cc-btn">Back to invoices</Link>
      </div>

      <InvoiceBuilder
        action={createInvoiceAction}
        initial={initial}
        leads={candidates.leads}
        customers={candidates.customers}
        deals={candidates.deals}
        locked={false}
      />
    </>
  );
}
