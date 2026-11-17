-- Two lead statuses for records that are not leads.
--   Spam — vendor pitches and bots that got past the form trap.
--   Test — records we created ourselves.
-- They stay in the table (the history is real), but every count, rate,
-- funnel and badge in the admin filters them out via JUNK_FILTER in
-- src/lib/supabase/types.ts.

alter table public.leads drop constraint if exists leads_lead_status_check;
alter table public.leads
  add constraint leads_lead_status_check
  check (lead_status = any (array[
    'New', 'Contact Attempted', 'Contacted', 'Qualified', 'Demo Scheduled',
    'Proposal/Checkout Sent', 'Won', 'Lost', 'Follow Up Later',
    'Spam', 'Test'
  ]));
