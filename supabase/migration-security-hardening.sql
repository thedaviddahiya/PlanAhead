-- =============================================================
-- PlanAhead security hardening migration
-- Run once in the Supabase dashboard: SQL Editor > New query
-- 1) Stops anonymous clients from reading the bcrypt creation-
--    password hash. The password check runs inside the
--    security-definer function creation_password_matches, which
--    does not need anon SELECT access to app_config.
-- 2) Caps the extra availability array so anonymous clients
--    cannot store arbitrarily large JSON payloads.
-- Idempotent: safe to run more than once.
-- =============================================================

-- 1) Remove public read access to app_config (the password hash)
drop policy if exists app_config_select_anon on public.app_config;

-- 2) Replace the response check with one that also caps extra
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.responses'::regclass
      and contype = 'c'
      and (conname = 'responses_selection_check'
           or pg_get_constraintdef(oid) like '%cardinality(selected)%')
  loop
    execute format('alter table public.responses drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.responses
  add constraint responses_selection_check
  check (
    cardinality(selected) >= 1
    or (jsonb_array_length(extra) >= 1 and jsonb_array_length(extra) <= 50)
  )
  not valid;

alter table public.responses validate constraint responses_selection_check;
