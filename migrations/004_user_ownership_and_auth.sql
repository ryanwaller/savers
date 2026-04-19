alter table if exists savers.collections
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table if exists savers.bookmarks
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists collections_user_id_idx on savers.collections (user_id);
create index if not exists bookmarks_user_id_idx on savers.bookmarks (user_id);

grant usage on schema savers to anon, authenticated, service_role;
grant select, insert, update, delete on savers.collections to anon, authenticated, service_role;
grant select, insert, update, delete on savers.bookmarks to anon, authenticated, service_role;

grant execute on all routines in schema savers to anon, authenticated, service_role;
grant usage, select on all sequences in schema savers to anon, authenticated, service_role;

alter default privileges for role postgres in schema savers
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema savers
  grant execute on routines to anon, authenticated, service_role;

alter default privileges for role postgres in schema savers
  grant usage, select on sequences to anon, authenticated, service_role;

alter table savers.collections enable row level security;
alter table savers.bookmarks enable row level security;

drop policy if exists collections_select_own on savers.collections;
create policy collections_select_own
  on savers.collections
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists collections_insert_own on savers.collections;
create policy collections_insert_own
  on savers.collections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists collections_update_own on savers.collections;
create policy collections_update_own
  on savers.collections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists collections_delete_own on savers.collections;
create policy collections_delete_own
  on savers.collections
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists bookmarks_select_own on savers.bookmarks;
create policy bookmarks_select_own
  on savers.bookmarks
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists bookmarks_insert_own on savers.bookmarks;
create policy bookmarks_insert_own
  on savers.bookmarks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists bookmarks_update_own on savers.bookmarks;
create policy bookmarks_update_own
  on savers.bookmarks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists bookmarks_delete_own on savers.bookmarks;
create policy bookmarks_delete_own
  on savers.bookmarks
  for delete
  to authenticated
  using (auth.uid() = user_id);
