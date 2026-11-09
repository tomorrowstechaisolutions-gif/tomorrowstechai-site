-- Clients can be recorded before they've given an email address.
--
-- Real case: a client whose site was built and launched before billing, known
-- only by name and cell number. Requiring an email forced either a fake
-- placeholder address (which invoices would then be sent to) or leaving the
-- client out of the system entirely.
--
-- Safe to re-run. No data changes: existing rows all have an email.
-- Code that sends to a client (invoices, proposals, reminders, upsell
-- checkout) already refuses when there is no address on file.

alter table public.customers alter column email drop not null;
