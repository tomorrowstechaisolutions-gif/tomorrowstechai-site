"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconBadgeCheck, IconCalendar, IconLock, IconMapPin, IconPhoneCall, IconRocket, IconShield, IconUsers } from "@/components/Icons";
import { type WebsitePackage, type WebsitePackageId } from "@/lib/website-packages";
import styles from "./WebsitePackageIntake.module.css";

type FormState = {
  packageId: WebsitePackageId | "";
  fullName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  project: string;
  referral: string;
  consent: boolean;
  hp_company_url: string;
};

type Errors = Partial<Record<keyof FormState | "form", string>>;

const emptyForm = (packageId: WebsitePackageId | ""): FormState => ({ packageId, fullName: "", email: "", phone: "", company: "", website: "", project: "", referral: "", consent: false, hp_company_url: "" });

export function WebsitePackageIntake({ initialPackageId,packages }: { initialPackageId: WebsitePackageId | "";packages:WebsitePackage[] }) {
  const [form, setForm] = useState<FormState>(() => emptyForm(initialPackageId));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => { startedAt.current = Date.now(); }, []);
  const selected = packages.find((item) => item.id === form.packageId) ?? null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  function choosePackage(id: WebsitePackageId) {
    update("packageId", id);
    window.history.replaceState(null, "", `/website-intake?package=${id}`);
  }

  function validate() {
    const next: Errors = {};
    if (!form.packageId) next.packageId = "Choose the package you’re interested in.";
    if (!form.fullName.trim()) next.fullName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (form.phone.replace(/\D/g, "").length < 10) next.phone = "Enter a valid phone number.";
    if (!form.company.trim()) next.company = "Enter your company name.";
    if (form.project.trim().length < 10) next.project = "Tell us a little more about your project.";
    if (!form.consent) next.consent = "Please agree so we can contact you.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/website-package-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, elapsed_ms: Date.now() - startedAt.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn’t submit your request.");
      setComplete(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) return <div className={styles.page}><section className={styles.success}><IconBadgeCheck size={58}/><span className={styles.eyebrow}>Request received</span><h1>Your Request Is In.</h1><p>Thanks for reaching out. We’ll review your website project and contact you with the best next steps.</p><div className={styles.successCard}><b>{selected?.name}</b><span>{selected?.price} one time</span><span>{form.company}</span><span>{form.email} · {form.phone}</span></div><div className={styles.successSteps}><b>What Happens Next?</b><span>1. We review your project</span><span>2. We confirm the right package</span><span>3. We contact you</span><span>4. We start your build</span></div><div className={styles.successActions}><Link href="/services" className={styles.primary}>Return to Services <IconArrowRight size={17}/></Link><Link href="/services" className={styles.secondary}>View More Solutions</Link></div><Link href="https://cal.com/tomorrowstechai/discovery" className={styles.scheduleLink}>Schedule a Call</Link></section></div>;

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>Website Package Inquiry</span><h1>Let’s Build<br/><em>Your Website.</em></h1><p>Tell us a little about your project and we’ll get back to you with the best next steps. No obligation. Just a faster, easier way to get online.</p></div>
      <div className={styles.heroVisual}><div className={styles.laptop}><div className={styles.screen}><Image src="/work/clearwater.webp" alt="Professional website shown on a laptop" fill priority sizes="(max-width: 800px) 90vw, 46vw"/></div><div className={styles.laptopBase}/></div><span>Your Website.<br/>A Stronger<br/>Tomorrow.</span></div>
    </section>

    <div className={styles.trustTop}>{[{Icon:IconRocket,title:"Fast Response",text:"Usually within 1 business day"},{Icon:IconShield,title:"No Obligation",text:"We’ll help you find the right fit"},{Icon:IconUsers,title:"Real Human Support",text:"Talk to our team, not a bot"}].map(({Icon,title,text})=><div key={title}><Icon size={28}/><span><b>{title}</b><small>{text}</small></span></div>)}</div>

    <main className={styles.main}>
      <section className={styles.packages}><span className={styles.eyebrow}>Our Website Packages</span><h2>Choose the Right Package</h2><p>Professional websites designed to help your business look better, get more leads, and grow online.</p>
        <div className={styles.packageGrid}>{packages.map((item)=><button type="button" onClick={()=>choosePackage(item.id)} className={`${styles.packageCard} ${form.packageId===item.id?styles.selected:""}`} aria-pressed={form.packageId===item.id} key={item.id}>{item.featured&&<span className={styles.popular}>Most Popular</span>}<h3>{item.name}</h3><p>{item.description}</p><div className={styles.price}>{item.price}<small>{item.price.includes("/")?"":"one time"}</small></div><div className={styles.hosting}>Hosting is selected separately where needed.</div><ul>{item.features.map(feature=><li key={feature}><IconBadgeCheck size={17}/>{feature}</li>)}</ul></button>)}</div>
        {errors.packageId&&<p className={styles.cardError}>{errors.packageId}</p>}
      </section>

      <div className={styles.formCard}>
        <div className={styles.formHeading}><span><IconMapPin size={30}/></span><div><h2>Request Information</h2><p>Fill out the form below and we’ll be in touch soon.</p></div></div>
        <form onSubmit={submit} noValidate>
          <div className={styles.full}><Field label="Website Package Interested In" error={errors.packageId} required><select value={form.packageId} onChange={(e)=>choosePackage(e.target.value as WebsitePackageId)} aria-invalid={!!errors.packageId}><option value="">Select a website package</option>{packages.map(item=><option value={item.id} key={item.id}>{item.name} — {item.price}</option>)}</select></Field></div>
          <Field label="Full Name" error={errors.fullName} required><input value={form.fullName} onChange={(e)=>update("fullName",e.target.value)} placeholder="John Smith" autoComplete="name"/></Field>
          <Field label="Email Address" error={errors.email} required><input type="email" value={form.email} onChange={(e)=>update("email",e.target.value)} placeholder="john@yourcompany.com" autoComplete="email"/></Field>
          <Field label="Phone Number" error={errors.phone} required><input type="tel" value={form.phone} onChange={(e)=>update("phone",e.target.value)} placeholder="(254) 563-2130" autoComplete="tel"/></Field>
          <Field label="Company Name" error={errors.company} required><input value={form.company} onChange={(e)=>update("company",e.target.value)} placeholder="Your Company LLC" autoComplete="organization"/></Field>
          <div className={styles.full}><Field label="Website (if you have one)"><input type="url" value={form.website} onChange={(e)=>update("website",e.target.value)} placeholder="https://www.yourwebsite.com" autoComplete="url"/></Field></div>
          <div className={styles.full}><Field label="Tell us about your project" error={errors.project} required><textarea value={form.project} onChange={(e)=>update("project",e.target.value)} placeholder="What do you need? Any specific pages, features, or goals?" maxLength={2000}/><small className={styles.count}>{form.project.length}/2000</small></Field></div>
          <div className={styles.full}><Field label="How did you hear about us?"><select value={form.referral} onChange={(e)=>update("referral",e.target.value)}><option value="">Select an option</option>{["Google","Facebook","Instagram","LinkedIn","Referral","Existing Customer","Other"].map(item=><option key={item}>{item}</option>)}</select></Field></div>
          <input className={styles.honeypot} tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.hp_company_url} onChange={(e)=>update("hp_company_url",e.target.value)}/>
          <div className={`${styles.full} ${styles.consent}`}><label><input type="checkbox" checked={form.consent} onChange={(e)=>update("consent",e.target.checked)}/><span>I agree to be contacted about my website project. <b>*</b></span></label>{errors.consent&&<small className={styles.error}>{errors.consent}</small>}</div>
          {errors.form&&<div className={`${styles.full} ${styles.formError}`} role="alert">{errors.form}</div>}
          <button className={`${styles.full} ${styles.submit}`} disabled={submitting}>{submitting?"Submitting…":"Submit My Request"}<IconArrowRight size={19}/></button>
          <p className={`${styles.full} ${styles.secure}`}><IconLock size={15}/> Your information is secure and will never be shared.</p>
        </form>
      </div>
    </main>

    <section className={styles.contactStrip}><div><IconUsers size={29}/><span><b>Prefer to Talk Now?</b><small>Give us a call and we’ll be happy to help you.</small></span></div><a href="tel:+12545632130"><IconPhoneCall size={29}/><span><b>(254) 563-2130</b><small>Call our team directly</small></span></a><div><IconCalendar size={29}/><span><b>Schedule a Call</b><small>Book a quick call with our team.</small></span></div><Link href="https://cal.com/tomorrowstechai/discovery" className={styles.secondary}>Schedule Now <IconArrowRight size={16}/></Link></section>
  </div>;
}

function Field({label,error,required,children}:{label:string;error?:string;required?:boolean;children:React.ReactNode}) {
  return <label className={styles.field}><span>{label}{required&&<b> *</b>}</span>{children}{error&&<small className={styles.error}>{error}</small>}</label>;
}
