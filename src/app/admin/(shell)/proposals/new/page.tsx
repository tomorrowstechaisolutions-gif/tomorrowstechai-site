import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { currentAgreement } from "@/lib/proposals/agreement";
import { loadLinkCandidates } from "@/lib/proposals/queries";
import { DEFAULT_VALID_DAYS, templateByKey } from "@/lib/proposals/config";
import { createProposalAction } from "@/app/admin/proposal-actions";
import ProposalBuilder, { type BuilderInitial, type BuilderItem } from "@/components/admin/cc/ProposalBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New proposal" };

/** The most common sale, pre-loaded. Any other package is one click away. */
const DEFAULT_PACKAGE = "classic_399";

/**
 * Awaited rather than inlined, so the clock is read outside the render pass.
 * A component body is meant to be pure; Date.now() in one is a lint error and,
 * more to the point, a value that differs between render and hydration.
 */
async function defaultValidUntil(): Promise<string> {
  return new Date(Date.now() + DEFAULT_VALID_DAYS * 86_400_000).toISOString().slice(0, 10);
}

function dollars(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : "";
}

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const [agreement, candidates, validUntil] = await Promise.all([
    currentAgreement(supabase),
    loadLinkCandidates(supabase),
    defaultValidUntil(),
  ]);

  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  const template = templateByKey(DEFAULT_PACKAGE);
  const items: BuilderItem[] = template.items.map((item, index) => ({
    key: `t${index}`,
    item_type: item.item_type,
    title: item.title,
    description: item.description ?? "",
    quantity: 1,
    unit_price: dollars(item.unit_price_cents ?? 0),
    is_billable: Boolean(item.is_billable),
    is_optional: Boolean(item.is_optional),
  }));

  // Opened from a lead's page: prefill from that lead without a second click.
  const leadId = pick("lead");
  const fromLead = leadId ? candidates.leads.find((l) => l.id === leadId) : undefined;

  const initial: BuilderInitial = {
    title: template.defaultTitle,
    summary: template.summary,
    packageKey: template.key,
    packageName: template.name,
    owner: session.admin.email,
    clientBusinessName: fromLead?.businessName ?? "",
    clientContactName: fromLead?.label ?? "",
    clientEmail: fromLead?.email ?? "",
    clientPhone: fromLead?.phone ?? "",
    clientTitle: "",
    clientBillingAddress: "",
    oneTimePrice: dollars(template.oneTimeCents),
    discountAmount: "",
    recurringPrice: dollars(template.recurringCents),
    recurringInterval: "month",
    turnaroundNote: template.turnaroundNote ?? "",
    revisionLimit: template.revisionLimit === null ? "" : String(template.revisionLimit),
    hostingNote: template.hostingNote,
    validUntil,
    notesInternal: "",
    leadId: fromLead?.id ?? "",
    customerId: pick("customer"),
    dealId: pick("deal"),
    items,
    sections: [],
  };

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>New proposal</h1>
          <p>
            Pick a package, confirm the scope and the price, then send it. The
            agreement, the ownership terms and the signature page are added for
            you.
          </p>
        </div>
        <Link href="/admin/proposals" className="cc-btn">Back to proposals</Link>
      </div>

      {agreement ? null : (
        <div className="cc-error" style={{ marginBottom: 14 }}>
          There is no published agreement version, so a proposal cannot be
          created yet. Publish one under{" "}
          <Link href="/admin/settings/agreements" className="cc-link">
            Settings → Agreements
          </Link>
          .
        </div>
      )}

      <ProposalBuilder
        action={createProposalAction}
        initial={initial}
        leads={candidates.leads}
        customers={candidates.customers}
        deals={candidates.deals}
        agreementLabel={agreement ? `v${agreement.version}` : null}
        locked={false}
      />
    </>
  );
}
