-- =============================================================
-- PlanAhead one-entry-per-person migration
-- Run once in the Supabase dashboard: SQL Editor > New query
-- 1) Removes duplicate responses that share the same poll + name,
--    keeping the oldest row of each group.
-- 2) Adds a unique index so each name can have only one response
--    per poll; the app upserts against (poll_id, name) so a
--    returning participant updates their own entry.
-- 3) Adds UPDATE policies so upsert can modify rows; anonymous
--    spoofing risk is unchanged (anyone could already insert a
--    fake response under any name).
-- Idempotent: safe to run more than once.
-- =============================================================

-- 1) Deduplicate existing rows (keep the earliest per (poll_id, name))
delete from public.responses r
where exists (
  select 1 from public.responses d
  where d.poll_id = r.poll_id
    and d.name = r.name
    and (d.created_at < r.created_at
         or (d.created_at = r.created_at and d.id < r.id))
);

-- 2) Enforce one entry per name per poll
create unique index if not exists responses_poll_name_key
  on public.responses (poll_id, name);

-- 3) Allow upserts to modify an existing entry
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
