# Rebuild preview: review slice

The interactive preview lives on a separate Railway service at [savers-rebuild-preview-production.up.railway.app](https://savers-rebuild-preview-production.up.railway.app). Its source is the `rebuild` branch. The current Savers service continues on `main`.

## Available for review

- Responsive Library with all 815 exported bookmarks, search across titles, domains, notes, and tags from the expanding bottom dock, an expandable type filter with real social-source subfilters, a Favorites filter, export-order sort, grid/list views, and progressive card rendering. The type strip fades at its scroll edge.
- Collection browser and nested collection navigation using the names, hierarchy, and counts from the user's Savers screenshots. Links, Images, Smart collections, and Tags are separate views. Collections have a default expandable tree view and an optional grid of top-level folders. Tags use the page's natural scroll and can be searched from the dock.
- Bookmark cards open the original link as their primary action. A hover/touch action row opens Savers details, favorites the item, edits its tags, or changes its local privacy state. Detail has source, collection, clickable tags, notes where present, and a larger carousel of locally related cards ranked by collection, source, tags, and title words.
- Quick create for links, notes, collections, images, and small files, with a private/public choice. These edits persist in the current browser via localStorage; uploaded file data is kept there as well.
- Light and dark appearance modes with the supplied OM Bauer Folio Book weight, three type sizes, and neon green action color.
- Nested collection navigation and creation, with lock indicators. Smart collection rules can be tried and edited locally; the original rules were not part of the export. Image collections still need their own export to show actual image records.

## Scope of this preview

Starting collection names and counts are transcribed from the user's current Savers screenshots. The 815 bookmarks come from the user's CSV export, compressed into Railway-only environment variables by `scripts/prepare-rebuild-bookmarks.py`. The CSV and its generated chunks stay outside Git. The preview uses the export's already-generated, public Savers thumbnail URLs, loaded lazily in the browser. It does not generate previews or call an AI/metadata API. The supplied ZIP was too large for this workspace's 32 MB transfer limit; its local image files are not deployed. No production Supabase, Redis, storage, or worker credentials are configured on the preview service. `SAVERS_REBUILD_PREVIEW=1` rewrites `/` to `/rebuild` and returns 404 for the existing `/api/*` routes. `SAVERS_REBUILD_PASSWORD` protects the preview with HTTP Basic authentication, including fonts and static assets. Nothing saved in the preview appears in the current Savers app or on another device. The browser's storage limit makes this unsuitable for large uploads or long-term data storage.

The export has no visibility fields. The preview assumes items and collections are private until changed locally. Switching to public here does not create a share link or change production permissions. The new Following and user-added Subscriptions Inbox flows are required in the full rebuild plan; they are not connected in this visual preview.

The complete feature and data parity work is laid out in [REBUILD_PLAN.md](./REBUILD_PLAN.md).

## Review tasks

1. Open the preview on desktop and phone. Review the real bookmarks, folder names, and hierarchy in Links, Images, and Smart collections.
2. Expand nested collections in Tree, then compare with Grid. Check whether the hierarchy and spacing feel close to the references.
3. Browse Tags in Collections, edit tags from a card, and use the heart to add an item to Favorites. Reload and find it through the Library filters.
4. Use the plus button to save a link and write a note with tags. Reload and find them through dock search.
5. Switch between light and dark appearance in the account menu.
6. Note any reference screen that should be matched more tightly before the saved-item integration begins.
