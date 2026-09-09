import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from './pricing';
import { getAdminUser } from '@/lib/supabase/server';

/** Resolve attribution on the server. Never persist client-supplied snapshots. */
export async function snapshotServiceLines<T extends { service_id?: string | null; service_snapshot?: Record<string, unknown> | null }>(db: SupabaseClient, lines: T[], channel: 'proposal_enabled' | 'manual_invoice_enabled'): Promise<T[]> {
  const ids = [...new Set(lines.map(l=>l.service_id).filter((id): id is string=>Boolean(id)))];
  if (!ids.length) return lines;
  const session = await getAdminUser();
  if (!session || !['admin','owner'].includes(session.admin.role)) throw new Error('Only owners and admins may set service selling prices.');
  if (ids.some(id=>!isUuid(id))) throw new Error('Invalid service selection.');
  const { data, error } = await db.from('catalog_items').select('id,name,description,from_cents,billing_type,billing_interval,interval_months,setup_fee_cents,taxable,status,proposal_enabled,manual_invoice_enabled,requires_quote,requires_approval').in('id',ids);
  if (error) throw new Error('Service pricing could not be verified. Retry before saving.');
  return lines.map(line=>{
    if (!line.service_id) return { ...line, service_snapshot: null };
    const s = data?.find(s=>s.id===line.service_id);
    if (!s || s.status!=='active' || !s[channel]) throw new Error('A selected service is no longer available. Remove it or activate it before saving.');
    return { ...line, service_snapshot: { name:s.name, description:s.description, price_cents:s.from_cents, billing_type:s.billing_type, billing_interval:s.billing_interval, interval_months:s.interval_months, setup_fee_cents:s.setup_fee_cents, taxable:s.taxable } };
  });
}
