import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadLinkCandidates } from "@/lib/proposals/queries";
import { getInvoiceById } from "@/lib/invoices/service";
import { DEFAULT_FOOTER, DEFAULT_TERMS, type PaymentTerm } from "@/lib/invoices/config";
import { updateInvoiceAction } from "@/app/admin/invoice-actions";
import InvoiceBuilder, { type InvoiceInitial } from "@/components/admin/cc/InvoiceBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit invoice" };

function dollars(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : "";
}

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [full, candidates] = await Promise.all([
    getInvoiceById(supabase, id),
    loadLinkCandidates(supabase),
  ]);
  if (!full) notFound();

  const { invoice: inv, items } = full;

  const initial: InvoiceInitial = {
    id: inv.id,
    number: inv.invoice_number,
    title: inv.title,
    description: inv.description ?? "",
    owner: inv.owner ?? session.admin.email,
    clientBusinessName: inv.client_business_name ?? "",
    clientContactName: inv.client_contact_name ?? "",
    clientEmail: inv.client_email ?? "",
    clientPhone: inv.client_phone ?? "",
    clientBillingAddress: inv.client_billing_address ?? "",
    issueDate: inv.issue_date ?? "",
    dueDate: inv.due_date ?? "",
    paymentTerms: (inv.payment_terms as PaymentTerm) || "due_on_receipt",
    recurringInterval: inv.recurring_interval,
    recurringStartsOn: inv.recurring_starts_on ?? "",
    terms: inv.terms ?? DEFAULT_TERMS,
    footerNote: inv.footer_note ?? DEFAULT_FOOTER,
    notes: inv.notes ?? "",
    notesInternal: inv.notes_internal ?? "",
    leadId: inv.lead_id ?? "",
    customerId: inv.customer_id ?? "",
    dealId: inv.deal_id ?? "",
    proposalId: inv.proposal_id ?? "",
    jobId: inv.job_id ?? "",
    lines: items.map((item, index) => ({
      key: `e${index}`,
      item_kind: item.item_kind,
      title: item.title,
      description: item.description ?? "",
      quantity: Number(item.quantity),
      unit_price: dollars(item.unit_price_cents),
    })),
  };

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Edit {inv.invoice_number}</h1>
          <p>
            {inv.sent_at
              ? "This invoice has already gone out. Saving changes what the client sees the next time they open the link."
              : "Not sent yet, so nobody has seen any of this."}
          </p>
        </div>
        <Link href={`/admin/invoices/${inv.id}`} className="cc-btn">Back to the invoice</Link>
      </div>

      <InvoiceBuilder
        action={updateInvoiceAction}
        initial={initial}
        leads={candidates.leads}
        customers={candidates.customers}
        deals={candidates.deals}
        locked={inv.status === "paid"}
      />
    </>
  );
}
