# Functional Rebuild staging

## Current state

- The `main` branch source is preserved at the fixed Git tag `legacy-savers-2026-11-12` and the `archive/legacy-savers-2026-11-12` branch. The new `rebuild-live` branch also serves that interface at `/legacy`. Railway confirms the currently live `savers` production deployment is commit `2850d958c5b0d7b64e6c3c74d593a3e6b654eb64`, the same commit as the archive tag.
- The public `rebuild` preview still stores edits in the browser. It has no authenticated server data or background enrichment.
- The isolated Supabase project **Savers Rebuild Staging** (`zhcepsclcjigaqnlwxiw`) was created on 12 November 2026 in `us-west-1`. Migrations 001–029 are applied there. Its bookmark, collection, image, and feed tables are empty. Its `bookmark-previews`, `image-originals`, and `image-previews` buckets exist and are empty. Production is `zyeuthooypsjclffmird` and has not been migrated or changed for this setup.
- A separate Railway project, **savers-rebuild-staging** (`609ca03d-4392-4258-8cbb-ded5c53c5d88`), now contains an unconnected `savers-rebuild-web` service. Its staging Supabase URL, anon key, and `SAVERS_REBUILD_STAGING=1` guard are set. No app source or worker has been attached to this service, so it has not replaced or changed either live Savers service.
- Savers Capture for macOS 0.9.4 is built and available on `rebuild-live` at `public/downloads/savers-capture-macos-0.9.4.zip`. Its user-facing labels say Savers. Its default browser address remains the current isolated preview and opens `/rebuild`, where the capture listener exists. The Mac app can be pointed to the account-backed staging site once that site has a durable capture handoff.
- The source archive is **not a database or storage backup**. Before production cutover, export the production Supabase database and both original and preview storage buckets, then verify that the archive can be restored.
- No production domain or production data is changed by this branch.

## Isolated staging requirements

1. Use the separate Supabase project above with the `savers` schema exposed. Its migrations and storage buckets are ready. Create a separate test account; do not reuse production Supabase credentials in staging. Migration 017's nonexistent `savers.users` reference was corrected to `auth.users`. On the fresh staging project, `DROP POLICY IF EXISTS` statements were omitted from migrations because there were no old policies to replace.
2. Create separate Redis and screenshot, auto-tag, link-check, and image-preview workers for staging. Set `REDIS_URL` only to the staging Redis instance. The application and every worker must point to the same staging Supabase project.
3. In the staging project's Supabase API settings, add `savers` to **Exposed schemas**. The SQL grants and row policies are already installed; the new project's Data API still needs this dashboard setting.
4. Configure the staging web service and workers with `SAVERS_REBUILD_STAGING=1` and `NEXT_PUBLIC_SUPABASE_URL=https://zhcepsclcjigaqnlwxiw.supabase.co`, plus the staging project's own `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, staging `REDIS_URL`, `AI_API_KEY` (or `DEEPSEEK_API_KEY`), and `NEXT_PUBLIC_SITE_URL` for its own hostname. The server refuses to access Supabase in staging mode if the URL is anything other than this isolated project. Keep `SAVERS_REBUILD_PREVIEW` unset on this service. Configure the appropriate image AI provider separately if image enrichment is required. Never copy production keys or Redis connection strings into staging.
5. Import a copy of the saved library into the staging account. The current preview's 815 links came from a CSV export and its collection hierarchy was reconstructed from screenshots; that is not a complete production backup. Copy originals, images, feed subscriptions, and other data only from a verified authorized export, preserving ownership and privacy. Do not import private data into the publicly accessible visual-preview service.
6. Run the functional Rebuild on its own URL. Keep the existing production service on `main` and the visual preview on `rebuild` until the staging account passes create, edit, delete, search, file/image upload, AI tag, and link thumbnail round trips.

## API integration boundaries

The current backend already supports authenticated bookmark and collection CRUD, image uploads, `/api/suggest-tags`, screenshot capture, and automatic tagging. Bookmark creation queues screenshot and tag jobs. The Rebuild UI in `app/rebuild/preview.tsx` currently mutates browser state and must be connected action by action; merely enabling `/api/*` would leave edits unsynced. Notes and general files, favorites, and some visibility/following behavior also need durable models or explicit mappings before they can be called functional.

For the first functional slice, authenticate against staging, load `/api/bootstrap`, render actual staging bookmarks and collections, and wire link and collection create/edit/delete. Then connect image upload, tag suggestions, and enrichment status. Validate a fresh browser and second device to catch any remaining browser-only state.

## Cutover gate

Before the Rebuild replaces the old app: verify a restorable production database/storage backup, compare counts and representative records after import, test sharing and private permissions, confirm workers and queues process real jobs, and keep the legacy release and route available for rollback. The fixed source tag alone cannot restore user data.
