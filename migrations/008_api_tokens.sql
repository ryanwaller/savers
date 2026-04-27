-- API tokens used by the iOS Share Extension and any other non-browser client
-- that can't ride on the Supabase session cookie.
--
-- We never store the plaintext token. On creation we generate a random secret,
-- show it to the user once, and persist only the SHA-256 hash. The `prefix`
-- column lets the UI show "svr_abc12345…" in the token list so the user can
-- tell which one is which without us ever needing the full secret.

create table if not exists savers.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  prefix text not null,
  token_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_tokens_user_id_idx on savers.api_tokens (user_id);
create index if not exists api_tokens_token_hash_idx on savers.api_tokens (token_hash);

grant select, insert, update, delete on savers.api_tokens to anon, authenticated, service_role;

alter table savers.api_tokens enable row level security;

drop policy if exists api_tokens_select_own on savers.api_tokens;
create policy api_tokens_select_own
  on savers.api_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists api_tokens_insert_own on savers.api_tokens;
create policy api_tokens_insert_own
  on savers.api_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists api_tokens_update_own on savers.api_tokens;
create policy api_tokens_update_own
  on savers.api_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists api_tokens_delete_own on savers.api_tokens;
create policy api_tokens_delete_own
  on savers.api_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);
