-- RLS filters rows, not columns: a member reading their own customers row
-- could also read notes_internal, mrr, tags. Portal reads go through the
-- server with an explicit column list instead; members get no table access
-- beyond their own portal_members row. (Applied 2026-11-17.)
drop policy if exists customers_portal_self_select on public.customers;
