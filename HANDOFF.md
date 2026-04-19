# Savers — AI Handoff Prompt

Copy everything below this line and paste it as your first message to Claude or Codex.

---

## Project: Savers — a bookmark manager

I'm building a web app called **Savers** — a personal bookmark manager with nested collections, card-based UI, and AI-assisted categorization. I also want a Chrome extension to save from the browser.

The backend (Supabase) and API routes are already built. **I need you to build the frontend UI and Chrome extension.**

---

## What's already done

### Supabase schema (schema: `savers`, project already live)
```sql
savers.collections (id, name, parent_id, position, created_at)
savers.bookmarks   (id, collection_id, url, title, description, og_image, favicon, tags[], notes, position, created_at)
```
Collections are a recursive tree via `parent_id`. Already seeded with: Design (UI Inspiration, Typography, Color tools), Dev (Libraries, Tutorials), Reading, Tools & apps.

### Next.js API routes (already written in `/app/api/`)
- `GET  /api/metadata?url=` — scrapes OG title, description, image, favicon from any URL
- `POST /api/categorize` — sends URL + collection tree to Claude API, returns `{ suggestion: { collection_id, collection_path, confidence } }`
- `GET/POST/PATCH/DELETE /api/bookmarks` — full bookmark CRUD. GET accepts `?collection_id=` and `?q=` (search). Pass `collection_id=unsorted` for bookmarks with no collection.
- `GET/POST/PATCH/DELETE /api/collections` — GET returns `{ collections: tree[], flat: [] }` where tree has nested `children[]`

### Types (`/lib/types.ts`)
```ts
Collection { id, name, parent_id, position, created_at, children?, bookmark_count? }
Bookmark { id, collection_id, url, title, description, og_image, favicon, tags[], notes, position, created_at }
AISuggestion { collection_id, collection_name, collection_path, confidence: 'high'|'medium'|'low' }
```

### Tech stack
- Next.js 15 (App Router), TypeScript, Tailwind
- Supabase JS client (schema set to `savers`)
- `@anthropic-ai/sdk` and `cheerio` already installed

---

## What needs to be built

### 1. Main app UI (`/app/page.tsx` and components)

**Layout:** Two-panel. Fixed sidebar (220px) + main content area.

**Sidebar (`/components/Sidebar.tsx`):**
- Shows "All bookmarks" and "Unsorted" at the top (with counts)
- Nested collection tree below, expand/collapse per node
- Active state on selected collection
- "New collection" button at bottom — inline text input to name it, then POST /api/collections
- Right-click or hover "..." to rename/delete a collection

**Main area (`/components/BookmarkGrid.tsx`):**
- Breadcrumb at top showing current collection path
- Search input (debounced, hits GET /api/bookmarks?q=)
- "Add bookmark" button → opens AddBookmarkModal
- Card grid: `auto-fill, minmax(180px, 1fr)`
- Each card shows: OG image (if available, else a solid color placeholder derived from domain), title, domain, short description, tags
- Clicking a card opens BookmarkDetail panel (slide-in from right or modal)
- Cards for sub-collections show as folder cards with child count

**AddBookmarkModal (`/components/AddBookmarkModal.tsx`):**
1. User pastes a URL
2. On blur/submit: call GET /api/metadata?url= to auto-fill title, description, og_image
3. Show a preview card while user can optionally edit title/notes/tags
4. On save: POST /api/bookmarks, then immediately call POST /api/categorize
5. Show AI suggestion toast (see below) — don't block the save

**AI Suggestion Toast (`/components/AISuggestionToast.tsx`):**
- Appears bottom-right after a bookmark is saved
- Shows: "Move [title] to [collection path]?"
- Three buttons: "Yes, move it" (PATCH /api/bookmarks with collection_id) | "Keep in Unsorted" (dismiss) | "Other..." (opens collection picker)
- Auto-dismisses after 10 seconds if no action
- Confidence 'low' → don't show the toast at all, just leave it unsorted

**BookmarkDetail (`/components/BookmarkDetail.tsx`):**
- Slide-in panel or modal
- Shows full title, description, OG image, URL (clickable), tags, notes
- Editable: title, notes, tags (comma-separated input), collection (dropdown picker)
- Delete button

### 2. Design constraints (important — follow these strictly)
- **Two font sizes only:** 13px (base) and 12px (small). Nothing else.
- **Minimal color:** Black, white, and one gray scale only. No blues, greens, etc. in the UI chrome. Color only appears in OG images on cards.
- **No shadows.** Borders only: `1px solid #e5e5e5` (light) / `1px solid #2a2a2a` (dark).
- Dark mode support via `prefers-color-scheme`.
- Feels like a quiet, minimal tool — closer to Notion/Linear than Raindrop.

### 3. Chrome Extension (`/extension/`)

Manifest V3 extension with:

**`manifest.json`:**
```json
{
  "manifest_version": 3,
  "name": "Savers",
  "version": "1.0",
  "action": { "default_popup": "popup.html" },
  "permissions": ["activeTab"],
  "host_permissions": ["http://localhost:3000/*"]
}
```
(host_permissions will change to production URL later)

**`popup.html` + `popup.js`:**
- On open: reads current tab URL + title via `chrome.tabs.query`
- Shows a small popup (320px wide): URL (pre-filled, read-only), title (editable), notes textarea, collection picker (dropdown, fetches GET /api/collections)
- "Save" button → POST to `http://localhost:3000/api/bookmarks` then triggers AI categorize
- After save: show "Saved! AI suggested: [collection]" or "Saved to Unsorted" in the popup
- Minimal styling matching the app (same font sizes, same gray palette)

---

## File structure to create

```
/app/page.tsx                          ← main page, fetches collections + bookmarks
/app/components/Sidebar.tsx
/app/components/BookmarkGrid.tsx
/app/components/AddBookmarkModal.tsx
/app/components/AISuggestionToast.tsx
/app/components/BookmarkDetail.tsx
/app/components/CollectionPicker.tsx   ← reusable tree picker (used in modal + detail)
/extension/manifest.json
/extension/popup.html
/extension/popup.js
/extension/styles.css
```

---

## Notes & gotchas

- The Supabase client uses `db: { schema: 'savers' }` — all queries automatically scope to the savers schema. Don't add `savers.` prefix in JS queries.
- `/api/collections` GET returns both `tree` (nested) and `flat` (array) — use `tree` for sidebar rendering, `flat` for dropdowns.
- OG images can be any aspect ratio. Constrain card thumbnails to a fixed height (80–100px) with `object-fit: cover`.
- The extension talks to `localhost:3000` during dev. Make the base URL a constant at the top of `popup.js` so it's easy to change for production.
- Tags are stored as a Postgres `text[]`. In the API they come back as a JS array. Display as small pills on cards.
- For the color placeholder on cards with no OG image: hash the domain string to pick one of 5–6 neutral gray/warm tones, not vivid colors.

---

## Env vars already in `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://fzufxtkaoilwgqjvjrxa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=<user needs to fill this in>
```

Start with `/app/page.tsx` and the `Sidebar` + `BookmarkGrid` components. Get the basic shell rendering with real data from the API before adding the modal and toast flows.
