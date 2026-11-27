-- Tomorrow's Tech AI Academy: who bought which course, and the certificates
-- issued when someone passes a course's knowledge check.
--
-- Server only: row level security is on and there are no policies, so the
-- public site reads and writes these through the service role and nothing
-- else can.

create table if not exists public.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  course_slug text not null,
  -- paid: bought through Stripe. comp: granted by hand (a gift, a partner, a refund kept open).
  -- refunded: access removed.
  status text not null default 'paid' check (status in ('paid', 'comp', 'refunded')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists academy_enrollments_email_idx on public.academy_enrollments (lower(email));
create unique index if not exists academy_enrollments_email_course_idx
  on public.academy_enrollments (lower(email), course_slug) where status <> 'refunded';

alter table public.academy_enrollments enable row level security;

create table if not exists public.academy_certificates (
  -- The public verification code printed on the certificate, e.g. TTA-7K2M-QX9P.
  id text primary key,
  email text not null,
  name text not null,
  course_slug text not null,
  score integer not null check (score between 0 and 100),
  issued_at timestamptz not null default now()
);

create unique index if not exists academy_certificates_email_course_idx
  on public.academy_certificates (lower(email), course_slug);

alter table public.academy_certificates enable row level security;

-- To give someone a course for free (no Stripe), run:
--   insert into public.academy_enrollments (email, course_slug, status)
--   values ('student@example.com', 'speak-method', 'comp');
-- They then use "Get access" on the Academy with that email.

-- The site looks students up by exact, lowercased email. Store them that way
-- (so a hand-entered 'comp' row must use a lowercase address).
alter table public.academy_enrollments
  add constraint academy_enrollments_email_lower check (email = lower(btrim(email)));
alter table public.academy_certificates
  add constraint academy_certificates_email_lower check (email = lower(btrim(email)));
