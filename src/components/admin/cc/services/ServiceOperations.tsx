import { saveDetailedCosts, saveDeliverable, saveInclusion, savePricingTerms, removeDeliverable, removeInclusion } from '@/app/admin/service-actions';
import { FREQUENCY_LABELS, SERVICE_FREQUENCIES, type Service, type ServiceDeliverable, type ServiceInclusion } from '@/lib/services/types';
import { money } from '@/lib/services/pricing';
import { ActionForm } from './ServiceForms';

type StructuredItem = ServiceInclusion | ServiceDeliverable;

function ItemFields({ item, deliverable = false }: { item?: StructuredItem; deliverable?: boolean }) {
  return <div className="sv-fields">
    <label>Item Name<input name="name" className="cc-input" required maxLength={160} defaultValue={item?.name ?? ''} /></label>
    <label>Quantity<input name="quantity" className="cc-input" type="number" min="0" step="0.01" defaultValue={item?.quantity ?? ''} placeholder="No fixed quantity" /></label>
    <label>Frequency<select name="frequency" className="cc-select" defaultValue={item?.frequency ?? 'as_needed'}>{SERVICE_FREQUENCIES.map(value => <option key={value} value={value}>{FREQUENCY_LABELS[value]}</option>)}</select></label>
    <label>Custom Frequency<input name="custom_frequency" className="cc-input" maxLength={160} defaultValue={item?.custom_frequency ?? ''} placeholder="Used when frequency is Custom" /></label>
    {!deliverable && <label>Offering Type<select name="offering_type" className="cc-select" defaultValue={(item && 'is_optional_addon' in item && item.is_optional_addon) ? 'addon' : 'included'}><option value="included">Included</option><option value="addon">Optional Add-On</option></select></label>}
    <label>Sort Order<input name="sort_order" className="cc-input" type="number" min="-100000" max="100000" defaultValue={item?.sort_order ?? 0} /></label>
    {deliverable && <label>Automation Key<input name="automation_key" className="cc-input" maxLength={160} defaultValue={(item && 'automation_key' in item) ? item.automation_key ?? '' : ''} placeholder="Optional future workflow key" /></label>}
    <label className="sv-span-2">Description<textarea name="description" className="cc-textarea" rows={2} maxLength={4000} defaultValue={item?.description ?? ''} /></label>
    <label className="sv-span-2">Client-Facing Description<textarea name="client_facing_description" className="cc-textarea" rows={2} maxLength={4000} defaultValue={item?.client_facing_description ?? ''} /></label>
    <label className="sv-span-2">Internal Notes<textarea name="internal_notes" className="cc-textarea" rows={2} maxLength={4000} defaultValue={item?.internal_notes ?? ''} /></label>
  </div>;
}

function ItemCard({ serviceId, item, deliverable, canManage }: { serviceId: string; item: StructuredItem; deliverable: boolean; canManage: boolean }) {
  const optional = 'is_optional_addon' in item && item.is_optional_addon;
  const frequency = item.frequency === 'custom' ? item.custom_frequency || 'Custom' : FREQUENCY_LABELS[item.frequency] || item.frequency;
  return <article className="sv-item-card">
    <div className="sv-item-head"><div><strong>{item.name}</strong><p>{item.client_facing_description || item.description || 'No client-facing description yet.'}</p></div><div className="sv-item-badges">{item.quantity != null && <span className="sv-badge">Qty {item.quantity}</span>}<span className="sv-badge">{frequency}</span>{optional && <span className="sv-badge sv-addon">Optional Add-On</span>}</div></div>
    {canManage && <details className="sv-item-edit"><summary>Edit</summary><ActionForm action={deliverable ? saveDeliverable : saveInclusion} label="Save Item"><input type="hidden" name="service_id" value={serviceId} /><input type="hidden" name="id" value={item.id} /><ItemFields item={item} deliverable={deliverable} /></ActionForm><ActionForm action={deliverable ? removeDeliverable : removeInclusion} label="Remove" confirm={`Remove ${item.name}?`}><input type="hidden" name="service_id" value={serviceId} /><input type="hidden" name="id" value={item.id} /></ActionForm></details>}
  </article>;
}

