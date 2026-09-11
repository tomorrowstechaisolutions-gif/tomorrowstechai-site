'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Service } from '@/lib/services/types';
import { BILLING_LABELS, SERVICE_HEALTH_LABELS } from '@/lib/services/types';
import { money, priceLabel, marginLabel } from '@/lib/services/pricing';
import { ServiceModal, StatusAction } from './ServiceForms';

export default function ServicesTable({ services, canManage }: { services: Service[]; canManage: boolean }) {
  const router = useRouter();
  return <div className="ad-table-scroll sv-table-wrap"><table className="ad-table sv-table"><thead><tr>{['Service', 'Category', 'Billing', 'Price', ...(canManage ? ['Internal Cost', 'Gross Profit', 'Margin'] : []), 'Packages', 'Clients', 'Revenue', ...(canManage ? ['Health'] : []), 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{services.map(s => <tr key={s.id} onClick={e => { if (!(e.target as HTMLElement).closest('a,button,form,details,dialog,input,select,textarea')) router.push(`/admin/services/${s.id}`); }}>
      <td data-label="Service"><Link href={`/admin/services/${s.id}`} className="cc-link sv-service-name"><strong>{s.name}</strong></Link><small>{s.sku || s.service_type}</small></td>
      <td data-label="Category" className="sv-category">{s.category.replaceAll('_', ' ')}</td><td data-label="Billing"><span className={`sv-badge sv-billing-${s.billing_type}`}>{BILLING_LABELS[s.billing_type]}</span></td><td data-label="Price" className="sv-nowrap sv-value">{priceLabel(s)}</td>
      {canManage && <><td data-label="Internal Cost" className="sv-nowrap">{s.effective_cost_cents === null ? <span className="sv-muted">Cost not set</span> : money(s.effective_cost_cents)}</td><td data-label="Gross Profit" className="sv-nowrap sv-value">{s.gross_profit_cents === null ? '—' : money(s.gross_profit_cents)}</td><td data-label="Margin" className="sv-value">{marginLabel(s.margin)}</td></>}
      <td data-label="Packages"><Link className="cc-link sv-count-link" href={`/admin/services/${s.id}?tab=packages`}>{s.package_count??0}</Link></td><td data-label="Clients"><Link className="cc-link sv-count-link" href={`/admin/services/${s.id}?tab=clients`}>{s.active_clients}</Link></td><td data-label="Revenue" className="sv-nowrap sv-value">{money(s.revenue_cents)}{s.billing_type === 'recurring' && <small>{money(s.mrr_cents)} MRR</small>}</td>{canManage && <td data-label="Health"><span className={`sv-badge sv-health-${s.health}`}>{SERVICE_HEALTH_LABELS[s.health]}</span></td>}<td data-label="Status"><span className={`sv-badge sv-${s.status}`}>{s.status}</span></td>
      <td data-label="Actions"><details className="sv-menu"><summary aria-label={`Actions for ${s.name}`}>•••</summary><div><Link href={`/admin/services/${s.id}`} className="cc-btn">View</Link>{canManage && <><ServiceModal service={s} /><ServiceModal service={s} duplicate /><StatusAction service={s} status={s.status === 'active' ? 'paused' : 'active'} />{s.status !== 'retired' && <StatusAction service={s} status="retired" />}</>}</div></details></td>
    </tr>)}</tbody></table></div>;
}
