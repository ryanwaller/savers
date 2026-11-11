# Rebuild preview: review slice

The interactive preview lives on a separate Railway service at [savers-rebuild-preview-production.up.railway.app](https://savers-rebuild-preview-production.up.railway.app). Its source is the `rebuild` branch. The current Savers service continues on `main`.

## Available for review

- Responsive Library with all 815 exported bookmarks, search across titles, domains, notes, and tags, type filters, export-order sort, grid/list views, and progressive card rendering.
- Collection browser and nested collection navigation using the names, hierarchy, and counts from the user's Savers screenshots. Links, Images, and Smart collections are separated.
- Card detail with source, collection, tags, notes where present, favorite, copy, and related cards from the same collection or tags.
- Quick create for links, notes, collections, images, and small files. These saves persist in the current browser via localStorage; uploaded file data is kept there as well.
- Light and dark appearance modes with the supplied OM Bauer Folio family and neon green action color.
- Nested collection navigation and creation. Image collections still need their own export to show actual image records.

## Scope of this preview

Starting collection names and counts are transcribed from the user's current Savers screenshots. The 815 bookmarks come from the user's CSV export, compressed into Railway-only environment variables by `scripts/prepare-rebuild-bookmarks.py`. The CSV and its generated chunks stay outside Git. The preview uses the export's already-generated, public Savers thumbnail URLs, loaded lazily in the browser. It does not generate previews or call an AI/metadata API. The supplied ZIP was too large for this workspace's 32 MB transfer limit; its local image files are not deployed. No production Supabase, Redis, storage, or worker credentials are configured on the preview service. `SAVERS_REBUILD_PREVIEW=1` rewrites `/` to `/rebuild` and returns 404 for the existing `/api/*` routes. `SAVERS_REBUILD_PASSWORD` protects the preview with HTTP Basic authentication, including fonts and static assets. Nothing saved in the preview appears in the current Savers app or on another device. The browser's storage limit makes this unsuitable for large uploads or long-term data storage.

The complete feature and data parity work is laid out in [REBUILD_PLAN.md](./REBUILD_PLAN.md).

## Review tasks

1. Open the preview on desktop and phone. Review the real bookmarks, folder names, and hierarchy in Links, Images, and Smart collections.
2. Open nested collections. Check whether the page hierarchy and spacing feel close to the references.
3. Use the plus button to save a link and write a note. Reload and find them through search.
4. Switch between light and dark appearance in the account menu.
5. Note any reference screen that should be matched more tightly before the saved-item integration begins.
