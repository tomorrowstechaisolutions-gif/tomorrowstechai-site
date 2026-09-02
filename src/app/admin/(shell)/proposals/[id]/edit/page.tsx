import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { currentAgreement } from "@/lib/proposals/agreement";
import { getProposalById } from "@/lib/proposals/service";
import { loadLinkCandidates } from "@/lib/proposals/queries";
import { updateProposalAction } from "@/app/admin/proposal-actions";
import ProposalBuilder, { type BuilderInitial } from "@/components/admin/cc/ProposalBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit proposal" };

function dollars(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : "";
}

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [full, agreement, candidates] = await Promise.all([
    getProposalById(supabase, id),
    currentAgreement(supabase),
    loadLinkCandidates(supabase),
  ]);
  if (!full) notFound();

  const p = full.proposal;

  const initial: BuilderInitial = {
    id: p.id,
    title: p.title,
    summary: p.summary ?? "",
    packageKey: p.package_key ?? "custom",
    packageName: p.package_name ?? "",
    owner: p.owner ?? session.admin.email,
    clientBusinessName: p.client_business_name ?? "",
    clientContactName: p.client_contact_name ?? "",
    clientEmail: p.client_email ?? "",
    clientPhone: p.client_phone ?? "",
    clientTitle: p.client_title ?? "",
    clientBillingAddress: p.client_billing_address ?? "",
    // The stored build price is the total less whatever the lines added, so
    // reopening the form shows the same number that was typed into it.
    oneTimePrice: dollars(
      Math.max(
        0,
        p.subtotal_cents -
          full.items
            .filter((item) => item.is_billable && !item.is_optional && item.item_type !== "discount")
            .reduce((sum, item) => sum + item.total_price_cents, 0)
      )
    ),
    discountAmount: dollars(p.discount_amount_cents),
    recurringPrice: dollars(p.recurring_price_cents),
    recurringInterval: p.recurring_interval,
    depositAmount: dollars(p.deposit_amount_cents),
    paymentMode: p.payment_mode,
    turnaroundNote: p.turnaround_note ?? "",
    revisionLimit: p.revision_limit === null ? "" : String(p.revision_limit),
    hostingNote: p.hosting_note ?? "",
    validUntil: p.valid_until ?? "",
    notesInternal: p.notes_internal ?? "",
    leadId: p.lead_id ?? "",
    customerId: p.customer_id ?? "",
    dealId: p.deal_id ?? "",
    items: full.items.map((item, index) => ({
      key: `i${index}`,
      item_type: item.item_type,
      title: item.title,
      description: item.description ?? "",
      quantity: Number(item.quantity),
      unit_price: dollars(item.unit_price_cents),
      is_billable: item.is_billable,
      is_optional: item.is_optional,
    })),
    sections: full.sections.map((section, index) => ({
      key: `s${index}`,
      section_type: section.section_type,
      title: section.title,
      content: section.content ?? "",
      is_visible: section.is_visible,
    })),
  };

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>{p.proposal_number}</h1>
          <p>Editing the draft. Nothing reaches the client until you send it.</p>
        </div>
        <Link href={`/admin/proposals/${p.id}`} className="cc-btn">Back to proposal</Link>
      </div>

      <ProposalBuilder
        action={updateProposalAction}
        initial={initial}
        leads={candidates.leads}
        customers={candidates.customers}
        deals={candidates.deals}
        agreementLabel={
          full.agreement ? `v${full.agreement.version}` : agreement ? `v${agreement.version}` : null
        }
        locked={Boolean(p.locked_at)}
      />
    </>
  );
}
