# Rebuild preview: first review slice

The interactive preview lives on a separate Railway service at [savers-rebuild-preview-production.up.railway.app](https://savers-rebuild-preview-production.up.railway.app). Its source is the `rebuild` branch. The current Savers service continues on `main`.

## Available for review

- Responsive Library with mixed link, image, note, and file cards; search, type filters, sort, and grid/list views.
- Collection browser and collection-specific card view.
- Card detail with source, collection, favorite, copy, and related cards from the sample library.
- Quick create for links, notes, collections, images, and small files. These saves persist in the current browser via localStorage; uploaded file data is kept there as well.
- Sample Inbox and dark Explore views to test the navigation and visual direction.

## Scope of this preview

All starting content is fictional fixture material. No production Supabase, Redis, storage, or worker credentials are configured on the preview service. `SAVERS_REBUILD_PREVIEW=1` rewrites `/` to `/rebuild` and returns 404 for the existing `/api/*` routes. Nothing saved in the preview appears in the current Savers app or on another device. The browser's storage limit makes this unsuitable for large uploads or long-term data storage.

Inbox and Explore show interaction concepts, not connected feeds or recommendation services. The complete feature and data parity work is laid out in [REBUILD_PLAN.md](./REBUILD_PLAN.md).

## Review tasks

1. Open the preview on desktop and phone. Browse the library, switch between grid and list, and filter by content type.
2. Open a collection and a few different card types. Check whether the page hierarchy and spacing feel close to the references.
3. Use the plus button to save a link and write a note. Reload and find them through search.
4. Review the dark Explore surface and the sample Inbox flow.
5. Note any reference screen that should be matched more tightly before the functional data integration begins.
