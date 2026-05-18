ALTER TABLE savers.feed_items
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS bookmark_id uuid REFERENCES savers.bookmarks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_feed_items_pending
  ON savers.feed_items (subscription_id, imported, dismissed);

CREATE INDEX IF NOT EXISTS idx_feed_items_bookmark
  ON savers.feed_items (bookmark_id);
