ALTER TABLE savers.feed_items
  ADD COLUMN IF NOT EXISTS preview_image text;

