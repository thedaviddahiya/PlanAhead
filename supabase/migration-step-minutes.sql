-- Migration: configurable time increment (30 / 60 minutes) per poll. Idempotent.

alter table public.polls add column if not exists step_minutes int not null default 30;

do $$
begin
  alter table public.polls drop constraint if exists polls_step_minutes_check;
  alter table public.polls add constraint polls_step_minutes_check check (step_minutes in (30, 60));
exception
  when duplicate_object then null;
end $$;
