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
- `NEXT_PUBLIC_SITE_URL`

`NEXT_PUBLIC_SITE_URL` should be your public app URL.

## 4. Deploy

Standard Next.js deploy on Railway is fine:

- install command: `npm install`
- build command: `npm run build`
- start command: `npm run start`

## 5. First sign-in behavior

The first account that signs in after this migration will automatically claim the old bookmarks and collections that were created before auth existed.

That is convenient for a personal library, but it means you should sign in with the account you want to keep using before inviting anyone else.

## 6. Chrome extension

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
