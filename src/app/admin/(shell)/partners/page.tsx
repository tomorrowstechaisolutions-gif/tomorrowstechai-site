import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { listPartners } from "@/lib/partners/queries";
import { RELATIONSHIP_LABELS } from "@/lib/partners/config";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import { IconShare } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partners" };

/** Organisations that are more than a client: white-label channels, revenue shares, conference partners. */
export default async function PartnersPage() {
  if (!(await getAdminUser())) redirect("/admin/login");
  const partners = await listPartners(await createSupabaseServerClient());

  return (
    <>
      <header className="cc-greet">
        <div>
          <h1>Partners</h1>
          <p>Businesses you work through rather than for — their work orders, the revenue you share, and the client side of the relationship, in one place.</p>
        </div>
      </header>
      <Panel title="Partner organizations" sub={`${partners.length}`} className="cf-panel">
        {partners.length === 0 ? (
          <EmptyState title="No partners yet" text="A partner is added as a partner_connections row." icon={<IconShare size={17} />} />
        ) : (
          <ul className="cf-requests">
            {partners.map((p) => (
              <li key={p.id}>
                <div>
                  <Link href={`/admin/partners/${p.partner_key}`} className="cc-strong">{p.name}</Link>
                  <span className="cc-sub">
                    {p.relationship.map((r) => RELATIONSHIP_LABELS[r] ?? r).join(" · ")}
                    {` · ${p.our_share_pct}% to Tomorrow's Tech AI`}
                  </span>
                </div>
                <span className={`cc-chip ${p.status === "active" ? "t-ok" : "t-warn"}`}>
                  {p.status === "active" ? "Connected" : p.status === "pending_configuration" ? "Pending configuration" : p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
