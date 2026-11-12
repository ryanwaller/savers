-- Link preview images live in their own public bucket. Paths begin with the
-- owner's user ID; workers use the service role, and browser uploads are
-- restricted to that owner's prefix.
insert into storage.buckets (id, name, public)
  values ('bookmark-previews', 'bookmark-previews', true)
  on conflict (id) do nothing;

create policy bookmark_previews_owner_write
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bookmark-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy bookmark_previews_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bookmark-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy bookmark_previews_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bookmark-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
