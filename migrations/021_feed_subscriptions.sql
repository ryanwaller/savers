-- Feed subscriptions for RSS/Atom monitoring
CREATE TABLE IF NOT EXISTS savers.feed_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feed_url text NOT NULL,
  name text NOT NULL,
  collection_id uuid,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_feed_subscriptions_user
  ON savers.feed_subscriptions (user_id);

ALTER TABLE savers.feed_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own feed subscriptions"
  ON savers.feed_subscriptions FOR ALL
  USING (user_id = (SELECT auth.uid()));

-- Track which bookmarks came from feeds
ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

-- Track seen feed item GUIDs to avoid re-importing
CREATE TABLE IF NOT EXISTS savers.feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES savers.feed_subscriptions(id) ON DELETE CASCADE,
  guid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(subscription_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_feed_items_subscription
  ON savers.feed_items (subscription_id);

ALTER TABLE savers.feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feed items"
  ON savers.feed_items FOR SELECT
  USING (
    subscription_id IN (
      SELECT id FROM savers.feed_subscriptions
      WHERE user_id = (SELECT auth.uid())
    )
  );
