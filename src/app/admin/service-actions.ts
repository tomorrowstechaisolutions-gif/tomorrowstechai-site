'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, getAdminUser } from '@/lib/supabase/server';
import { AVAILABILITY, BILLING_TYPES, SERVICE_STATUSES, SERVICE_TYPES, type ActionResult } from '@/lib/services/types';
import { isUuid, parseMoney } from '@/lib/services/pricing';
import { REVENUE_CATEGORIES } from '@/lib/supabase/types';

async function access() {
  const session = await getAdminUser();
  if (!session || !['admin', 'owner'].includes(session.admin.role)) throw new Error('You do not have permission to change services.');
  return { db: await createSupabaseServerClient(), actor: session.admin.email };
}
const str = (fd: FormData, key: string, max = 2000) => String(fd.get(key) ?? '').trim().slice(0, max);
function uuid(fd: FormData, key: string) { const v = str(fd, key, 40); if (!isUuid(v)) throw new Error('Invalid record. Reload the page and try again.'); return v; }
function integer(fd: FormData, key: string, min: number, max: number) { const n = Number(str(fd, key)); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Enter a valid ${key.replaceAll('_', ' ')}.`); return n; }
function touch(id?: string) { for (const path of ['/admin/services', '/admin/catalog', '/admin', '/admin/tasks', '/admin/jobs']) revalidatePath(path); if (id) revalidatePath(`/admin/services/${id}`); }
function failure(e: unknown): ActionResult { return { error: e instanceof Error ? e.message : 'Save failed. Please retry.' }; }
function check(error: { code?: string } | null) { if (error) throw new Error(error.code === '23505' ? 'That name, SKU, or relationship already exists.' : error.code === '40001' ? 'This service changed since you opened it. Reload before saving.' : 'The change could not be saved. Please reload and try again.'); }

export async function saveService(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { db } = await access();
    const id = str(fd, 'id') ? uuid(fd, 'id') : null;
    const name = str(fd, 'name', 120); if (!name) throw new Error('Service name is required.');
    const status = str(fd, 'status'); const billing = str(fd, 'billing_type'); const type = str(fd, 'service_type'); const category = str(fd, 'category');
    if (!(SERVICE_STATUSES as readonly string[]).includes(status) || !(BILLING_TYPES as readonly string[]).includes(billing) || !(SERVICE_TYPES as readonly string[]).includes(type) || !(REVENUE_CATEGORIES as readonly string[]).includes(category)) throw new Error('Select valid service settings.');
    const interval = str(fd, 'billing_interval'); if (!['monthly', 'quarterly', 'yearly', 'custom'].includes(interval)) throw new Error('Select a billing interval.');
    const data = { name, sku: str(fd, 'sku', 80) || null, description: str(fd, 'description', 4000) || null, category, service_type: type, status, billing_type: billing, billing_interval: interval,
      interval_months: interval === 'custom' ? integer(fd, 'interval_months', 1, 120) : interval === 'yearly' ? 12 : interval === 'quarterly' ? 3 : 1,
      from_cents: parseMoney(str(fd, 'price')), setup_fee_cents: parseMoney(str(fd, 'setup_fee')), taxable: fd.get('taxable') === 'on', position: integer(fd, 'position', 0, 100000),
      ...Object.fromEntries(Object.keys(AVAILABILITY).map(key => [key, fd.get(key) === 'on'])),
    };
    const { data: saved, error } = await db.rpc('save_service', { p_id: id, p_data: data, p_cost: { internal_cost_cents: parseMoney(str(fd, 'internal_cost'), true), recurring_cost_cents: parseMoney(str(fd, 'recurring_cost'), true) }, p_expected: str(fd, 'updated_at') || null });
    check(error); touch(saved); return { success: 'Service saved.', id: saved };
  } catch (e) { return failure(e); }
}

export async function changeServiceStatus(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { db } = await access(); const id = uuid(fd, 'id'); const status = str(fd, 'status');
    if (!(SERVICE_STATUSES as readonly string[]).includes(status)) throw new Error('Select a valid status.');
    const { data, error } = await db.from('catalog_items').update({ status }).eq('id', id).eq('updated_at', str(fd, 'updated_at')).select('id');
    check(error); if (!data?.length) throw new Error('This service changed. Reload and try again.'); touch(id); return { success: `Service ${status}.` };
  } catch (e) { return failure(e); }
}

export async function savePackage(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { db, actor } = await access(); const serviceId = uuid(fd, 'service_id'); const packageId = uuid(fd, 'package_id');
    if (serviceId === packageId) throw new Error('A service cannot include itself.');
    const type = str(fd, 'relationship_type'); if (!['included', 'addon'].includes(type)) throw new Error('Choose a relationship type.');
    const quantity = Number(str(fd, 'quantity')); if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) throw new Error('Enter a positive quantity.');
    const { error } = await db.from('service_package_relationships').upsert({ service_id: serviceId, package_id: packageId, relationship_type: type, quantity, notes: str(fd, 'notes') || null }, { onConflict: 'service_id,package_id' });
    check(error); await db.from('service_events').insert({ service_id: serviceId, event_type: 'package_changed', body: 'Package relationship saved.', actor }); touch(serviceId); return { success: 'Package relationship saved.' };
  } catch (e) { return failure(e); }
}
export async function removePackage(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try { const { db } = await access(); const id = uuid(fd, 'service_id'); const { error } = await db.from('service_package_relationships').delete().eq('id', uuid(fd, 'id')).eq('service_id', id); check(error); touch(id); return { success: 'Relationship removed.' }; } catch (e) { return failure(e); }
}
export async function saveAutomation(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { db, actor } = await access(); const id = uuid(fd, 'service_id');
    const { error } = await db.from('service_automation_settings').upsert({ service_id: id, create_project: fd.get('create_project') === 'on', task_template_id: str(fd, 'task_template_id') ? uuid(fd, 'task_template_id') : null, default_assignee: str(fd, 'default_assignee', 200) || null, due_date_offset_days: integer(fd, 'due_date_offset_days', 0, 3650), notify_admin: fd.get('notify_admin') === 'on' });
    check(error); await db.from('service_events').insert({ service_id: id, event_type: 'automation_changed', body: 'Activation workflow updated.', actor }); touch(id); return { success: 'Activation workflow saved.' };
  } catch (e) { return failure(e); }
}
export async function assignClient(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { db } = await access(); const id = uuid(fd, 'service_id');
    const { data: s, error: serviceError } = await db.from('catalog_items').select('billing_type,interval_months,status').eq('id', id).single(); check(serviceError);
    if (!s || s.status !== 'active') throw new Error('Activate this service before assigning clients.');
    const start = str(fd, 'start_date'); const next = str(fd, 'next_billing_date') || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(start)) || (next && (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next < start))) throw new Error('Enter valid billing dates.');
    const { error } = await db.from('client_services').upsert({ service_id: id, customer_id: uuid(fd, 'customer_id'), activation_key: uuid(fd, 'activation_key'), sale_price_cents: parseMoney(str(fd, 'sale_price')), billing_type: s.billing_type, interval_months: s.interval_months, start_date: start, next_billing_date: next, subscription_id: str(fd, 'subscription_id', 200) || null }, { onConflict: 'activation_key', ignoreDuplicates: true });
    check(error); touch(id); return { success: 'Client assigned. The configured activation workflow has run.' };
  } catch (e) { return failure(e); }
}
export async function changeAssignment(_previous: ActionResult, fd: FormData): Promise<ActionResult> {
  try { const { db } = await access(); const id = uuid(fd, 'service_id'); const status = str(fd, 'status'); if (!['active', 'paused', 'ended'].includes(status)) throw new Error('Choose a valid status.');
    const { error } = await db.from('client_services').update({ status, end_date: status === 'ended' ? new Date().toISOString().slice(0, 10) : null }).eq('id', uuid(fd, 'id')).eq('service_id', id); check(error); touch(id); return { success: 'Client service updated. Update the billing provider separately if needed.' };
  } catch (e) { return failure(e); }
}
