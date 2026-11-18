-- Expenses: receipts (scanned or uploaded), which business they belong to,
-- and how they were paid.
--
-- paid_with = 'business'  → paid from Mercury. Finance already counts the bank
--                           line, so the expense only carries the receipt and
--                           links to that line (bank_transaction_id).
-- paid_with = 'personal'  → paid out of pocket. Not in the bank feed, so
--                           Finance counts the expense itself, and it adds to
--                           what the business owes John until reimbursed_on.

alter table public.expenses
  add column if not exists business text not null default 'ttai',
  add column if not exists paid_with text not null default 'business',
  add column if not exists review_status text not null default 'confirmed',
  add column if not exists source text not null default 'manual',
  add column if not exists tax_cents integer,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists receipt_path text,
  add column if not exists receipt_mime text,
  add column if not exists receipt_name text,
  add column if not exists ai_read jsonb,
  add column if not exists bank_transaction_id text references public.bank_transactions(id) on delete set null,
  add column if not exists reimbursed_on date;

alter table public.expenses drop constraint if exists expenses_business_check;
alter table public.expenses add constraint expenses_business_check check (business in ('ttai', 'tomorrowstek'));
alter table public.expenses drop constraint if exists expenses_paid_with_check;
alter table public.expenses add constraint expenses_paid_with_check check (paid_with in ('business', 'personal'));
alter table public.expenses drop constraint if exists expenses_review_status_check;
alter table public.expenses add constraint expenses_review_status_check check (review_status in ('needs_review', 'confirmed'));
alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check check (source in ('manual', 'receipt'));

-- Categories a receipt can land in.
alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (category in (
  'software', 'contractor', 'hardware', 'hosting', 'fees', 'marketing', 'travel',
  'supplies', 'office', 'equipment', 'shipping', 'education', 'meals', 'other'
));

create index if not exists expenses_occurred_at_idx on public.expenses (occurred_at desc);
create index if not exists expenses_review_idx on public.expenses (review_status) where review_status = 'needs_review';
create unique index if not exists expenses_bank_txn_uidx on public.expenses (bank_transaction_id) where bank_transaction_id is not null;

-- Receipts are private: only the server (service role) reads and writes them,
-- and the admin views them through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;
