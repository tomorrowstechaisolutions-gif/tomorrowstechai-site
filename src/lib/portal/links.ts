import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PORTAL_ORIGIN } from "./session";

/**
 * One-time links for the portal. We ask Supabase for the hashed token and
 * build our own /account/confirm URL, which verifies it server-side and sets
 * the session cookie (the SSR-safe flow; no tokens in URL fragments).
 */

export type LinkKind = "invite" | "recovery";

export type IssuedLink = { url: string; userId: string; kind: LinkKind };

export async function issuePortalLink(email: string, prefer: LinkKind): Promise<IssuedLink> {
  const db = supabaseAdmin();
  const redirectTo = `${PORTAL_ORIGIN}/account/set-password`;

  let kind: LinkKind = prefer;
  let res = await db.auth.admin.generateLink({ type: kind, email, options: { redirectTo } });
  // An invite for an email that already has a login fails; a recovery link
  // works for both cases and lets them set a password the same way.
  if (res.error && kind === "invite") {
    kind = "recovery";
    res = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  }
  if (res.error || !res.data?.properties?.hashed_token || !res.data.user) {
    throw new Error(res.error?.message || "Could not create a sign-in link.");
  }
  const q = new URLSearchParams({ token_hash: res.data.properties.hashed_token, type: kind });
  return { url: `${PORTAL_ORIGIN}/account/confirm?${q}`, userId: res.data.user.id, kind };
}
