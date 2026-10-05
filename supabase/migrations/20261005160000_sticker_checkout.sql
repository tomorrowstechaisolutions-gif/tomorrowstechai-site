alter table public.sticker_orders
  add column if not exists customer_email text,
  add column if not exists shipping_details jsonb,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists checkout_url text,
  add column if not exists paid_at timestamptz;

create unique index if not exists sticker_orders_stripe_session_id_idx
  on public.sticker_orders(stripe_session_id)
  where stripe_session_id is not null;

comment on column public.sticker_orders.shipping_details is 'Shipping name and address captured by Stripe Checkout after payment.';
comment on column public.sticker_orders.checkout_url is 'Most recently created Stripe Checkout URL for this order.';
