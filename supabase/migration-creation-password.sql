create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;

drop policy if exists app_config_select_anon on public.app_config;
create policy app_config_select_anon on public.app_config
  for select to anon using (true);

create or replace function public.creation_password_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
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

drop policy if exists polls_insert_anon on public.polls;
drop policy if exists "password holders can create polls" on public.polls;
create policy "password holders can create polls" on public.polls
  for insert to anon
  with check (creation_password_matches(current_setting('request.headers', true)::json->>'x-planahead-password'));
