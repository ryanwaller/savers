# Functional Rebuild staging

## Current state

- The original Savers source is preserved at the fixed Git tag `legacy-savers-2026-11-12` and the `archive/legacy-savers-2026-11-12` branch. The new `rebuild-live` branch also serves that interface at `/legacy`.
- The public `rebuild` preview still stores edits in the browser. It has no authenticated server data or background enrichment.
- The source archive is **not a database or storage backup**. Before production cutover, export the production Supabase database and both original and preview storage buckets, then verify that the archive can be restored.
- No production domain or production data is changed by this branch.

## Isolated staging requirements

1. Create a separate Supabase project with the `savers` schema exposed. Apply `migrations/001_initial_schema.sql` through `migrations/028_images.sql` in order and verify the storage buckets. Use a separate test account; do not reuse production Supabase credentials in staging.
2. Create separate Redis and screenshot, auto-tag, link-check, and image-preview workers for staging. Set `REDIS_URL` only to the staging Redis instance. The application and every worker must point to the same staging Supabase project.
3. Configure the staging web service with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `AI_API_KEY` (or `DEEPSEEK_API_KEY`), and `NEXT_PUBLIC_SITE_URL` for its own hostname. Keep `SAVERS_REBUILD_PREVIEW` unset on this service. Configure the appropriate image AI provider separately if image enrichment is required.
4. Import a copy of the saved library into the staging account. The current preview's 815 links came from a CSV export and its collection hierarchy was reconstructed from screenshots; that is not a complete production backup. Copy originals, images, feed subscriptions, and other data only from a verified authorized export, preserving ownership and privacy. Do not import private data into the publicly accessible visual-preview service.
5. Run the functional Rebuild on its own URL. Keep the existing production service on `main` and the visual preview on `rebuild` until the staging account passes create, edit, delete, search, file/image upload, AI tag, and link thumbnail round trips.

## API integration boundaries

The current backend already supports authenticated bookmark and collection CRUD, image uploads, `/api/suggest-tags`, screenshot capture, and automatic tagging. Bookmark creation queues screenshot and tag jobs. The Rebuild UI in `app/rebuild/preview.tsx` currently mutates browser state and must be connected action by action; merely enabling `/api/*` would leave edits unsynced. Notes and general files, favorites, and some visibility/following behavior also need durable models or explicit mappings before they can be called functional.

For the first functional slice, authenticate against staging, load `/api/bootstrap`, render actual staging bookmarks and collections, and wire link and collection create/edit/delete. Then connect image upload, tag suggestions, and enrichment status. Validate a fresh browser and second device to catch any remaining browser-only state.

## Cutover gate

Before the Rebuild replaces the old app: verify a restorable production database/storage backup, compare counts and representative records after import, test sharing and private permissions, confirm workers and queues process real jobs, and keep the legacy release and route available for rollback. The fixed source tag alone cannot restore user data.
