-- =============================================================
-- PlanAhead migration: free-day availability ('extra' column)
-- Run once in the Supabase dashboard: SQL Editor > New query
-- Lets respondents mark any day, even days the poll never offered:
-- unmatched picks are stored in responses.extra as
--   [{ "date": "2026-10-01", "times": ["08:30"] }]
-- where an empty "times" array means the whole day 09:00-17:00.
-- Existing responses are untouched: old rows simply keep extra = [].
-- =============================================================

alter table public.responses
  add column if not exists extra jsonb not null default '[]'
  check (jsonb_typeof(extra) = 'array');

-- The old check required at least one selected option index; that would
-- reject a response that only marks days outside the offered options.
-- Replace it so selected records offered picks and extra records
-- everything else — at least one of the two must be non-empty.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.responses'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cardinality(selected)%'
  loop
    execute format('alter table public.responses drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.responses
  add constraint responses_selection_check
  check (cardinality(selected) >= 1 or cardinality(extra) >= 1)
  not valid;

alter table public.responses validate constraint responses_selection_check;
