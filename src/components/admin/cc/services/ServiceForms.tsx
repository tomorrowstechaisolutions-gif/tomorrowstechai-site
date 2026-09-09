'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveService, changeServiceStatus } from '@/app/admin/service-actions';
import { AVAILABILITY, BILLING_LABELS, BILLING_TYPES, SERVICE_STATUSES, SERVICE_TYPES, type ActionResult, type Service } from '@/lib/services/types';
import { grossMargin, marginLabel, money } from '@/lib/services/pricing';
import { REVENUE_CATEGORIES } from '@/lib/supabase/types';

export function ActionForm({ action, children, label = 'Save', confirm, className = '' }: { action: (state: ActionResult, fd: FormData) => Promise<ActionResult>; children: React.ReactNode; label?: string; confirm?: string; className?: string }) {
  const [state, submit, pending] = useActionState(action, {});
  return <form action={submit} className={`sv-form ${className}`} onSubmit={event => { if (confirm && !window.confirm(confirm)) event.preventDefault(); }}>
    {children}
    {state.error && <p className="cc-error" role="alert">{state.error}</p>}
    {state.success && <p className="sv-success" role="status">{state.success}</p>}
    <button disabled={pending} className="cc-btn primary" type="submit">{pending ? 'Saving…' : label}</button>
  </form>;
}

