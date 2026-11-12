# Functional Rebuild staging

## What is running

- The existing production Savers service and its Supabase data remain untouched. Production currently contains 847 bookmarks, 50 link collections, 68 images, 6 image collections, 5 feed subscriptions, and 1,617 storage objects.
- The old source is preserved at the fixed Git tag `legacy-savers-2026-11-12` and archive branch `archive/legacy-savers-2026-11-12`. The old interface is also served at `/legacy` from `rebuild-live`. This source archive is not a database or storage backup.
- The public visual preview on the `rebuild` branch remains browser local.
- The isolated staging Supabase project is `zhcepsclcjigaqnlwxiw`, with migrations 001–029, exposed `savers` schema, and public preview and private original Storage buckets. Its library is empty until a staging user signs in and saves items.
- The isolated Railway project is `savers-rebuild-staging`, with web service `savers-rebuild-web` at `https://savers-rebuild-web-production.up.railway.app`, Redis, and a screenshot worker. The Railway environment's name is `production`, but this is a separate project and database.
- The staging web service runs the `rebuild-live` branch with `SAVERS_REBUILD_STAGING=1`. It serves the authenticated Rebuild interface at `/`. Link creation uses the existing bookmark API, queues a screenshot, and refreshes the image when the worker finishes. Image upload uses the image API. Both link and image collections load from the staging account. Collection visibility and public links use the existing visibility APIs.
- Savers Capture 0.9.5 points to the staging URL. It pairs through the local bridge and uploads screenshots to that signed-in staging account. The published 0.9.5 download must be installed to use this change; older installed copies still point to their previous destination.

## Test before switching

1. Sign in at the staging URL. Check the Supabase Auth redirect allowlist if the email link does not return there. The callback URL is `https://savers-rebuild-web-production.up.railway.app/auth/callback`.
2. Save a test link. Verify the row exists after a new page load and its homepage screenshot reaches `complete` with a public preview object. Then test an image upload and a Mac Capture handoff.
3. Connect a staging auto-tag worker and staging AI key before testing automatic tags. The screenshot worker does not perform AI tagging.
4. Review the Rebuild actions that still use visual-preview state, especially favorites, notes, files, individual-link sharing, feeds, and social features. Do not present those as durable until they have an API mapping.
5. Back up production database, Auth, and Storage to a restorable archive before the main-site switch. Verify the archive and representative records. Keep the old project running.

## Production cutover design

The intended replacement is **the new interface over the existing production Savers account and library**, not a migration that deletes or replaces the production database. `SAVERS_REBUILD_LIVE=1` changes the production root route to the authenticated Rebuild interface. `/legacy` remains available for rollback. The flag is not set in production. Enable it only after staging saves, screenshots, uploads, privacy, and critical existing-library features are verified and the data backup is complete.

The staging guard refuses any nonstaging Supabase URL while `SAVERS_REBUILD_STAGING=1`. Do not copy production service keys or Redis connection strings into the staging project.
