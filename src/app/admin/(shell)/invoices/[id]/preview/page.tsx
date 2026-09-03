import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { getInvoiceById, invoiceUrl } from "@/lib/invoices/service";
import InvoiceDocument from "@/components/invoice/InvoiceDocument";
import CopyLink from "@/components/admin/cc/CopyLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice preview" };

/**
 * The same component the client sees, rendered inside the admin.
 *
 * Not a separate "preview" layout: a preview built from different markup is a
 * preview of nothing. This is also the only way to look at a DRAFT invoice as
 * the client would — the public token deliberately refuses to resolve until
 * the invoice has been sent.
 */
export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const full = await getInvoiceById(supabase, id);
  if (!full) notFound();

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Preview · {full.invoice.invoice_number}</h1>
          <p>Exactly what the client sees, without the pay button.</p>
        </div>
        <div className="cc-rowacts">
          <Link href={`/admin/invoices/${id}`} className="cc-btn">Back to invoice</Link>
          <CopyLink url={invoiceUrl(full.invoice.public_token)} label="Copy client link" />
        </div>
      </div>

      <div className="pr-embed">
        <InvoiceDocument full={full} mode="preview" />
      </div>
    </>
  );
}
