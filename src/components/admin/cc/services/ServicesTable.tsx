'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Service } from '@/lib/services/types';
import { BILLING_LABELS } from '@/lib/services/types';
import { money, priceLabel, marginLabel } from '@/lib/services/pricing';
import { ServiceModal, StatusAction } from './ServiceForms';

export default function ServicesTable({ services, canManage }: { services: Service[]; canManage: boolean }) {
  const router = useRouter();
  return <div className="ad-table-scroll"><table className="ad-table sv-table"><thead><tr>{['Service', 'Category', 'Billing', 'Price', ...(canManage ? ['Internal Cost', 'Margin'] : []), 'Clients', 'Revenue', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{services.map(s => <tr key={s.id} onClick={e => { if (!(e.target as HTMLElement).closest('a,button,form,details,dialog,input,select,textarea')) router.push(`/admin/services/${s.id}`); }}>
      <td><Link href={`/admin/services/${s.id}`} className="cc-link"><strong>{s.name}</strong></Link><small>{s.sku || s.service_type}</small></td>
      <td>{s.category.replaceAll('_', ' ')}</td><td>{BILLING_LABELS[s.billing_type]}</td><td className="sv-nowrap">{priceLabel(s)}</td>
      {canManage && <><td className="sv-nowrap">{(s.billing_type === 'recurring' ? s.recurring_cost_cents : s.internal_cost_cents) === null ? <span className="sv-muted">Not set</span> : money((s.billing_type === 'recurring' ? s.recurring_cost_cents : s.internal_cost_cents)!)}</td><td>{marginLabel(s.margin)}</td></>}
      <td>{s.active_clients}</td><td className="sv-nowrap">{money(s.revenue_cents)}{s.billing_type === 'recurring' && <small>{money(s.mrr_cents)} MRR</small>}</td><td><span className={`sv-badge sv-${s.status}`}>{s.status}</span></td>
      <td><details className="sv-menu"><summary aria-label={`Actions for ${s.name}`}>•••</summary><div><Link href={`/admin/services/${s.id}`} className="cc-btn">View</Link>{canManage && <><ServiceModal service={s} /><ServiceModal service={s} duplicate /><StatusAction service={s} status={s.status === 'active' ? 'paused' : 'active'} />{s.status !== 'retired' && <StatusAction service={s} status="retired" />}</>}</div></details></td>
    </tr>)}</tbody></table></div>;
}
