import Link from 'next/link';
import type { Assignment } from '@/lib/services/types';
import { money, intervalLabel } from '@/lib/services/pricing';
import { changeAssignment } from '@/app/admin/service-actions';
import { ActionForm } from './ServiceForms';

export default function ClientAssignments({ rows, canManage }: { rows: Assignment[]; canManage: boolean }) {
  if (!rows.length) return <p className="sv-muted">No client assignments yet. Assign an existing client to track this service and activate its workflow.</p>;
  return <div className="ad-table-scroll"><table className="ad-table"><thead><tr>{['Client','Start Date','Status','Price','Next Billing','Lifetime Revenue','Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(a => <tr key={a.id} id={`assignment-${a.id}`}>
    <td><Link className="cc-link" href={`/admin/clients/${a.customer_id}`}>{a.client_name}</Link></td><td>{a.start_date}</td><td><span className={`sv-badge sv-${a.status}`}>{a.status}</span></td><td>{money(a.sale_price_cents)}{a.billing_type==='recurring' ? intervalLabel(a.interval_months) : ''}</td><td>{a.next_billing_date ?? 'Not set'}</td>
    <td>{money(a.revenue_cents)}</td><td><div className="sv-actions"><Link className="cc-btn" href={`/admin/invoices?customer=${a.customer_id}`}>Invoice History</Link>{a.job_id && <Link className="cc-btn" href={`/admin/jobs/${a.job_id}`}>Project</Link>}{a.subscription_id && <span className="sv-muted">Subscription: {a.subscription_id}</span>}</div>
      {canManage && <ActionForm action={changeAssignment} label="Update" confirm="Change the tracked client-service status? This does not change billing at the payment provider."><input type="hidden" name="id" value={a.id} /><input type="hidden" name="service_id" value={a.service_id} /><select className="cc-select" name="status" defaultValue={a.status}>{['active','paused','ended'].map(v => <option key={v}>{v}</option>)}</select></ActionForm>}
    </td>
  </tr>)}</tbody></table></div>;
}
