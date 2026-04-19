import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { supabaseAdmin } from '@/lib/supabase-server'

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const message = 'message' in error ? error.message : null
    const details = 'details' in error ? error.details : null
    const hint = 'hint' in error ? error.hint : null

    const parts = [message, details, hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return 'Failed to save'
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' ? error : null
  }

  const record = error as Record<string, unknown>
  const details = {
    name: typeof record.name === 'string' ? record.name : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    details: typeof record.details === 'string' ? record.details : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    status: typeof record.status === 'number' ? record.status : undefined,
  }

  return JSON.stringify(details)
}

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return
  }

  const message = getErrorMessage(error)
  const details = getErrorDetails(error)
  console.error(`${scope} ${message}${details ? ` | ${details}` : ''}`)
}

async function ensureOwnedCollection(userId: string, collectionId: string | null) {
  if (!collectionId) return

  const { data, error } = await supabaseAdmin
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('Collection not found')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const body = await req.json()
    const { url, title, description, og_image, favicon, collection_id, tags, notes } = body

    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

    await ensureOwnedCollection(user.id, collection_id ?? null)

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .insert({
        user_id: user.id,
        url,
        title: title ?? null,
        description: description ?? null,
        og_image: og_image ?? null,
        favicon: favicon ?? null,
        collection_id: collection_id ?? null,
        tags: tags ?? [],
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ bookmark: data })
  } catch (err) {
    logUnexpectedError('Save bookmark error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const collection_id = req.nextUrl.searchParams.get('collection_id')
    const q = req.nextUrl.searchParams.get('q')

    let query = supabaseAdmin
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (collection_id === 'unsorted') {
      query = query.is('collection_id', null)
    } else if (collection_id) {
      query = query.eq('collection_id', collection_id)
    }

    if (q) {
      query = query.or(`title.ilike.%${q}%,url.ilike.%${q}%,description.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) {
      logUnexpectedError('Load bookmarks error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ bookmarks: data })
  } catch (err) {
    logUnexpectedError('Load bookmarks catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load bookmarks' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const body = await req.json()
    const { id, user_id: _ignoredUserId, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    await ensureOwnedCollection(user.id, updates.collection_id ?? null)

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      logUnexpectedError('Update bookmark error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ bookmark: data })
  } catch (err) {
    logUnexpectedError('Update bookmark catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update bookmark' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      logUnexpectedError('Delete bookmark error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logUnexpectedError('Delete bookmark catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete bookmark' },
      { status: 500 }
    )
  }
}
