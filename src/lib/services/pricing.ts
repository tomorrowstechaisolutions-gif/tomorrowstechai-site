export function grossMargin(price: number, cost: number | null): number | null {
  return cost === null || !Number.isFinite(cost) || !Number.isFinite(price) || price <= 0 ? null : (price - cost) / price * 100;
}
export function money(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format((Number(cents) || 0) / 100); }
export function marginLabel(value: number | null) { return value === null ? '—' : `${Number(value).toFixed(1)}%`; }
export function intervalLabel(months: number) { return months === 1 ? '/mo' : months === 3 ? '/qtr' : months === 12 ? '/yr' : `/${months} mo`; }
export function priceLabel(s: { billing_type: string; from_cents: number; interval_months: number; requires_quote?: boolean }) {
  if (s.billing_type === 'custom_quote' || s.requires_quote) return 'Custom';
  return money(s.from_cents) + (s.billing_type === 'recurring' ? intervalLabel(s.interval_months) : s.billing_type === 'usage_based' ? '/unit' : '');
}
export function parseMoney(value: unknown, nullable = false): number | null {
  if (value === '' || value === null || value === undefined) return nullable ? null : 0;
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Enter a valid non-negative amount with up to two decimal places.');
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error('Amount is too large.');
  return cents;
}
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
