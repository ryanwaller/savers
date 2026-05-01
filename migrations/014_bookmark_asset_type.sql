ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS asset_type text;
