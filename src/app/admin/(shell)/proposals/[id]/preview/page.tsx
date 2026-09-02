import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getProposalById, proposalUrl } from "@/lib/proposals/service";
import ProposalDocument from "@/components/proposal/ProposalDocument";
import CopyLink from "@/components/admin/cc/CopyLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal preview" };

/**
 * The same component the client sees, rendered inside the admin.
 *
 * Not a separate "preview" layout: a preview built from different markup is a
 * preview of nothing. The only difference is that the acceptance form is left
 * out, because nobody should be able to sign a client's agreement from here.
 */
export default async function ProposalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const full = await getProposalById(supabase, id);
  if (!full) notFound();

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Preview · {full.proposal.proposal_number}</h1>
          <p>Exactly what the client sees, without the signature form.</p>
        </div>
        <div className="cc-rowacts">
          <Link href={`/admin/proposals/${id}`} className="cc-btn">Back to proposal</Link>
          <CopyLink url={proposalUrl(full.proposal.public_token)} label="Copy client link" />
        </div>
      </div>

      <div className="pr-embed">
        <ProposalDocument full={full} mode="preview" />
      </div>
    </>
  );
}
