"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client — publishable key only, used for admin sign-in. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
