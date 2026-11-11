# Rebuild preview: review slice

The interactive preview lives on a separate Railway service at [savers-rebuild-preview-production.up.railway.app](https://savers-rebuild-preview-production.up.railway.app). Its source is the `rebuild` branch. The current Savers service continues on `main`.

## Available for review

- Responsive Library shell with search, type filters, sort, and grid/list views for saved items once imported.
- Collection browser and nested collection navigation using the names, hierarchy, and counts from the user's Savers screenshots. Links, Images, and Smart collections are separated.
- Card detail shell with source, collection, favorite, copy, and related cards, ready for real saved items.
- Quick create for links, notes, collections, images, and small files. These saves persist in the current browser via localStorage; uploaded file data is kept there as well.
- Light and dark appearance modes with the supplied OM Bauer Folio family and neon green action color.
- Nested collection navigation and creation. The saved-item export is still needed for real cards, notes, tags, and media.

## Scope of this preview

Starting collection names and counts are transcribed from the user's current Savers screenshots. No saved-item records are loaded yet. No production Supabase, Redis, storage, or worker credentials are configured on the preview service. `SAVERS_REBUILD_PREVIEW=1` rewrites `/` to `/rebuild` and returns 404 for the existing `/api/*` routes. `SAVERS_REBUILD_PASSWORD` protects the preview with HTTP Basic authentication, including fonts and static assets. Nothing saved in the preview appears in the current Savers app or on another device. The browser's storage limit makes this unsuitable for large uploads or long-term data storage.

The complete feature and data parity work is laid out in [REBUILD_PLAN.md](./REBUILD_PLAN.md).

## Review tasks

1. Open the preview on desktop and phone. Review the real folder names and hierarchy in Links, Images, and Smart collections.
2. Open nested collections. Check whether the page hierarchy and spacing feel close to the references.
3. Use the plus button to save a link and write a note. Reload and find them through search.
4. Switch between light and dark appearance in the account menu.
5. Note any reference screen that should be matched more tightly before the saved-item integration begins.
