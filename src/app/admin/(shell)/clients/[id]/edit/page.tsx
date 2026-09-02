import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadClient } from "@/lib/clients/detail";
import { updateClientBilling, updateClientFields } from "@/app/admin/client-actions";
import { Panel } from "@/components/admin/cc/Panel";
import { IconLink, IconPen, IconRepeat, IconUsers } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const saved = Array.isArray(query.saved) ? query.saved[0] : query.saved;
  const supabase = await createSupabaseServerClient();
  const client = await loadClient(supabase, id);

  if (!client) notFound();

  return (
    <>
      <div className="cc-greet">
        <div>
          <div className="cc-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <IconPen size={13} /> Client record
          </div>
          <h1>Edit {client.businessName}</h1>
          <p>Keep the contact, company, account ownership and billing record accurate.</p>
        </div>
        <div className="cc-greet-actions">
          <Link href={`/admin/clients/${client.id}`} className="cc-btn">Cancel</Link>
        </div>
      </div>

      {saved ? (
        <div className="cc-panel" style={{ marginBottom: 16, borderColor: "var(--cc-ok)" }} role="status">
          <div className="cc-panel-body tight">
            <span className="cc-chip t-ok">Saved</span>{" "}
            <span className="cc-dim">
              {saved === "billing" ? "Billing and account status are up to date." : "Contact and company details are up to date."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="cc-board">
        <Panel
          title="Contact & company"
          sub="The primary CRM record"
          icon={<IconUsers size={15} />}
          className="cc-s8 cc-m1"
          bodyClass="tight"
        >
          <form action={updateClientFields}>
            <input type="hidden" name="customer_id" value={client.id} />
            <input type="hidden" name="sync_company" value="1" />
            <input type="hidden" name="return_to" value="edit" />

            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-business">Business name</label>
                <input id="ce-business" name="business_name" className="cc-input" defaultValue={client.businessName} required />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-domain">Website domain</label>
                <input id="ce-domain" name="company_domain" className="cc-input" defaultValue={client.company?.domain ?? ""} placeholder="example.com" />
              </div>
            </div>

            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-name">Primary contact</label>
                <input id="ce-name" name="name" className="cc-input" defaultValue={client.contactName ?? ""} required />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-industry">Industry</label>
                <input id="ce-industry" name="business_type" className="cc-input" defaultValue={client.businessType ?? ""} />
              </div>
            </div>

            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-email">Contact email</label>
                <input id="ce-email" name="email" type="email" className="cc-input" defaultValue={client.email} required />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-phone">Contact phone</label>
                <input id="ce-phone" name="phone" type="tel" className="cc-input" defaultValue={client.phone ?? ""} />
              </div>
            </div>

            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-company-phone">Company phone</label>
                <input id="ce-company-phone" name="company_phone" type="tel" className="cc-input" defaultValue={client.company?.phone ?? client.phone ?? ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-owner">Account owner</label>
                <input id="ce-owner" name="owner" className="cc-input" defaultValue={client.owner ?? ""} placeholder="John Hockinson" />
              </div>
            </div>

            <div className="cc-field row2">
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-city">City</label>
                <input id="ce-city" name="city" className="cc-input" defaultValue={client.city ?? ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-state">State</label>
                <input id="ce-state" name="state" className="cc-input" defaultValue={client.state ?? ""} />
              </div>
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="ce-tags">Tags</label>
              <input id="ce-tags" name="tags" className="cc-input" defaultValue={client.tags.join(", ")} placeholder="vip, website, hosting" />
              <span className="cc-faint" style={{ fontSize: "0.72rem" }}>Separate tags with commas.</span>
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="ce-notes">Internal contact notes</label>
              <textarea id="ce-notes" name="notes_internal" className="cc-textarea" style={{ minHeight: 100 }} defaultValue={client.notesInternal ?? ""} />
            </div>

            <div className="cc-field">
              <label className="cc-label" htmlFor="ce-company-notes">Company notes</label>
              <textarea id="ce-company-notes" name="company_notes" className="cc-textarea" style={{ minHeight: 80 }} defaultValue={client.company?.notes ?? ""} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Link href={`/admin/clients/${client.id}`} className="cc-btn">Cancel</Link>
              <button type="submit" className="cc-btn primary">Save client record</button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Account & billing"
          icon={<IconRepeat size={15} />}
          className="cc-s4 cc-m2"
          bodyClass="tight"
        >
          {client.subscription.linked ? (
            <p className="cc-note" style={{ marginTop: 0 }}>
              <IconLink size={12} style={{ display: "inline", verticalAlign: -2 }} />{" "}
              Stripe controls this client&rsquo;s rate, renewal date, and payment status. Edit those in Stripe so payment history remains trustworthy.
            </p>
          ) : (
            <form action={updateClientBilling}>
              <input type="hidden" name="customer_id" value={client.id} />
              <input type="hidden" name="return_to" value="edit" />
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-mrr">Monthly recurring revenue ($)</label>
                <input id="ce-mrr" name="mrr" className="cc-input" inputMode="decimal" defaultValue={(client.subscription.mrrCents / 100) || ""} />
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-status">Client status</label>
                <select id="ce-status" name="status" className="cc-select" defaultValue={client.status}>
                  <option value="active">Active</option>
                  <option value="paused">Payment failing / paused</option>
                  <option value="churned">Churned</option>
                </select>
              </div>
              <div className="cc-field">
                <label className="cc-label" htmlFor="ce-renews">Next renewal</label>
                <input id="ce-renews" name="renews_at" type="date" className="cc-input" defaultValue={client.subscription.renewsAt?.slice(0, 10) ?? ""} />
              </div>
              <button type="submit" className="cc-btn primary">Save billing</button>
            </form>
          )}
        </Panel>
      </div>
    </>
  );
}
