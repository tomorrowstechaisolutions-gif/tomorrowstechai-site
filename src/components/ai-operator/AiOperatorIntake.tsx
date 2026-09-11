"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconBadgeCheck, IconCalendar, IconChart, IconLock, IconRocket, IconShield, IconUsers } from "@/components/Icons";
import styles from "./AiOperatorIntake.module.css";

type Plan = {id:string;name:string;price:string;setup:string;description:string;features:readonly string[]};
type Form = {
  fullName: string; email: string; phone: string; company: string; website: string;
  industry: string; employees: string; monthlyLeads: string; challenges: string[];
  contactMethod: string; bestTime: string; notes: string; smsConsent: boolean;
};

const initialForm: Form = { fullName: "", email: "", phone: "", company: "", website: "", industry: "", employees: "", monthlyLeads: "", challenges: [], contactMethod: "", bestTime: "", notes: "", smsConsent: false };
const challenges = ["Missing Leads", "Slow Follow-Up", "No CRM", "Appointment Booking", "Reviews", "Website", "Social Media", "Customer Communication", "Other"];

export function AiOperatorIntake({ initialPlan }: { initialPlan: Plan }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(initialForm);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const startedAt = useRef(0);
  const plan = initialPlan;

  useEffect(() => { startedAt.current = Date.now(); }, []);

  const update = (key: keyof Form, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleChallenge = (value: string) => update("challenges", form.challenges.includes(value) ? form.challenges.filter((x) => x !== value) : [...form.challenges, value]);
  const canContinue = useMemo(() => {
    if (step === 1) return form.fullName.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.phone.replace(/\D/g, "").length >= 10 && form.company.trim().length > 1;
    if (step === 2) return Boolean(form.industry && form.contactMethod && (form.contactMethod !== "Text" || form.smsConsent));
    return true;
  }, [form, step]);

  function next() {
    if (!canContinue) { setError(step === 1 ? "Please complete your name, email, phone, and company." : "Choose an industry and contact method. Text messages require consent."); return; }
    setError(""); setStep((value) => Math.min(3, value + 1)); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    setSending(true); setError("");
    try {
      const response = await fetch("/api/ai-operator-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, plan: plan.id, elapsed_ms: startedAt.current ? Date.now() - startedAt.current : 99999, hp_company_url: "" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn’t submit your request.");
      setComplete(true); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setSending(false); }
  }

  if (complete) return <div className={styles.page}><section className={styles.success}><IconBadgeCheck size={54} /><div className={styles.eyebrow}>Request received</div><h1>We’ve Got It.</h1><p>Your business information has been received. Our team will review your current setup and contact you with the best next steps for launching your AI Business Operator.</p><div className={styles.successSummary}><b>{plan.name}</b><span>{form.company}</span><span>Preferred contact: {form.contactMethod}</span></div><div className={styles.successSteps}><b>What happens next?</b><span>1. We review your information</span><span>2. We identify the best automation opportunities</span><span>3. We contact you</span><span>4. We build your launch plan</span></div><div className={styles.successActions}><Link className={styles.primary} href="/">Return Home <IconArrowRight size={17} /></Link><Link className={styles.secondary} href="/services">Explore More Solutions</Link></div><Link className={styles.textLink} href="https://cal.com/tomorrowstechai/discovery">Schedule a Call Now</Link></section></div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <Link href="/services/ai-business-operator#pricing" className={styles.back}>← Back to Pricing</Link><span className={styles.stepCount}>Step {step} of 3</span>
          <div className={styles.progress}>{["Your Information", "Business Details", "Submit"].map((label, index) => <div key={label} className={index + 1 <= step ? styles.activeStep : ""}><span>{index + 1}</span><b>{label}</b></div>)}</div>
          <div className={styles.eyebrow}>Almost there</div><h1>Let’s Get You <em>Started</em></h1><p>Tell us a little about your business. We’ll review your information and contact you with the best way to get your AI Business Operator launched.</p>
        </div>
      </section>

      <section className={styles.content}>
        <aside className={styles.planCard}><span className={styles.planBadge}>Selected plan</span><h2>{plan.name}</h2><p>{plan.description}</p><div className={styles.price}>{plan.price}<small>/ month</small></div><b className={styles.setup}>{plan.setup}</b><ul>{plan.features.map((feature) => <li key={feature}><IconBadgeCheck size={17} />{feature}</li>)}</ul><div className={styles.quote}><IconRocket size={24} /><b>You’re one step closer to a smarter business.</b><p>“We’ll handle the tech, so you can focus on the work you do best.”</p></div></aside>

        <main className={styles.formCard}>
          {step === 1 && <><FormHeading title="Your Information" body="Let’s start with the basics." />
            <Field label="Full Name *"><input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="John Smith" autoComplete="name" /></Field>
            <Field label="Email Address *"><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="john@yourcompany.com" autoComplete="email" /></Field>
            <Field label="Phone Number *"><input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(254) 555-0123" autoComplete="tel" /></Field>
            <Field label="Company Name *"><input value={form.company} onChange={(e) => update("company", e.target.value)} placeholder="Your Company LLC" autoComplete="organization" /></Field>
            <Field label="Website (if you have one)"><input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://www.yourwebsite.com" inputMode="url" /></Field>
          </>}
          {step === 2 && <><FormHeading title="Business Details" body="Help us recommend the right launch plan." />
            <div className={styles.twoCol}><Field label="Industry *"><select value={form.industry} onChange={(e) => update("industry", e.target.value)}><option value="">Select your industry</option>{["Pool Company", "HVAC", "Roofing", "Tower / Telecom", "Plumbing", "Electrical", "Landscaping", "Automotive", "General Contractor", "Home Services", "Professional Services", "Other"].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Number of Employees"><select value={form.employees} onChange={(e) => update("employees", e.target.value)}><option value="">Select range</option>{["Just Me", "2–5", "6–10", "11–25", "26–50", "51+"].map(x => <option key={x}>{x}</option>)}</select></Field></div>
            <Field label="Approximate Monthly Leads"><select value={form.monthlyLeads} onChange={(e) => update("monthlyLeads", e.target.value)}><option value="">Select range</option>{["Under 10", "10–25", "26–50", "51–100", "100+"].map(x => <option key={x}>{x}</option>)}</select></Field>
            <fieldset><legend>What should your AI Business Operator improve?</legend><div className={styles.checkGrid}>{challenges.map(x => <label key={x}><input type="checkbox" checked={form.challenges.includes(x)} onChange={() => toggleChallenge(x)} /><span>{x}</span></label>)}</div></fieldset>
            <div className={styles.twoCol}><Field label="Preferred contact method *"><select value={form.contactMethod} onChange={(e) => update("contactMethod", e.target.value)}><option value="">Choose one</option><option>Phone</option><option>Text</option><option>Email</option></select></Field><Field label="Best time to contact"><select value={form.bestTime} onChange={(e) => update("bestTime", e.target.value)}><option value="">Anytime</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select></Field></div>
            {form.contactMethod === "Text" && <label className={styles.consent}><input type="checkbox" checked={form.smsConsent} onChange={(e) => update("smsConsent", e.target.checked)} /> I agree to receive service-related text messages from Tomorrow’s Tech AI. Message and data rates may apply. Reply STOP to opt out.</label>}
            <Field label="Anything else we should know?"><textarea rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Tell us about your current setup or goals." /></Field>
          </>}
          {step === 3 && <><FormHeading title="Review Your Information" body="Confirm your details and send your request." /><div className={styles.review}><Review title="Selected Plan" value={`${plan.name} — ${plan.price}/month, ${plan.setup}`} /><Review title="Contact Information" value={`${form.fullName} · ${form.email} · ${form.phone}`} action={() => setStep(1)} /><Review title="Business Details" value={`${form.company} · ${form.industry}${form.website ? ` · ${form.website}` : ""}`} action={() => setStep(2)} /><Review title="Challenges" value={form.challenges.length ? form.challenges.join(", ") : "To be discussed"} /><Review title="Preferred Contact Method" value={`${form.contactMethod}${form.bestTime ? ` · ${form.bestTime}` : ""}`} /><Review title="Notes" value={form.notes || "None"} /></div><p className={styles.noPayment}>No payment is required at this stage.</p></>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>{step > 1 && <button type="button" className={styles.secondary} onClick={() => { setError(""); setStep(step - 1); }}>Back</button>}<button type="button" className={styles.primary} disabled={sending} onClick={step === 3 ? submit : next}>{sending ? "Submitting…" : step === 3 ? "Submit My Business" : step === 2 ? "Review Information" : "Next Step"}<IconArrowRight size={17} /></button></div>
          <p className={styles.secure}><IconLock size={14} /> Your information is secure and will never be shared.</p>
        </main>

        <aside className={styles.side}><div className={styles.infoCard}><h3><IconRocket size={22} /> What Happens Next?</h3>{["You submit your information", "We review your business", "We contact you"].map((x, i) => <div className={styles.next} key={x}><span>{i + 1}</span><div><b>{x}</b><p>{["Takes less than 2 minutes.", "We look at your current setup and goals.", "We’ll reach out with the best next steps."][i]}</p></div></div>)}</div><div className={styles.infoCard}><h3><IconCalendar size={22} /> Prefer to Talk Now?</h3><p>Want to discuss your setup before submitting? No problem.</p><Link href="https://cal.com/tomorrowstechai/discovery" className={styles.secondary}>Schedule a Call</Link></div><div className={styles.infoCard}><h3><IconShield size={22} /> You’re in Good Hands</h3>{["Secure & Private", "No Obligation", "Real Human Support", "Built for Service Businesses"].map(x => <p className={styles.trust} key={x}><IconBadgeCheck size={17} />{x}</p>)}</div></aside>
      </section>
      <section className={styles.benefits}>{[[IconRocket,"Save Time"],[IconChart,"Get More Jobs"],[IconUsers,"Happier Customers"],[IconArrowRight,"Grow Your Business"]].map(([Icon,label]) => <div key={label as string}><span><Icon size={24} /></span><b>{label as string}</b></div>)}</section>
    </div>
  );
}

function FormHeading({ title, body }: { title: string; body: string }) { return <div className={styles.formHeading}><h2>{title}</h2><p>{body}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }
function Review({ title, value, action }: { title: string; value: string; action?: () => void }) { return <div><b>{title}</b>{action && <button type="button" onClick={action}>Edit</button>}<p>{value}</p></div>; }
