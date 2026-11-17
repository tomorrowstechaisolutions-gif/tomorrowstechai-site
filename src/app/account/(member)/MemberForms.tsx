"use client";

import { useActionState } from "react";
import { submitMemberRequestAction, updateMemberProfileAction } from "../member-actions";
import type { FormState } from "../actions";
import type { MemberProfile } from "@/lib/portal/data";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="acct-msg err" role="alert">{state.error}</p>;
  if (state.notice) return <p className="acct-msg ok" role="status">{state.notice}</p>;
  return null;
}

export function ProfileForm({ profile }: { profile: MemberProfile }) {
  const [state, action, pending] = useActionState(updateMemberProfileAction, {});
  return (
    <form action={action} className="acct-form">
      <Msg state={state} />
      <div className="acct-form-grid">
        <div className="acct-field"><label htmlFor="name">Your name</label><input id="name" name="name" defaultValue={profile.name ?? ""} autoComplete="name" /></div>
        <div className="acct-field"><label htmlFor="business_name">Business name</label><input id="business_name" name="business_name" defaultValue={profile.businessName ?? ""} autoComplete="organization" /></div>
        <div className="acct-field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" /></div>
        <div className="acct-field"><label htmlFor="city">City</label><input id="city" name="city" defaultValue={profile.city ?? ""} autoComplete="address-level2" /></div>
        <div className="acct-field"><label htmlFor="state">State</label><input id="state" name="state" defaultValue={profile.state ?? ""} autoComplete="address-level1" /></div>
      </div>
      <button className="acct-btn auto" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

const CATS = [
  ["question", "A question"],
  ["change", "A change to my website or service"],
  ["problem", "Something isn't working"],
  ["billing", "Billing or an invoice"],
  ["cancel", "Cancel a service"],
] as const;

export function HelpForm({ about, category }: { about?: string; category?: string }) {
  const [state, action, pending] = useActionState(submitMemberRequestAction, {});
  const initial = CATS.some(([v]) => v === category) ? category : about ? "change" : "question";
  const subject = about ? (initial === "cancel" ? `Cancel: ${about}` : `About: ${about}`) : "";
  return (
    <form action={action} className="acct-form" key={state.notice ?? "form"}>
      <Msg state={state} />
      <div className="acct-field">
        <label htmlFor="category">What do you need?</label>
        <select id="category" name="category" defaultValue={initial}>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="acct-field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" maxLength={160} defaultValue={subject} required />
      </div>
      <div className="acct-field">
        <label htmlFor="message">Details</label>
        <textarea id="message" name="message" rows={6} maxLength={5000} required />
      </div>
      <button className="acct-btn auto" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