export function StatusAction({ service, status }: { service: Service; status: string }) {
  return <ActionForm action={changeServiceStatus} label={status === 'retired' ? 'Retire' : status === 'active' ? 'Activate' : 'Pause'} confirm={`Set ${service.name} to ${status}? Existing client billing and historical transactions will remain intact.`}>
    <input type="hidden" name="id" value={service.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="updated_at" value={service.updated_at} />
  </ActionForm>;
}

export function ServiceEditor({ service, duplicate = false, onClose }: { service?: Service; duplicate?: boolean; onClose?: () => void }) {
  const [state, action, pending] = useActionState(saveService, {});
  const [billing, setBilling] = useState(service?.billing_type ?? 'one_time');
  const [interval, setInterval] = useState(service?.billing_interval ?? 'monthly');
  const [price, setPrice] = useState(service ? String(service.from_cents / 100) : '');
  const [cost, setCost] = useState(service?.internal_cost_cents == null ? '' : String(service.internal_cost_cents / 100));
  const [recurringCost, setRecurringCost] = useState(service?.recurring_cost_cents == null ? '' : String(service.recurring_cost_cents / 100));
  const [setup, setSetup] = useState(String((service?.setup_fee_cents ?? 0) / 100));
  const router = useRouter();
  useEffect(() => { if (state.id) { onClose?.(); router.push(`/admin/services/${state.id}`); router.refresh(); } }, [state.id, router, onClose]);
  const numeric = (v: string) => v === '' || !Number.isFinite(Number(v)) ? null : Number(v) * 100;
  const p = numeric(price) ?? 0; const c = numeric(cost); const rc = numeric(recurringCost); const base = billing === 'recurring' ? numeric(setup) ?? 0 : p;
  return <form action={action} className="sv-form" onSubmit={e => { if (service && !duplicate && !window.confirm(`Save changes to ${service.name}? Existing transactions keep their agreed prices.`)) e.preventDefault(); }}>
    {service && !duplicate && <><input type="hidden" name="id" value={service.id} /><input type="hidden" name="updated_at" value={service.updated_at} /></>}
    <h3>Basic information</h3>
    <div className="sv-fields">
      <label>Service Name<input name="name" className="cc-input" required maxLength={120} defaultValue={service ? service.name + (duplicate ? ' (copy)' : '') : ''} /></label>
      <label>Internal Name / SKU<input name="sku" className="cc-input" maxLength={80} defaultValue={duplicate ? '' : service?.sku ?? ''} /></label>
      <label>Category<select name="category" className="cc-select" defaultValue={service?.category ?? 'other'}>{REVENUE_CATEGORIES.map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Service Type<select name="service_type" className="cc-select" defaultValue={service?.service_type ?? 'Custom'}>{SERVICE_TYPES.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Status<select name="status" className="cc-select" defaultValue={duplicate ? 'draft' : service?.status ?? 'draft'}>{SERVICE_STATUSES.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Display Order<input name="position" className="cc-input" type="number" min={0} max={100000} defaultValue={service?.position ?? 0} required /></label>
    </div>
    <label>Description<textarea name="description" className="cc-textarea" rows={3} maxLength={4000} defaultValue={service?.description ?? ''} /></label>
    <h3>Billing & profitability</h3>
    <div className="sv-fields">
      <label>Billing Type<select name="billing_type" className="cc-select" value={billing} onChange={e => setBilling(e.target.value as typeof billing)}>{BILLING_TYPES.map(v => <option key={v} value={v}>{BILLING_LABELS[v]}</option>)}</select></label>
      <label>{billing === 'custom_quote' ? 'Reference price ($)' : billing === 'usage_based' ? 'Price per unit ($)' : 'Sale Price ($)'}<input name="price" className="cc-input" type="number" min="0" step="0.01" max="21474836.47" value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label>Setup Fee ($)<input name="setup_fee" className="cc-input" type="number" min="0" step="0.01" value={setup} onChange={e => setSetup(e.target.value)} /></label>
      <label>{billing === 'recurring' ? 'Setup internal cost ($)' : 'Internal Cost ($)'}<input name="internal_cost" className="cc-input" type="number" min="0" step="0.01" placeholder="Not set" value={cost} onChange={e => setCost(e.target.value)} /></label>
      <label hidden={billing !== 'recurring'}>Billing Interval<select name="billing_interval" className="cc-select" value={interval} onChange={e => setInterval(e.target.value)}>{['monthly', 'quarterly', 'yearly', 'custom'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label hidden={billing !== 'recurring' || interval !== 'custom'}>Custom interval (months)<input name="interval_months" type="number" className="cc-input" min={1} max={120} defaultValue={service?.interval_months ?? 1} /></label>
      <label hidden={billing !== 'recurring'}>Recurring cost per interval ($)<input name="recurring_cost" className="cc-input" type="number" min="0" step="0.01" placeholder="Not set" value={recurringCost} onChange={e => setRecurringCost(e.target.value)} /></label>
    </div>
    <label className="sv-check"><input name="taxable" type="checkbox" defaultChecked={service?.taxable} /> Taxable</label>
    <div className="sv-calculations" aria-live="polite">
      <span>{billing === 'recurring' ? 'Setup' : 'Gross'} profit <strong>{c === null ? 'Not set' : money(base - c)}</strong></span>
      <span>Gross margin <strong>{marginLabel(grossMargin(base, c))}</strong></span>
      {billing === 'recurring' && <><span>Recurring profit <strong>{rc === null ? 'Not set' : money(p - rc)}</strong></span><span>Recurring margin <strong>{marginLabel(grossMargin(p, rc))}</strong></span></>}
    </div>
    <h3>Sales availability</h3>
    <div className="sv-fields">{Object.entries(AVAILABILITY).map(([key, label]) => <label className="sv-check" key={key}><input type="checkbox" name={key} defaultChecked={service ? service[key as keyof typeof AVAILABILITY] : ['catalog_enabled', 'proposal_enabled', 'internal_sales_enabled', 'manual_invoice_enabled', 'discount_eligible'].includes(key)} />{label}</label>)}</div>
    <p className="sv-muted">Availability applies while the service is active. Taxability and quote requirements are saved with sales lines; custom quotes require a reviewed selling price.</p>
    {state.error && <p className="cc-error" role="alert">{state.error}</p>}
    <div className="sv-actions"><button disabled={pending} className="cc-btn primary">{pending ? 'Saving…' : duplicate ? 'Create draft copy' : 'Save Service'}</button>{onClose && <button type="button" className="cc-btn" onClick={onClose}>Cancel</button>}</div>
  </form>;
}

export function ServiceModal({ service, duplicate = false }: { service?: Service; duplicate?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const label = duplicate ? 'Duplicate' : service ? 'Edit Service' : '+ New Service';
  return <><button className={`cc-btn ${service ? '' : 'primary'}`} onClick={() => { setOpen(true); dialog.current?.showModal(); }}>{label}</button>
    <dialog ref={dialog} className="sv-modal" onClose={() => setOpen(false)} aria-label={label}>
      <div className="sv-modal-head"><h2>{label}</h2><button className="cc-btn" onClick={() => dialog.current?.close()} aria-label="Close service editor">×</button></div>
      {open && <ServiceEditor service={service} duplicate={duplicate} onClose={() => dialog.current?.close()} />}
    </dialog></>;
}
