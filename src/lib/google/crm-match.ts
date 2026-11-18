import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who in the CRM an email address belongs to, so the inbox can say
 * "this is your client Hill Country Roofing" next to a thread.
 *
 * A client wins over a lead for the same address: once someone has paid you,
 * that is the record you want to open.
 */
export type CrmMatch = { kind: "client" | "lead"; id: string; name: string; href: string };

export async function matchEmails(sb: SupabaseClient, emails: string[]): Promise<Map<string, CrmMatch>> {
  const list = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))).slice(0, 300);
  const out = new Map<string, CrmMatch>();
  if (!list.length) return out;

  const [leads, clients] = await Promise.all([
    sb.from("leads").select("id, email, first_name, last_name, business_name").in("email", list).limit(500),
    sb.from("customers").select("id, email, name, business_name").in("email", list).limit(500),
  ]);

  for (const row of (leads.data ?? []) as { id: string; email: string | null; first_name: string | null; last_name: string | null; business_name: string | null }[]) {
    if (!row.email) continue;
    const person = [row.first_name, row.last_name].filter(Boolean).join(" ");
    out.set(row.email.toLowerCase(), {
      kind: "lead",
      id: row.id,
      name: row.business_name ? `${person || row.email} · ${row.business_name}` : person || row.email,
      href: `/admin/leads/${row.id}`,
    });
  }
  for (const row of (clients.data ?? []) as { id: string; email: string | null; name: string | null; business_name: string | null }[]) {
    if (!row.email) continue;
    out.set(row.email.toLowerCase(), {
      kind: "client",
      id: row.id,
      name: row.business_name || row.name || row.email,
      href: `/admin/clients/${row.id}`,
    });
  }
  return out;
}
