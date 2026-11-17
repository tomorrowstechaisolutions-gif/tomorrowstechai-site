"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  portalForgotAction, portalLoginAction, portalSetPasswordAction, type FormState,
} from "./actions";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="acct-msg err" role="alert">{state.error}</p>;
  if (state.notice) return <p className="acct-msg ok" role="status">{state.notice}</p>;
  return null;
}

export function LoginForm({ next, banner }: { next: string; banner?: FormState }) {
  const [state, action, pending] = useActionState(portalLoginAction, banner ?? {});
  return (
    <form action={action} noValidate>
      <Msg state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="acct-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="acct-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="acct-btn" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <div className="acct-row">
        <Link href="/account/forgot">Forgot password?</Link>
      </div>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(portalForgotAction, {});
  return (
    <form action={action} noValidate>
      <Msg state={state} />
      <div className="acct-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <button className="acct-btn" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      <div className="acct-row">
        <Link href="/account/login">Back to sign in</Link>
      </div>
    </form>
  );
}

export function SetPasswordForm({ email, min }: { email: string; min: number }) {
  const [state, action, pending] = useActionState(portalSetPasswordAction, {});
  return (
    <form action={action} noValidate>
      <Msg state={state} />
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="acct-field">
        <label htmlFor="password">New password (at least {min} characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={min} required />
      </div>
      <div className="acct-field">
        <label htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={min} required />
      </div>
      <button className="acct-btn" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
