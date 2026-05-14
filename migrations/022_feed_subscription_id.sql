-- Add feed_subscription_id to bookmarks for sidebar feed navigation
ALTER TABLE savers.bookmarks
ADD COLUMN IF NOT EXISTS feed_subscription_id uuid REFERENCES savers.feed_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookmarks_feed_subscription
ON savers.bookmarks(feed_subscription_id)
WHERE feed_subscription_id IS NOT NULL;
