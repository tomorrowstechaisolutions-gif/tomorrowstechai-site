import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { priceLabel } from '@/lib/services/pricing';
import type { Service } from '@/lib/services/types';

export const dynamic = 'force-dynamic';
export default async function CatalogPage() {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('catalog_items').select('id,name,description,category,status,from_cents,billing_type,interval_months,requires_quote,catalog_enabled').order('position').order('name');
  return <>
    <div className="cc-greet"><div><h1>Catalog</h1><p>Sales presentation and reference pricing, connected to your master Services records.</p></div><Link href="/admin/services" className="cc-btn">Manage Services</Link></div>
    {error ? <div className="cc-error">The catalog could not be loaded. Please retry.</div> : <section className="cc-panel"><div className="ad-table-scroll"><table className="ad-table"><thead><tr><th>Service</th><th>Description</th><th>Category</th><th>Price</th><th>Availability</th><th /></tr></thead><tbody>{data?.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.description || '—'}</td><td>{item.category.replaceAll('_',' ')}</td><td>{priceLabel(item as Service)}</td><td>{item.status === 'active' && item.catalog_enabled ? 'Available' : 'Hidden'}</td><td><Link className="cc-link" href={`/admin/services/${item.id}?tab=settings`}>Manage</Link></td></tr>)}</tbody></table></div>{!data?.length && <p className="cc-panel-body">No services yet. Create your first service to add it to the Catalog.</p>}</section>}
    <p className="ad-muted" style={{marginTop:16}}>Prices, billing, status, and availability are managed in Services. Existing proposals and invoices keep their agreed prices.</p>
  </>;
}
