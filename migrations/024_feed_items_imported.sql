-- Add imported flag to feed_items so we never re-import a GUID
-- that was already turned into a bookmark, even if the bookmark is later deleted.
ALTER TABLE savers.feed_items
  ADD COLUMN IF NOT EXISTS imported boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_feed_items_imported
  ON savers.feed_items (subscription_id, imported);
