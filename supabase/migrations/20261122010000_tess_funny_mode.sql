-- Tess's sixth mode: "funny".
--
-- ai_tess_profile.mode only allows the modes that existed when the table was
-- made. This widens the rule so the new mode can be saved. Until it is run,
-- choosing Funny on Tess's profile fails to save.
--
-- Safe to run more than once.

do $$
declare
  rule text;
begin
  -- The rule was created inline, so find it by what it checks, not by name.
  for rule in
    select conname
    from pg_constraint
    where conrelid = 'public.ai_tess_profile'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%mode%'
      and pg_get_constraintdef(oid) ilike '%brief%'
  loop
    execute format('alter table public.ai_tess_profile drop constraint %I', rule);
  end loop;
end $$;

alter table public.ai_tess_profile
  add constraint ai_tess_profile_mode_check
  check (mode in ('brief', 'chat', 'lift', 'focus', 'create', 'funny'));