export function StructuredItemsPanel({ serviceId, items, deliverable = false, canManage }: { serviceId: string; items: StructuredItem[]; deliverable?: boolean; canManage: boolean }) {
  const noun = deliverable ? 'deliverable' : 'included item';
  return <>
    <section className="cc-panel sv-section"><div className="sv-section-heading"><div><h2>{deliverable ? 'Delivery templates' : "What's included"}</h2><p className="sv-muted">{deliverable ? 'Operational work promised for each client. Automation can use these records later.' : 'Structured customer promises kept separate from internal costs and notes.'}</p></div><span className="sv-count">{items.length}</span></div>
      {items.length ? <div className="sv-item-list">{items.map(item => <ItemCard key={item.id} serviceId={serviceId} item={item} deliverable={deliverable} canManage={canManage} />)}</div> : <div className="sv-empty compact"><h3>No {noun}s yet</h3><p className="sv-muted">Add the first structured {noun} to define this service clearly.</p></div>}
    </section>
    {canManage && <section className="cc-panel sv-section"><h2>+ Add {deliverable ? 'Deliverable' : 'Included Item'}</h2><ActionForm action={deliverable ? saveDeliverable : saveInclusion} label={`Add ${deliverable ? 'Deliverable' : 'Included Item'}`}><input type="hidden" name="service_id" value={serviceId} /><ItemFields deliverable={deliverable} /></ActionForm></section>}
  </>;
}

export function CostsPanel({ service, canManage }: { service: Service; canManage: boolean }) {
  const fields = [
    ['software_cost','Software Cost',service.software_cost_cents],['ai_api_cost','AI / API Cost',service.ai_api_cost_cents],['hosting_cost','Hosting Cost',service.hosting_cost_cents],
    ['contractor_cost','Contractor Cost',service.contractor_cost_cents],['ad_platform_cost','Ad Platform Cost',service.ad_platform_cost_cents],['other_cost','Other Cost',service.other_cost_cents],
  ] as const;
  return <section className="cc-panel sv-section"><h2>Internal cost configuration</h2><p className="sv-muted">Private operational data. The total drives gross profit, margin, and service health; it never appears in client-facing routes.</p>
    <div className="sv-profit-strip"><div><span>Total internal cost</span><strong>{service.effective_cost_cents == null ? 'Cost not set' : money(service.effective_cost_cents)}</strong></div><div><span>Calculated gross profit</span><strong>{service.gross_profit_cents == null ? '—' : money(service.gross_profit_cents)}</strong></div><div><span>Gross margin</span><strong>{service.margin == null ? '—' : `${Number(service.margin).toFixed(1)}%`}</strong></div></div>
    {canManage ? <ActionForm action={saveDetailedCosts} label="Save Internal Costs"><input type="hidden" name="service_id" value={service.id} /><div className="sv-fields">{fields.map(([name,label,value]) => <label key={name}>{label} ($)<input className="cc-input" name={name} type="number" min="0" step="0.01" defaultValue={value == null ? '' : value/100} placeholder="Not set" /></label>)}<label>Labor Hours<input className="cc-input" name="labor_hours" type="number" min="0" step="0.25" defaultValue={service.labor_hours ?? ''} placeholder="Not set" /></label><label>Labor Rate ($/hour)<input className="cc-input" name="labor_hourly_rate" type="number" min="0" step="0.01" defaultValue={service.labor_hourly_rate_cents == null ? '' : service.labor_hourly_rate_cents/100} placeholder="Not set" /></label><label className="sv-span-2">Internal Notes<textarea className="cc-textarea" name="notes" rows={3} defaultValue={service.cost_notes ?? ''} /></label></div></ActionForm> : <p className="sv-muted">Only owners and admins can view or change detailed cost components.</p>}
  </section>;
}

export function PricingTermsPanel({ service, canManage }: { service: Service; canManage: boolean }) {
  if (!canManage) return <section className="cc-panel sv-section"><p className="sv-muted">Your role can view standard pricing. Pricing rules require an owner or admin.</p></section>;
  return <section className="cc-panel sv-section"><h2>Pricing terms</h2><ActionForm action={savePricingTerms} label="Save Pricing Terms"><input type="hidden" name="service_id" value={service.id} /><div className="sv-fields"><label>Minimum Contract (months)<input className="cc-input" name="minimum_contract_months" type="number" min="0" max="120" defaultValue={service.minimum_contract_months} /></label><label>Trial Period (days)<input className="cc-input" name="trial_days" type="number" min="0" max="365" defaultValue={service.trial_days} /></label><label>Low-Margin Threshold (%)<input className="cc-input" name="margin_threshold_pct" type="number" min="-999.99" max="100" step="0.01" defaultValue={service.margin_threshold_pct} /></label><label className="sv-check"><input type="checkbox" name="custom_pricing_allowed" defaultChecked={service.custom_pricing_allowed} />Custom pricing allowed</label><label className="sv-span-2">Discount Rules<textarea className="cc-textarea" name="discount_rules" rows={3} defaultValue={service.discount_rules ?? ''} placeholder="Eligibility, approval limits, and exceptions" /></label><label className="sv-span-2">Renewal Settings<textarea className="cc-textarea" name="renewal_settings" rows={3} defaultValue={service.renewal_settings ?? ''} placeholder="Renewal timing, notice period, or review rules" /></label></div></ActionForm></section>;
}
