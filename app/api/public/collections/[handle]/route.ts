import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// Public read endpoint. No auth required. Resolves a handle (which can be
// either the unguessable public_id OR a vanity public_slug) to the
// collection's metadata, its direct bookmarks, and any child collections
// that are also public.
//
// Private sub-collections are intentionally omitted — if you want a child
// collection visible from the parent's public page, publish it too.

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

function logUnexpectedError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`${scope} ${message}`)
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ handle: string }> }
) {
  const { handle } = await ctx.params

  if (!handle || !HANDLE_PATTERN.test(handle)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const admin = getSupabaseAdmin()

    // Try slug first (so vanity URLs win), then public_id.
    const { data: bySlug } = await admin
      .from('collections')
      .select(
        'id, user_id, name, icon, parent_id, public_id, public_slug, public_description, is_public'
      )
      .eq('public_slug', handle)
      .eq('is_public', true)
      .maybeSingle()

    let collection = bySlug
    if (!collection) {
      const { data: byId } = await admin
        .from('collections')
        .select(
          'id, user_id, name, icon, parent_id, public_id, public_slug, public_description, is_public'
        )
        .eq('public_id', handle)
        .eq('is_public', true)
        .maybeSingle()
      collection = byId ?? null
    }

    if (!collection) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Bookmarks directly inside this collection. Pinned first, then by
    // position, then by created_at descending — same ordering rule as the
    // private grid.
    const { data: bookmarks, error: bookmarksError } = await admin
      .from('bookmarks')
      .select(
        'id, url, title, description, og_image, favicon, tags, position, pinned, created_at, preview_path, preview_version'
      )
      .eq('collection_id', collection.id)
      .order('pinned', { ascending: false })
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })

    if (bookmarksError) throw bookmarksError

    // Public child collections, if any.
    const { data: children, error: childrenError } = await admin
      .from('collections')
      .select('id, name, icon, public_id, public_slug, public_description')
      .eq('parent_id', collection.id)
      .eq('is_public', true)
      .order('position', { ascending: true })

    if (childrenError) throw childrenError

    return NextResponse.json({
      collection: {
        id: collection.id,
        name: collection.name,
        icon: collection.icon,
        description: collection.public_description ?? null,
        public_id: collection.public_id,
        public_slug: collection.public_slug,
      },
      bookmarks: bookmarks ?? [],
      children: children ?? [],
    })
  } catch (err) {
    logUnexpectedError('Load public collection error:', err)
    return NextResponse.json({ error: 'Could not load collection' }, { status: 500 })
  }
}
