import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, getAdminUser } from '@/lib/supabase/server';
import { loadServiceList } from '@/lib/services/queries';
import { BILLING_LABELS, BILLING_TYPES, SERVICE_STATUSES, SERVICE_TYPES } from '@/lib/services/types';
import { money, marginLabel } from '@/lib/services/pricing';
import { REVENUE_CATEGORIES } from '@/lib/supabase/types';
import ServicesTable from '@/components/admin/cc/services/ServicesTable';
import { ServiceModal } from '@/components/admin/cc/services/ServiceForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Services' };
export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminUser(); if (!session) redirect('/admin/login');
  const canManage = ['owner', 'admin'].includes(session.admin.role);
  const params = await searchParams; const { services, total, summary: k, page, period } = await loadServiceList(await createSupabaseServerClient(), params);
  const pick = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const revenueTotal = Number(k.recurring_revenue_cents) + Number(k.one_time_cents);
  const recurringShare = revenueTotal > 0 ? Number(k.recurring_revenue_cents) / revenueTotal * 100 : 0;
  const revenueLabel = period === 'month' ? 'Revenue This Month' : period === 'quarter' ? 'Revenue This Quarter' : period === 'year' ? 'Revenue This Year' : 'Revenue · All Time';
  const pageLink = (n: number) => { const p = new URLSearchParams(Object.entries(params).filter((e): e is [string,string] => typeof e[1] === 'string')); p.set('page', String(n)); return `/admin/services?${p}`; };
  return <>
    <div className="cc-greet"><div><h1>Services</h1><p>Manage the individual services Tomorrow’s Tech AI offers. Packages are managed separately.</p></div><div className="sv-actions"><Link href="/admin/packages" className="cc-btn">Manage Packages</Link><Link href="/admin/catalog" className="cc-btn">View Catalog</Link>{canManage && <ServiceModal />}</div></div>
    <div className="sv-kpis">{[['Active Services', k.active_services, 'Available operational services'], ['Monthly Recurring Revenue', money(k.mrr_cents), 'Current run rate from active assignments'], [revenueLabel, money(k.revenue_cents), `${period === 'all' ? 'All recorded time' : `Selected period: this ${period}`}`], ['Active Clients', k.active_clients, `${k.subscriptions} recurring service assignments`], ...(canManage ? [['Average Gross Margin', marginLabel(k.average_margin), 'Only services with valid cost data']] : [])].map(([label, value, note]) => <section className="sv-kpi" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></section>)}</div>
    <section className="sv-summary-grid" aria-label="Business summary">
      <div className="cc-panel sv-summary-card"><div className="sv-section-heading"><div><span className="sv-eyebrow">Revenue Mix</span><h2>{money(revenueTotal)}</h2></div><small>{period === 'all' ? 'All recorded time' : `This ${period}`}</small></div><div className="sv-mix-bar" aria-label={`${recurringShare.toFixed(0)}% recurring revenue`}><span style={{width:`${recurringShare}%`}} /></div><div className="sv-mix-legend"><div><i className="recurring" /><span>Recurring Revenue</span><strong>{money(k.recurring_revenue_cents)}</strong></div><div><i /><span>One-Time Revenue</span><strong>{money(k.one_time_cents)}</strong></div></div></div>
      <div className="cc-panel sv-summary-card"><div className="sv-section-heading"><div><span className="sv-eyebrow">Top Performing Services</span><h2>Current leaders</h2></div><small>Revenue or MRR</small></div>{k.top_services?.some(service => service.mrr_cents || service.revenue_cents) ? <ol className="sv-leaders">{k.top_services.filter(service => service.mrr_cents || service.revenue_cents).map(service => <li key={service.id}><Link className="cc-link" href={`/admin/services/${service.id}`}>{service.name}</Link><strong>{service.mrr_cents > service.revenue_cents ? `${money(service.mrr_cents)} MRR` : money(service.revenue_cents)}</strong></li>)}</ol> : <p className="sv-muted">Revenue leaders will appear after service assignments or collected invoices are linked.</p>}</div>
    </section>
    <form className="sv-toolbar"><label>Search<input className="cc-input" name="q" placeholder="Search services..." defaultValue={pick('q')} /></label>
      {([['status', 'Status', SERVICE_STATUSES], ['type', 'Service Type', SERVICE_TYPES], ['category', 'Category', REVENUE_CATEGORIES], ['billing', 'Billing Type', BILLING_TYPES]] as const).map(([key,label,values]) => <label key={key}>{label}<select className="cc-select" name={key} defaultValue={pick(key)}><option value="">All</option>{values.map(v => <option key={v} value={v}>{BILLING_LABELS[v] ?? v.replaceAll('_', ' ')}</option>)}</select></label>)}
      {canManage && <><label>Health<select className="cc-select" name="health" defaultValue={pick('health')}><option value="">All</option><option value="healthy">Healthy</option><option value="needs_attention">Needs Attention</option><option value="low_margin">Low Margin</option><option value="no_clients">No Clients</option><option value="missing_cost">Missing Cost</option></select></label><label>Profitability<select className="cc-select" name="profitability" defaultValue={pick('profitability')}><option value="">All</option><option value="strong">60%+ margin</option><option value="positive">0–59.9% margin</option><option value="low">Negative margin</option><option value="unknown">Cost not set</option></select></label></>}
      <label>Sort<select name="sort" className="cc-select" defaultValue={pick('sort') || 'name'}>{Object.entries({ name:'Name', highest_revenue:'Highest Revenue', highest_mrr:'Highest MRR', ...(canManage ? { highest_margin:'Highest Margin', lowest_margin:'Lowest Margin' } : {}), most_clients:'Most Clients', newest:'Newest' }).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Reporting period<select name="period" className="cc-select" defaultValue={period}>{['month','quarter','year','all'].map(v => <option key={v} value={v}>{v === 'all' ? 'All time' : `This ${v}`}</option>)}</select></label><button className="cc-btn primary">Apply</button><Link className="cc-btn" href="/admin/services">Reset</Link>
    </form>
    <section className="cc-panel">{services.length ? <ServicesTable services={services} canManage={canManage} /> : <div className="sv-empty"><h2>{Object.keys(params).length ? 'No matching services' : 'No services yet'}</h2><p className="sv-muted">{Object.keys(params).length ? 'Try a different search or clear your filters.' : 'Create your first service to start managing pricing, clients, revenue, and operational workflows.'}</p>{canManage && <ServiceModal />}</div>}</section>
    <div className="sv-pager"><span>{total} services · Page {page} of {Math.max(1,Math.ceil(total/25))}</span><div className="sv-actions">{page>1 && <Link className="cc-btn" href={pageLink(page-1)}>Previous</Link>}{page*25<total && <Link className="cc-btn" href={pageLink(page+1)}>Next</Link>}</div></div>
    <p className="sv-muted">Revenue is collected USD attributed to service invoice lines, after discounts. Unlinked historical sales are excluded. MRR uses agreed client-service prices normalized to a month. Changing service availability does not cancel client billing.</p>
  </>;
}
