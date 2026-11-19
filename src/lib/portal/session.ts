import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The member portal (/account). A Supabase Auth login is only a member when
 * John invited it: a portal_members row, not disabled. Everything a member
 * reads is fetched server-side for the verified member's customer id only,
 * with explicit column lists (see data.ts). Members get no direct table
 * access beyond their own portal_members row.
 */

export const PORTAL_ORIGIN = (process.env.PORTAL_ORIGIN || "https://www.tomorrowstechai.com").replace(/\/$/, "");
export const PASSWORD_MIN = 10;

export type PortalMember = {
  id: string;
  customerId: string;
  email: string;
  fullName: string | null;
  status: "invited" | "active" | "disabled";
  businessName: string;
  contactName: string | null;
  /** An admin looking at this client's portal. View only: never a real session. */
  preview?: boolean;
};

/** Holds the client id an admin is viewing the portal as. Scoped to /account. */
export const VIEW_AS_COOKIE = "ttai_view_as";

/** The signed-in member, or null (not signed in, or a login that isn't a member). */
export const getPortalMember = cache(async function getPortalMember(): Promise<PortalMember | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: m } = await supabase
    .from("portal_members")
    .select("id, customer_id, email, full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m || m.status === "disabled") return null;

  // Server-side read with an explicit column list: members never get direct
  // table access to customers (RLS can't hide columns like notes_internal).
  const { data: c } = await supabaseAdmin().from("customers").select("business_name, name").eq("id", m.customer_id).maybeSingle();
  return {
    id: m.id,
    customerId: m.customer_id,
    email: m.email,
    fullName: m.full_name,
    status: m.status,
    businessName: c?.business_name || c?.name || "Your business",
    contactName: c?.name ?? null,
  };
});

/**
 * Who the portal pages are being drawn for.
 *
 * Normally the signed-in member. When an admin pressed "View as this client"
 * it is that client instead, flagged `preview`. The cookie alone grants
 * nothing: it is honoured only for a login that is in admin_users, checked on
 * every request.
 *
 * Only the pages call this. Every action that writes (profile, requests,
 * billing, password) still calls getPortalMember(), which knows nothing about
 * previews, so an admin viewing as a client has no member session to write
 * with. View only is how it is built, not a rule the pages have to remember.
 */
export const getPortalViewer = cache(async function getPortalViewer(): Promise<PortalMember | null> {
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? "";
  if (/^[0-9a-f-]{36}$/i.test(viewAs) && (await getAdminUser())) {
    const db = supabaseAdmin();
    const { data: c } = await db.from("customers").select("id, business_name, name, email").eq("id", viewAs).maybeSingle();
    if (c) {
      const { data: m } = await db
        .from("portal_members")
        .select("id, email, full_name, status")
        .eq("customer_id", c.id)
        .maybeSingle();
      return {
        id: m?.id ?? "preview",
        customerId: c.id,
        email: m?.email ?? c.email ?? "no member account yet",
        fullName: m?.full_name ?? null,
        status: m?.status ?? "invited",
        businessName: c.business_name || c.name || "Your business",
        contactName: c.name ?? null,
        preview: true,
      };
    }
  }
  return getPortalMember();
});

export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 128) return "That password is too long.";
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}
