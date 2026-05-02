# Savers on Railway

This app is now set up to work as a signed-in, multi-machine library.

## 1. Run the Supabase migrations

In the Supabase SQL editor, run:

- [`migrations/001_initial_schema.sql`](/Users/ryanwaller/Dev/savers/handoff/migrations/001_initial_schema.sql)
- [`migrations/004_user_ownership_and_auth.sql`](/Users/ryanwaller/Dev/savers/handoff/migrations/004_user_ownership_and_auth.sql)
- [`migrations/002_collection_icons.sql`](/Users/ryanwaller/Dev/savers/handoff/migrations/002_collection_icons.sql)
- [`migrations/003_bookmark_pinned.sql`](/Users/ryanwaller/Dev/savers/handoff/migrations/003_bookmark_pinned.sql)

What it does:

- creates the base `savers` schema plus `collections` and `bookmarks`
- adds `user_id` ownership to `savers.collections` and `savers.bookmarks`
- enables RLS for authenticated users
- keeps existing pre-auth rows claimable by the first signed-in user

## 1b. Expose the `savers` schema in Supabase Data API

In Supabase Dashboard:

- `Project Settings`
- `Data API`
- under `Exposed schemas`, add `savers`

If there is an `Extra search path` field, add `savers` there too.

Without this, the app will fail with:

- `PGRST106`
- `Invalid schema: savers`

## 2. Configure Supabase Auth

In Supabase Auth settings:

- Site URL:
  - your Railway production URL, for example `https://your-savers.up.railway.app`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://your-savers.up.railway.app/auth/callback`

If you later add a custom domain, add that callback URL too.

## 3. Set Railway environment variables

Add these in Railway:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `REDIS_URL`
- `NEXT_PUBLIC_SITE_URL`

`NEXT_PUBLIC_SITE_URL` should be your public app URL.

## 4. Deploy the web app

Standard Next.js deploy on Railway is fine:

- install command: `npm install`
- build command: `npm run build`
- start command: `npm run start`

## 5. Deploy the worker services

Savers has separate background workers. The web app only enqueues jobs; these workers actually process them.

Create separate Railway services from the same repo:

### Screenshot worker

- uses [`Dockerfile.worker`](/Users/ryanwaller/Dev/savers/handoff/Dockerfile.worker)
- start command inside the container: `./node_modules/.bin/tsx workers/screenshot-worker.ts`
- required env:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REDIS_URL`
  - `NEXT_PUBLIC_SITE_URL`

### Auto-tag worker

- simplest setup: duplicate the screenshot worker service, then change the command to:
  - `./node_modules/.bin/tsx workers/auto-tag-worker.ts`
- required env:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REDIS_URL`
  - `ANTHROPIC_API_KEY`
  - `NEXT_PUBLIC_SITE_URL`

Important:

- the web app and both workers should all be deployed from the same commit
- if you change anything under [`workers/`](/Users/ryanwaller/Dev/savers/handoff/workers), [`lib/screenshot-queue.ts`](/Users/ryanwaller/Dev/savers/handoff/lib/screenshot-queue.ts), [`lib/preview-server.ts`](/Users/ryanwaller/Dev/savers/handoff/lib/preview-server.ts), or other shared pipeline code, redeploy the worker services too
- if `REDIS_URL` is missing, screenshot generation will fail and auto-tagging will not run
- if migration [`migrations/015_asset_override.sql`](/Users/ryanwaller/Dev/savers/handoff/migrations/015_asset_override.sql) is not applied, the newer cover-override behavior can drift from local expectations

## 6. First sign-in behavior

The first account that signs in after this migration will automatically claim the old bookmarks and collections that were created before auth existed.

That is convenient for a personal library, but it means you should sign in with the account you want to keep using before inviting anyone else.

## 7. Chrome extension

The extension now supports:

- a configurable Savers app URL
- session-based saving with `credentials: include`
- Railway domains in host permissions
- the right-click `Save page to Savers` context menu

After reloading the unpacked extension:

1. Open your Railway-hosted Savers app in Chrome and sign in there.
2. Open the extension popup once.
3. Set `Savers app URL` to your Railway URL.
4. Save from the popup or the page context menu.
