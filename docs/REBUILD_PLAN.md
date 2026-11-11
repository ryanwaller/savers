# Savers rebuild: product, design, and delivery plan

**Status:** Research and planning, 11 November 2026. No production deployment or data migration has been made.

**Goal:** Build a calmer, more coherent Savers alongside the live app, using the supplied Sublime screenshots as a close visual and interaction reference while improving clarity, accessibility, and support for Savers' deeper workflows.

## 1. Decision in brief

1. **Keep the current Savers live.** Build the new app on a `rebuild` branch and publish a separate Railway web service at its generated `*.up.railway.app` URL. This avoids DNS setup and decouples reviews from production releases. The first preview should use realistic, non-sensitive fixture data and have no production database or worker credentials. A later functional preview gets its own Supabase data and queue infrastructure.
2. **Make the saved item the visual unit.** Links, images, files, notes, highlights, and feed finds should share a card language, detail shell, search, and capture path. Preserve their distinct storage and workflows behind adapters until a unified data model is justified.
3. **Use Sublime's visual grammar closely.** Spacious canvas; quiet floating navigation; centered content; softly rounded panels; small contextual menus; mixed-size media and text cards; dark discovery/capture and light library/reading surfaces; restrained lime accent. Improve legibility, focus states, feedback, and wayfinding.
4. **Preserve Savers' power.** Collections, nested folders, tags, smart collections, feeds, link health, duplicate review, bulk operations, sharing, image originals, browser extension, and iPhone sharing all need an explicit home in the new experience. Do not delete them to imitate Sublime's simpler data model.
5. **Prove the experience in slices.** The first reviewable slice is the shell, populated library, card detail, and save flow. Finish parity and reliability before cutover. Production remains the rollback route until the new app has passed migration and real-library review.

## 2. Evidence and confidence

### Supplied visual evidence

The archive contains **20 screenshots**. Most are desktop browser captures of an empty or newly seeded Sublime account; one is a composite of mobile screens. They show the actual layouts and interaction states, but do not cover a large, mature private library, every mobile flow, or all settings. The screenshot filenames below are timestamps from the supplied archive.

| Reference | Observed pattern | Implication for Savers |
| --- | --- | --- |
| `9.11.35` | Mobile profile, all cards with media filters, mixed cards, collection, and card detail/related views | Design mobile deliberately; do not shrink the desktop grid. |
| `9.14.47`, `9.15.24` | Dark first-run canvas with centered starter choices and optional integrations | Give new users one clear first save, then progressively reveal other methods. |
| `9.14.50` | Floating plus expands a short, grouped create menu | Use one persistent capture affordance with typed actions. |
| `9.14.58`, `9.15.05` | Compact link composer and full-canvas note editor | Match the editor to the content type; keep optional organization secondary. |
| `9.15.17` | Collection creation with description, privacy, pinning, collaborators, and contextual guidance | Keep collection setup simple, but explain its purpose and sharing state. |
| `9.15.33`, `9.15.56`, `9.16.04` | Layered settings, account, and following popovers/modals | Use focused overlays; reserve full settings pages for complex tools. |
| `9.15.45` | Dark staff-picks/discovery view, two-column varied cards, top tabs/search/filter/shuffle | Build a reusable editorial card grid; discovery is optional, not the default personal-library home. |
| `9.16.15`, `9.16.23` | Light quote and article detail pages with large whitespace, original source, Save action, and related content below | Make detail a place to read, understand, and act. |
| `9.16.28`, `9.16.33` | Related cards and sort/filter controls beneath a card | Related results need provenance and usable ordering. |
| `9.16.58`, `9.17.28` | Select-text clipping with a note and collection picker; selected-card state | Treat highlights as source-linked items and support multi-select cleanly. |
| `9.17.57` | Light library entry with central search, All cards / Collections / Canvases, imports | Provide a simple entry but promote real content above imports for existing users. |
| `9.18.49`, `9.18.52` | Uploaded file cards, success toasts, and per-card menu for edit/share/source/related/collection/privacy/delete | Carry files into the card language and provide clear action feedback. |

Visual details are directly observed. Exact font, spacing, and color values are **estimates**, because no design file or token sheet was supplied. Reference imagery is for analysis, not assets to ship or a license to reuse Sublime branding/icons.

### Sublime product research

