"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("working");
    setError("");

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw new Error(authError.message);

      const next = params.get("next") ?? "/admin";
      router.push(next);
      router.refresh();
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="ad-form">
      <label className="ad-field">
        <span className="ad-label">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="ad-input"
        />
      </label>
      <label className="ad-field">
        <span className="ad-label">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="ad-input"
        />
      </label>
      {error && (
        <p role="alert" className="ad-error">
          {error}
        </p>
      )}
      <button type="submit" className="ad-btn primary" disabled={state === "working"}>
        {state === "working" ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
