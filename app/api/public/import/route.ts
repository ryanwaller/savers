import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const body = await req.json().catch(() => ({}))
    const publicId =
      typeof body?.public_id === 'string' && body.public_id.trim()
        ? body.public_id.trim()
        : null
    if (!publicId) {
      return NextResponse.json({ error: 'Missing public_id' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Look up the public collection.
    const { data: source, error: sourceError } = await admin
      .from('collections')
      .select('id, user_id, name, icon, public_id, public_description')
      .eq('public_id', publicId)
      .eq('is_public', true)
      .maybeSingle()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // If it's already the user's own collection, just return it.
    if (source.user_id === user.id) {
      return NextResponse.json({ collection_id: source.id, already_owned: true })
    }

    // Get the bookmarks from the source collection.
    const { data: sourceBookmarks, error: bmError } = await admin
      .from('bookmarks')
      .select('url, title, description, og_image, favicon, tags, position, pinned, preview_path, preview_version')
      .eq('collection_id', source.id)
      .order('position', { ascending: true })

    if (bmError) throw bmError

    // Create a new collection in the user's account.
    const { data: newCollection, error: createError } = await admin
      .from('collections')
      .insert({
        user_id: user.id,
        name: source.name,
        icon: source.icon,
        public_description: null,
        is_public: false,
        position: 0,
      })
      .select('id')
      .single()

    if (createError || !newCollection) throw createError ?? new Error('Failed to create collection')

    // Copy bookmarks, if any.
    if (sourceBookmarks && sourceBookmarks.length > 0) {
      const now = new Date().toISOString()
      const rows = sourceBookmarks.map((b: Record<string, unknown>) => ({
        user_id: user.id,
        collection_id: newCollection.id,
        url: b.url,
        title: b.title ?? null,
        description: b.description ?? null,
        og_image: b.og_image ?? null,
        favicon: b.favicon ?? null,
        tags: b.tags ?? null,
        position: b.position ?? 0,
        pinned: false,
        preview_path: b.preview_path ?? null,
        preview_version: b.preview_version ?? null,
        created_at: now,
      }))

      const { error: insertError } = await admin.from('bookmarks').insert(rows)
      if (insertError) throw insertError
    }

    return NextResponse.json({ collection_id: newCollection.id, already_owned: false })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('Import public collection error:', message)
    return NextResponse.json({ error: 'Could not import collection' }, { status: 500 })
  }
}