Sublime describes cards as the basic saved unit and collections as contexts in which to revisit them; saved items can be found through search and related ideas. Its browser extension supports capture from browsing, including links and selected material. Reader Mode and highlights reinforce source-linked reading. Canvas and community discovery extend the model beyond bookmarking. These are product patterns, not requirements to clone every feature.

Primary references: [Sublime](https://sublime.app/), [browser extension](https://sublime.app/browser-extension), [Sublime's explanation of its product](https://sublimeinternet.substack.com/p/what-does-sublime-actually-do), [Reader Mode](https://sublimeinternet.substack.com/p/youre-in-reader-mode), [Sublime UX notes](https://sublime.app/collection/sublime-ux-ui-thoughts?contentType=text), [Raycast extension](https://www.raycast.com/sublime/sublime), and [Canvas collection](https://sublime.app/collection/making-sublime-canvas). A broader [research report](https://agent.tinyfish.ai/research/01a1cb0a-12b6-7fcf-bf43-338946406b07) includes secondary comparisons. It is useful for hypotheses, but implementation decisions below are anchored in the screenshots and Savers code.

### Current Savers audit

The repo is Next.js 16/React 19 with Supabase authentication and storage, Redis/BullMQ workers, a Chrome extension, and an iOS Capacitor share path. Its current entry view (`app/page.tsx`) and sidebar are large client components. `/api/bootstrap` fetches all bookmarks and related counts; client-side selection and localStorage snapshots do considerable work. This raises complexity and load-time risk as a library grows. The data model has a single `collection_id` per bookmark, separate images and image collections, plus smart collections, feeds, tags, sharing, preview generation, and health state. The UI already supports grid/list views, card sizes, bulk operations, review, and settings utilities.

The local checkout is at commit `2850d95` (15 October 2026); Railway reports an online production deployment made later in October. **Verify the deployed commit and reconcile the branch before writing implementation code.** Do not infer that the local commit exactly matches production. This audit inspected code and infrastructure, not a signed-in walkthrough of the current live UI; that walkthrough belongs in Phase 0.

### Existing feature → target experience map

“Current” below means present in the checked-out code or schema, not independently exercised against production. The purpose is to make parity visible before any screen is retired.

| Existing capability | Current evidence | New home / treatment | Phase |
| --- | --- | --- | --- |
| Link bookmarks, metadata, screenshots | `bookmarks` API, preview workers, grid/detail | Link cards and readable detail; capture never waits for enrichment | 3 |
| Uploaded images and image folders | `images`, `image_collections`, image worker/storage | Image card variant in mixed library; image-focused filter and original download | 3–4 |
| Nested collections | `collections.parent_id` | Collections browser with drill-down and optional tree | 3 |
| Pinned and unsorted items | bookmark flags/virtual selections | Library filter and Inbox tab; pinned collections on collection home | 3 |
| Tags, aliases, AI auto-tags | bookmark/image fields and tag APIs | Search facets and contextual editor; suggestions clearly distinguished from chosen tags | 4 |
| Smart collections | `smart_collections` query JSON | Saved views with readable filter summary and live builder preview | 4 |
| Feed subscriptions and item review | feed APIs and feed-item queue | Inbox “Feed finds”; keep/dismiss/batch actions and source management | 4 |
| Broken-link checks and verification | link worker, `broken_status` | Inbox “Broken links” with checker confidence and user decision | 4 |
| Duplicate review | duplicate APIs/settings | Dedicated review queue with safe comparison and explicit deletion/merge result | 4 |
| Bulk move/tag/delete | bulk API routes and edit mode | Selection mode in grid/list with fixed toolbar and undo where possible | 4 |
| Public collections and bookmark shares | public/share routes, tokens | Preview/publish/revoke flow and stable legacy URLs | 4 |
| Custom previews, refresh, processing status | preview APIs/workers | Card fallback and retry in detail; maintenance task view | 4 |
| Grid/list, density, sorting | current page controls | Compact library toolbar, URL-backed filters, saved preference | 3 |
| Export/import and API tokens | settings, public import, token API | Account → Data and Integrations with scope/progress text | 4 |
| Chrome extension and bookmarklet | repo extension/bookmarklet | Same capture contract and collection picker as web | 4 |
| iPhone share / Capacitor | native bridge and tokens | Same capture contract; native auth and deep link regression check | 4 |
| Notes, highlights, reader, files as general cards | notes field and image/PDF support are partial | First-class note/highlight/file presentation; reader and clipping after core parity | 3–5 |

This map deliberately separates a **new presentation** from a **new capability**. For example, showing an image beside a link is a UI/read-model task; making arbitrary files and source-linked highlights truly first-class requires additional data and capture work.

## 3. Product model and information architecture

### User jobs

1. Save something in seconds from a browser, phone, feed, file, or note.
2. Return to a saved item and remember why it mattered.
3. Find it by memory, content type, source, collection, tag, or state.
4. Curate a purposeful collection and share it when desired.
5. Review incoming/unsorted items without being forced to organize every save.
6. Repair broken links, duplicates, and failed previews without turning the main library into an admin panel.
7. Explore related items from one's own library; optionally extend to public discovery later.

### Proposed top-level destinations

| Destination | Main content | Secondary controls |
| --- | --- | --- |
| **Library** | All saved cards, recent first, mixed link/image/note/file types | Search, type filters, sort, view switch, bulk select |
| **Collections** | Pinned/recent collections and accessible hierarchy | New collection, nested navigation, smart collections as saved views |
| **Inbox** | Unsorted saves, feed candidates, failed processing as distinct tabs | Keep, organize, dismiss, retry; counts for actionable items |
| **Explore** | Related from my library; optional curated public content later | Scope, shuffle, source, privacy |
| **Create** | Link, note, image/file upload, collection; later highlight/canvas | Current context prefilled, collection optional |
| **Account/Tools** | Settings, integrations, imports/exports, health, duplicate review | Progressive disclosure from profile menu |

Desktop: a small floating bottom-left destination dock and a separate bottom-right create button, as in the screenshots. The dock must retain labels or tooltips and clear active state; a keyboard user can reach everything. Mobile: a bottom bar for Library, Collections, Inbox, Explore, plus a prominent Create control. On narrow screens, hide fixed overlays when the keyboard is open and preserve safe-area spacing. Search is reachable from any content destination, not buried in a modal.

Avoid copying Sublime's transient empty-account landing as the permanent home for an established Savers library. Existing users should land on content or their last valid view. Onboarding is a separate, intentionally sparse state.

### Card and collection rules

- A **card** is a presentation and interaction contract: stable id, kind, title/primary content, source, preview, note, dates, visibility, collections, tags, processing/health state, and allowed actions. It does not initially imply one database table.
- A **collection** represents a revisiting context. Existing nested collections remain navigable. The primary interface presents pinned/recent collections first and reveals hierarchy in a drill-down browser or expandable tree when needed.
- **Unsorted** is a valid saved state. Capture should never demand a collection.
- **Tags** remain supported and searchable. Suggested tags can appear in an advanced section, while natural-language retrieval and collections carry the primary experience.
- **Smart collections** are saved views with visible filter rules, not a confusing second folder species. The builder should show a live preview and a plain-language rule summary.
- **Privacy** must be explicit on every public-facing share action. Existing sharing is collection/bookmark based; a unified visibility model needs careful migration and should not silently make any existing item public.
- Sublime allows one card in multiple collections. Savers currently has one `collection_id` per bookmark and per image. Add multi-membership only after the new UI is useful on the current schema; use a join table with a compatibility `primary_collection_id` migration when this feature is designed and tested. Avoid duplicating cards to simulate membership.

## 4. Screen and interaction specification

### A. Entry and onboarding

Use the dark open canvas, centered invitation, quiet dock, and prominent create control seen in `9.14.47`. For a new account, ask for one action: paste a link or upload a file. Offer Note and Collection nearby; integrations live in an expandable group. After a first save, show the resulting card and one contextual suggestion such as “add a note” or “put in a collection.” Existing accounts go directly to Library with an actual content grid.

### B. Library and all cards

Use a light reading surface, centered content area, restrained title, and a varied grid informed by `9.17.57` and `9.18.49`. Cards need tuned treatments: image-led, article-led, plain text/quote, file/PDF, and note. Keep titles/source legible even when the thumbnail fails. Allow grid/list switch, density control, date/source/collection sort, and content-type chips; remember the choice per user. Filters must be shareable in the URL and representable in the back/forward history. Virtualize or paginate the grid so large libraries do not require all items at first load.

### C. Collection page and browser

Collection header: name, optional description, item count, privacy badge, edit/share controls, and a calm cover mosaic. Below: mixed cards, sort/filter, nested child collections, and a contextual “Save to this collection” action. An item may later have multiple memberships. Expose smart collections beside regular collections, with distinct rule icon/text. For existing nested trees, preserve hierarchy without making the global sidebar always visible.

### D. Card detail and reading

Use `9.16.15` and `9.16.23` as the strongest layout references: a narrow readable column, large type where appropriate, source attribution, generous margins, and small top actions. The detail should vary by kind:

- **Link/article:** title, description, preview or readable article when extraction is available, source URL, note, tags, collection, saved date, open-original action, health/preview state.
- **Image:** full preview, source and original download, metadata where useful, note/tags, related images; preserve original quality and signed access.
- **Note/quote/highlight:** text is primary, with source/parent relationship visible; a highlight should lead back to the article or URL.
- **File/PDF:** preview or first page, file type/size, download, source, note.

Provide clear Edit, Add to collection, Share, and More controls. Related content is below the main card (or in an optional desktop side pane) and defaults to **my library**; label the source of every related result. Do not imply semantic recommendations exist until retrieval quality is proven. Reader Mode is a later slice with selectable highlights that produce source-linked cards.

### E. Capture and quick create

Mirror the small right-side menu in `9.14.50`: Save link, Write note, Upload image/file, New collection. Group imports separately. Link save: paste URL, show editable title/preview when fetched, optional note, collection, privacy, Save. Show progress and an actionable result; never leave an ambiguous pending spinner. Notes use a roomy editor like `9.15.05`, with autosaved draft and explicit publish/save. File upload handles multiple files, per-file progress and failures. The current collection is preselected when creating there, but removable. Extension and iPhone share use the same server-side save contract and field names as web capture.

### F. Search and related

Search should match title, URL/domain, description, notes, tags, collection names, OCR text, and later article/highlight text where stored. Start with reliable indexed lexical search and filters; add semantic retrieval behind a toggle and evaluate it on real examples. Results should explain matches, support type/collection/date/source filters, and remain useful when AI is unavailable. Related results should draw from the user's library first, with quality checks and privacy boundaries. Public/community discovery is a separate consent and moderation product, not a by-product of sharing.

### G. Inbox, feeds, and maintenance

Use **Inbox** as the practical home for existing Savers workflows: Unsorted, Feed finds, Processing issues, Broken links, and Duplicates. Each tab has count, plain-language status, and one obvious primary action. Feed items support preview, keep as card, dismiss, and batch action. Broken-link review must distinguish checker uncertainty from user-confirmed failure, and preserve the original URL. Duplicate review shows why items group together and which fields would be lost on merge. Bulk mode should be explicit and reversible where possible, with a clear selected count and fixed action bar. These tools should be available from context, not dominate every card.

### H. Sharing, public pages, and collaboration

Preserve current bookmark and collection shares and public URLs. Design publish flows that show exactly what becomes visible, provide a preview, and allow unpublish/revoke. Test images and private originals carefully. Collaboration, public profiles, following, and network discovery appear in Sublime but are **later product decisions** for Savers; implement only with a defined identity, permissions, and abuse model. Do not expose data just to match a screenshot.

### I. Settings and integrations

Keep the concise account popover of `9.15.56`, then open dedicated views for operations that need explanation: appearance, import/export, extension and iPhone setup, API tokens, feed sources, tag aliases, preview refresh, duplicate maintenance, and account/security. Every long-running task needs progress and a result. Use CSV/ZIP export to give users portability; specify which data and original assets it includes.

## 5. Visual system: close match, deliberate improvements

These are **starting targets for design prototypes**, not extracted Sublime tokens. Compare at the same screenshot viewport and adjust by eye and accessibility checks.

| Element | Starting target | Improvement |
| --- | --- | --- |
| Canvas | Charcoal `#111111` for discovery/creation; warm white `#FCFCFA` for library/detail | Maintain consistent semantic surfaces when switching modes. |
| Panels | 16–24 px radius; dark `#242424` or light `#F3F3F1`; very soft shadow | Keep dialog edges discernible on either canvas. |
| Main text | `#F5F5F2` on dark; `#171717` on light | Body copy at WCAG AA contrast; avoid the faint gray seen in some empty states. |
| Secondary text | Approx. `#B8B8B3` dark / `#636363` light | Never use opacity alone for essential labels. |
| Accent | Restrained pale lime, approx. `#CBF7A3` | Reserve for save/affirmative state and selected controls; test contrast of text on it. |
| Typography | Neutral sans for UI; 15–16 px body; 28–40 px display depending on viewport | Card text and article text get a distinct readable scale; no tiny action labels. |
| Layout | 8 px spacing rhythm; reading column 640–760 px; grid container around 1180–1320 px | Responsive breakpoints from content needs, not arbitrary device labels. |
| Motion | 120–220 ms soft transitions for menus/cards | Respect reduced-motion preferences and avoid long blur transitions. |

The screenshot's floating controls, pale surfaces, and large blank areas are worth matching; its very low contrast iconography and ambiguous unlabeled controls are not. Provide visible hover/focus, accessible names, Escape and click-away behavior, sensible tab order, and touch targets of at least ~44 px on mobile. Use real empty, loading, error, and success states rather than an always pristine mockup. A fidelity review should compare desktop and mobile screenshots side by side at each milestone.

## 6. Engineering plan

### Presentation boundary before data rewrite

Introduce a server-side card read model that maps existing bookmark and image records into typed card summaries. Use server-rendered route shells and paginated queries for Library, Collection, Inbox, and Detail; keep client state local to search, filtering, selection, and editors. Extract shared components for app shell, floating dock, card variants, create menu, command/search, detail sections, and dialogs. Replace the current giant-page orchestration incrementally; keep existing API operations available through adapters while each slice migrates. Define URL routes as the source of navigation state rather than localStorage selection.

Read endpoints should return paginated card summaries and counts separately, with cursor order and stable tie-breakers. Fetch detail on demand. Keep optimistic updates narrowly scoped and reconcile against server responses. Audit indexes and use query plans for search and filters. Existing preview and enrichment workers can serve the new interface once staging is isolated; monitor queue idempotency, retries, and file privacy. Do not mount a second worker set against the production queues.

Potential later schema changes: a `cards`/`collection_memberships` model, notes/highlights, full-text/OCR index, semantic embeddings, and richer visibility. Each needs an additive migration, backfill, dual-read verification, rollback path, and explicit retention of existing IDs/shares. **Do not make a wholesale table rewrite the first milestone.**

### Preview and production isolation

1. Confirm GitHub branch and the exact live deployment SHA. Create `rebuild` from the current source of truth.
2. Create a separate Railway **web service** attached to `rebuild`, with a generated Railway domain. Set only the variables required for fixture mode; do not inherit production Supabase service-role, Redis, queue, or storage secrets. No DNS change is needed. Publish the first interactive design slice there.
3. For authenticated functional testing, create a **separate Supabase staging project** with matching migrations/storage buckets and test users. Give the preview its own explicit `NEXT_PUBLIC_SITE_URL`, Supabase redirect allowlist, and origin configuration. Check web auth and the existing native `savers://` callback separately. Use staging Redis/workers only when background jobs are tested; otherwise display fixture states.
4. If representative content is needed, copy a small, consented and sanitized sample; never point staging writes at production. Where safe, a temporary read-only import can seed staging, with URLs/tokens/private asset paths scrubbed.
5. Keep the production Railway service and domain unchanged through review. Promote only after all gates pass; preserve the old build as a rollback target and keep database migrations backward compatible during the cutover window.

Why a separate service instead of `/rebuild` in production: a subfolder avoids an extra URL but requires every work-in-progress change to deploy through the live service and tempts shared data/credentials. A generated Railway URL costs no custom-domain configuration and gives a cleaner boundary. A dedicated staging database adds setup later, when write-capable testing begins; the first visual preview needs none.

## 7. Phased delivery and gates

Effort is a **planning range**, not a commitment: roughly 14–22 developer-weeks for a robust parity rebuild with a functional preview, plus additional time for Canvas, public discovery, and deep semantic search. A small team can overlap design/engineering, but data migration and cutover remain sequential.

| Phase | Deliverable | Review/exit gate |
| --- | --- | --- |
| **0. Baseline & inventory** (1–2 weeks) | Verify deployed SHA; snapshot current flows/data shapes; map APIs and counts; define 10–15 representative user tasks; capture current desktop/mobile screens; branch and staging plan | Parity matrix agreed; current app untouched; source of truth known. |
| **1. Design foundation** (1–2 weeks) | Screens for first-run, populated library, collection, 5 card types, detail, capture, mobile; tokens/components; realistic fixture data | Side-by-side reference review; keyboard/mobile/contrast pass on prototype. |
| **2. Reviewable preview** (2–3 weeks) | Separate Railway URL; fixture-backed shell, library, collection, search UI, detail, capture prototype | User can click through core tasks on desktop and phone; zero prod credentials and no prod deploy. |
| **3. Core functional library** (3–5 weeks) | Staging auth/data; paginated read model; real saves/edits; mixed links/images; collections; search/filter; responsive layout | Representative library loads well; create/edit/delete round-trip; permissions and share boundaries verified. |
| **4. Savers parity** (3–5 weeks) | Inbox/feeds, tags/smart views, bulk actions, link health, duplicates, images/files, sharing, settings/export, extension/iOS contract | Every existing supported workflow has a route and task test; no silent data loss; queue failure states recover. |
| **5. Enrichment & polish** (2–4 weeks) | Related from own library, reader/highlights if viable, semantic search experiment, performance/accessibility/usability rounds | Related relevance beats a documented baseline; search remains useful without AI; mobile and keyboard flows pass. |
| **6. Cutover** (1–2 weeks) | Backward-compatible migrations, production data verification, monitored release, rollback rehearsal | Counts/IDs/public links match; critical task checks pass on production; old app can be restored quickly. |

Canvas, social following, public network discovery, Raycast, and Kindle/Readwise/X/Instagram imports are **optional post-parity tracks**. They should be justified by actual Savers user needs and given separate scope, especially where they introduce content rights, privacy, and moderation work.

### Definition of done for the core rebuild

- Users can capture links and images/files, edit notes/tags/collections, and find them again on web and mobile.
- Existing bookmarks, images, collections, smart views, feeds, public links, and relevant settings remain accessible; legacy records do not vanish because the new UI lacks a card variant.
- All core routes have loading, empty, error, and success states. Failed metadata/preview jobs do not block saving.
- Search and browse scale beyond the entire library being shipped to the browser at boot.
- Privacy and ownership are checked on every server operation and public page. Staging cannot write to production.
- Keyboard navigation, focus restoration, reduced motion, text contrast, and touch use are verified.
- Real users can complete a task set: save a URL, save an image, add a note, organize, retrieve, review a feed find, resolve a broken link, share/revoke, and export.
- Production cutover has measured before/after counts, share URL checks, backup, monitoring, and a rehearsed rollback.

## 8. Risks, tradeoffs, and decisions for review

| Issue | Recommendation | Why / when to revisit |
| --- | --- | --- |
| **Exact visual match vs. utility** | Match composition and feel closely; improve contrast, controls, and state feedback. | The screenshots are elegant but many controls are faint. |
| **Dark vs. light** | Use the reference's contextual split, with a user theme preference later. | The archive does not depict a single universal dark mode. |
| **One card across collections** | Design for it, but keep single membership until an additive join-table migration is ready. | The current schema is one-to-many; rushing this risks duplicate and share semantics. |
| **Tags and nested folders** | Keep supported, soften their prominence. | Removing them would strand existing organization. |
| **Semantic search/AI** | Ship reliable lexical search first, then evaluate opt-in semantic ranking. | Relevance, cost, and privacy need real data and a fallback. |
| **Public discovery** | Defer until explicit product/privacy design. | Current shares are not a community graph. |
| **Reader and highlights** | Build after core cards/detail unless extraction proves easy in Phase 3. | Source rights and robust text anchoring require care. |
| **Review environment** | Generated Railway URL with fixture content first; isolated Supabase for functional work. | Fastest safe path with no DNS or live-app disruption. |

The largest unknown is how a **large, lived-in Savers library** should feel in this visual system; the supplied Sublime desktop shots mostly show empty states, a few saved files, and public content. Phase 1 should therefore include realistic examples from each existing Savers content type and at least one dense collection. The first preview should be judged on those cases, not just the attractive empty canvas.

## 9. Immediate next work package

1. Reconcile repo and live commit; document production and staging variables without copying secret values into the repo.
2. Build the screen inventory and realistic fixtures: mixed links, image assets, PDFs, notes, one nested collection, one smart view, feed inbox, broken link, duplicate group, and private/public items.
3. Make high-fidelity desktop/mobile screens and component tokens from the 20 references. Review both empty and dense states.
4. Implement the shell, Library, Collection, card detail, and quick-create as a fixture-backed vertical slice on the separate Railway URL.
5. Review that slice against the screenshots and the user-task list before changing the production data model.
