-- Paste into Supabase -> SQL Editor -> New query.

create extension if not exists pgcrypto;

create table public.polls (
  id text primary key check (char_length(id) = 8),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  options jsonb not null default '[]' check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) > 0
    and not jsonb_path_exists(
      options,
      '$[*] ? (@.type() != "object" || !exists(@.date) || @.date.type() != "string" || !(@.date like_regex "^[0-9]{4}-[0-9]{2}-[0-9]{2}$") || (exists(@.time) && @.time.type() != "null" && (@.time.type() != "string" || !(@.time like_regex "^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"))))'
    )
  ),
  created_at timestamptz default now()
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  poll_id text not null references public.polls(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  selected int[] not null default '{}',
  extra jsonb not null default '[]' check (jsonb_typeof(extra) = 'array'),
  created_at timestamptz default now(),
  check (
    cardinality(selected) >= 1
    or (jsonb_array_length(extra) >= 1 and jsonb_array_length(extra) <= 50)
  )
);

create index responses_poll_id_idx on public.responses(poll_id);

create table public.app_config (
  key text primary key,
  value text not null
);

alter table public.polls enable row level security;
alter table public.responses enable row level security;
alter table public.app_config enable row level security;

create policy polls_select_anon on public.polls
  for select to anon using (true);

create policy polls_select_authenticated on public.polls
  for select to authenticated using (true);

create or replace function public.creation_password_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select candidate is not null
    and candidate <> ''
    and exists (
      select 1
      from public.app_config
      where key = 'creation_password_hash'
        and crypt(candidate, value) = value
    );
$$;

grant execute on function public.creation_password_matches(text) to anon;

create policy "password holders can create polls" on public.polls
  for insert to anon
  with check (creation_password_matches(current_setting('request.headers', true)::json->>'x-planahead-password'));

create policy polls_insert_authenticated on public.polls
  for insert to authenticated with check (true);

create policy responses_select_anon on public.responses
  for select to anon using (true);

create policy responses_select_authenticated on public.responses
  for select to authenticated using (true);

create policy responses_insert_anon on public.responses
  for insert to anon with check (
    exists (select 1 from public.polls p where p.id = poll_id)
  );

create policy responses_insert_authenticated on public.responses
  for insert to authenticated with check (
    exists (select 1 from public.polls p where p.id = poll_id)
  );

create policy responses_update_anon on public.responses
  for update to anon
  using (true)
  with check (
    exists (select 1 from public.polls p where p.id = poll_id)
  );

create policy responses_update_authenticated on public.responses
  for update to authenticated
  using (true)
  with check (
    exists (select 1 from public.polls p where p.id = poll_id)
  );

-- One entry per name per poll; the app upserts against (poll_id, name)
create unique index responses_poll_name_key
  on public.responses (poll_id, name);

alter publication supabase_realtime add table public.responses;
