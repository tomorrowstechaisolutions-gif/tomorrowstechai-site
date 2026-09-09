import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment, Service, ServiceOption, ServiceSummary } from './types';
import { chicagoDate, zonedMidnightUtc } from '@/lib/time/chicago';

export async function loadServiceList(db: SupabaseClient, params: Record<string, string | string[] | undefined>) {
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const page = Math.min(100000, Math.max(1, Number.parseInt(value('page')) || 1));
  const period = ['month', 'quarter', 'year', 'all'].includes(value('period')) ? value('period') : 'month';
  const now = new Date();
  const [year, month] = chicagoDate(now).split('-').map(Number);
  const firstMonth = period === 'year' ? 1 : period === 'quarter' ? Math.floor((month-1)/3)*3+1 : month;
  const from = period === 'all' ? new Date('2000-01-01') : zonedMidnightUtc(`${year}-${String(firstMonth).padStart(2,'0')}-01`);
  const sorts: Record<string, string> = { name: 'name', revenue: 'revenue_cents', clients: 'active_clients', price: 'from_cents', margin: 'margin', updated: 'updated_at' };
  const sort = sorts[value('sort')] ?? 'name';
  let query = db.from('service_directory').select('*', { count: 'exact' });
  for (const [param, column] of [['status', 'status'], ['type', 'service_type'], ['category', 'category'], ['billing', 'billing_type']]) {
    if (value(param)) query = query.eq(column, value(param));
  }
  const search = value('q').trim().slice(0, 120).replace(/[\\%_]/g, '\\$&');
  if (search) query = query.ilike('name', `%${search}%`);
  const [rows, summary] = await Promise.all([
    query.order(sort, { ascending: sort === 'name', nullsFirst: false }).order('id').range((page - 1) * 25, page * 25 - 1),
    db.rpc('service_summary', { p_from: from.toISOString(), p_to: now.toISOString() }),
  ]);
  if (rows.error || summary.error) throw new Error('Services could not be loaded. Please retry.');
  return { services: rows.data as Service[], total: rows.count ?? 0, summary: summary.data as ServiceSummary, page, period };
}

/** Reusable on both the service and existing client detail screens. */
export async function loadClientServices(db: SupabaseClient, filter: { serviceId?: string; customerId?: string }, page = 1): Promise<{ rows: Assignment[]; count: number }> {
  let query = db.from('client_services').select('*, customers(name,business_name)', { count: 'exact' });
  if (filter.serviceId) query = query.eq('service_id', filter.serviceId);
  if (filter.customerId) query = query.eq('customer_id', filter.customerId);
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error('Client services could not be loaded.');
  const records = data ?? [];
  if (!records.length) return { rows: [], count: count ?? 0 };
  const revenue = await db.from('service_client_revenue').select('service_id,customer_id,revenue_cents').in('service_id',[...new Set(records.map(r=>r.service_id))]).in('customer_id',[...new Set(records.map(r=>r.customer_id))]);
  if (revenue.error) throw new Error('Client revenue could not be loaded.');
  const totals = new Map(revenue.data.map(r=>[`${r.service_id}:${r.customer_id}`,r.revenue_cents]));
  return { rows: records.map(row => ({ ...row, client_name: row.customers?.business_name || row.customers?.name || 'Client', revenue_cents: totals.get(`${row.service_id}:${row.customer_id}`) ?? 0 })) as Assignment[], count: count ?? 0 };
}

/** Explicit safe projection: this is also safe to pass to sales builders. */
export async function sellableServices(db: SupabaseClient, channel: 'proposal_enabled' | 'manual_invoice_enabled'): Promise<ServiceOption[]> {
  const { data, error } = await db.from('catalog_items')
    .select('id,name,description,from_cents,billing_type,billing_interval,interval_months,setup_fee_cents,taxable,requires_quote,requires_approval')
    .eq('status', 'active').eq(channel, true).order('name').limit(1000);
  if (error) throw new Error('Service choices could not be loaded.');
  return data as ServiceOption[];
}
