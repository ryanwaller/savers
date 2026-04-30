-- Smart Collections: user-defined saved filter queries that auto-update.
-- Each smart collection has a name, icon, and a structured query_json.

create table if not exists savers.smart_collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  query_json  jsonb not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists smart_collections_user_id_idx
  on savers.smart_collections (user_id);

-- RLS: users can only read/write their own smart collections
alter table savers.smart_collections enable row level security;

drop policy if exists smart_collections_select_owner on savers.smart_collections;
create policy smart_collections_select_owner
  on savers.smart_collections
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists smart_collections_insert_owner on savers.smart_collections;
create policy smart_collections_insert_owner
  on savers.smart_collections
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists smart_collections_update_owner on savers.smart_collections;
create policy smart_collections_update_owner
  on savers.smart_collections
  for update
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists smart_collections_delete_owner on savers.smart_collections;
create policy smart_collections_delete_owner
  on savers.smart_collections
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
