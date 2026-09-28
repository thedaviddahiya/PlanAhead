-- Paste into Supabase -> SQL Editor -> New query.

create extension if not exists pgcrypto;

create table public.polls (
  id text primary key,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  created_at timestamptz default now()
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null references public.polls(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  selected int[] not null default '{}',
  created_at timestamptz default now(),
  check (array_length(selected, 1) >= 1)
);

create index responses_poll_id_idx on public.responses(poll_id);

alter table public.polls enable row level security;
alter table public.responses enable row level security;

create policy polls_select_anon on public.polls
  for select to anon using (true);

create policy polls_insert_anon on public.polls
  for insert to anon with check (true);

create policy responses_select_anon on public.responses
  for select to anon using (true);

create policy responses_insert_anon on public.responses
  for insert to anon with check (
    exists (select 1 from public.polls p where p.id = poll_id)
  );

alter publication supabase_realtime add table public.responses;
