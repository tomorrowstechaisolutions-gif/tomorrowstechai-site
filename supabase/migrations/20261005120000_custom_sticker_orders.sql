-- Custom sticker ordering. All customer writes currently pass through trusted
-- server routes; the private bucket and tables are intentionally closed to the
-- anon/authenticated Data API until customer accounts are added.

create table if not exists public.sticker_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  sticker_type text not null check (sticker_type in ('standard-vinyl','laminated-vinyl','waterproof','clear','holographic','matte','gloss','die-cut','kiss-cut')),
  finish text,
  width numeric(7,2) not null check (width between 0.5 and 24),
  height numeric(7,2) not null check (height between 0.5 and 24),
  quantity integer not null check (quantity between 10 and 10000),
  design_method text not null check (design_method in ('upload','design-service','ai')),
  artwork_url text,
  original_artwork_url text,
  ai_prompt text,
  ai_generation_id uuid,
  qr_code_url text,
  design_instructions jsonb,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  design_fee numeric(10,2) not null default 0 check (design_fee >= 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  total numeric(10,2) not null check (total >= 0),
  production_notes text,
  status text not null default 'draft' check (status in ('draft','design_pending','design_review','approved','paid','in_production','ready','shipped','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sticker_order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sticker_orders(id) on delete cascade,
  file_kind text not null check (file_kind in ('original','design-logo','generated','final')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now()
);

create table if not exists public.sticker_ai_generations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.sticker_orders(id) on delete cascade,
  provider text not null,
  provider_generation_id text,
  prompt text not null,
  request jsonb not null default '{}'::jsonb,
  storage_path text,
  status text not null default 'complete' check (status in ('queued','generating','complete','failed')),
  created_at timestamptz not null default now()
);

create index if not exists sticker_orders_customer_id_idx on public.sticker_orders(customer_id);
create index if not exists sticker_orders_status_idx on public.sticker_orders(status);
create index if not exists sticker_order_files_order_id_idx on public.sticker_order_files(order_id);
create index if not exists sticker_ai_generations_order_id_idx on public.sticker_ai_generations(order_id);

alter table public.sticker_orders enable row level security;
alter table public.sticker_order_files enable row level security;
alter table public.sticker_ai_generations enable row level security;

revoke all on table public.sticker_orders from anon, authenticated;
revoke all on table public.sticker_order_files from anon, authenticated;
revoke all on table public.sticker_ai_generations from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sticker-orders', 'sticker-orders', false, 26214400, array['image/png','image/jpeg','application/pdf','image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

comment on table public.sticker_orders is 'Server-created custom sticker order drafts and production orders.';
comment on table public.sticker_order_files is 'Private storage object references for original, generated, and final production artwork.';
comment on table public.sticker_ai_generations is 'Provider-neutral audit trail for AI sticker generations.';
