-- Security advisor clean-up (2026-11-27).
--
-- 1. SECURITY DEFINER functions reachable through /rest/v1/rpc.
--
--    is_admin()  Used by ~564 RLS policies (public + storage), every one of them
--                `to authenticated`. Policies hold the function by OID, and new
--                migrations keep writing `public.is_admin()`, so the name stays.
--                The privileged lookup moves to private.is_admin() (a schema the
--                REST API does not expose) and public.is_admin() becomes a
--                SECURITY INVOKER wrapper around it. Same answer, same callers;
--                anon loses EXECUTE because no policy for anon uses it.
--
--    portal_customer_id()  No policy or app code uses it any more (the only
--                policy was dropped in 20261117040000). Kept, but nobody but the
--                service role may call it.
--
--    record_deal_stage_change()  Trigger function on public.deals. Triggers do
--                not check EXECUTE when they fire, so nobody needs it via RPC.
--
-- 2. Pin search_path on the 14 trigger / counter functions. Every one already
--    schema-qualifies its tables (public.invoices, public.proposals, ...) and
--    only calls pg_catalog built-ins, which are always on the path, so an empty
--    search_path is safe.
--
-- 3. Leaked-password protection is an Auth dashboard setting, not SQL.

-- ── 1a. is_admin ────────────────────────────────────────────────────────────

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- Same OID, so every existing policy picks this up untouched.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── 1b. portal_customer_id ──────────────────────────────────────────────────

revoke all on function public.portal_customer_id() from public, anon, authenticated;
grant execute on function public.portal_customer_id() to service_role;

-- ── 1c. record_deal_stage_change ────────────────────────────────────────────

revoke all on function public.record_deal_stage_change() from public, anon, authenticated;
grant execute on function public.record_deal_stage_change() to service_role;

-- ── 2. fixed search_path ────────────────────────────────────────────────────

alter function public.touch_updated_at()            set search_path = '';
alter function public.next_proposal_number()        set search_path = '';
alter function public.lock_signed_proposal()        set search_path = '';
alter function public.guard_signed_proposal_child() set search_path = '';
alter function public.reject_signature_change()     set search_path = '';
alter function public.sync_task_completion()        set search_path = '';
alter function public.stamp_checklist_completion()  set search_path = '';
alter function public.stamp_calendar_event()        set search_path = '';
alter function public.stamp_meeting()               set search_path = '';
alter function public.next_invoice_number()         set search_path = '';
alter function public.sync_invoice_paid()           set search_path = '';
alter function public.guard_invoice_amounts()       set search_path = '';
alter function public.guard_invoice_items()         set search_path = '';
alter function public.apps_sync_archive()           set search_path = '';
