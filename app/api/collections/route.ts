import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { Collection } from '@/lib/types'
import { getSupabaseAdmin } from '@/lib/supabase-server'

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return 'Failed to load collections'
}

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return
  }

  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  const details = record
    ? JSON.stringify({
        name: typeof record.name === 'string' ? record.name : undefined,
        message: typeof record.message === 'string' ? record.message : undefined,
        details: typeof record.details === 'string' ? record.details : undefined,
        hint: typeof record.hint === 'string' ? record.hint : undefined,
        code: typeof record.code === 'string' ? record.code : undefined,
        status: typeof record.status === 'number' ? record.status : undefined,
      })
    : null

  console.error(`${scope} ${getErrorMessage(error)}${details ? ` | ${details}` : ''}`)
}

function buildTree(collections: Collection[]): Collection[] {
  const map = new Map<string, Collection>()
  const roots: Collection[] = []

  for (const c of collections) {
    map.set(c.id, { ...c, children: [] })
  }

  for (const c of map.values()) {
    if (c.parent_id) {
      const parent = map.get(c.parent_id)
      parent?.children?.push(c)
    } else {
      roots.push(c)
    }
  }

  const sort = (items: Collection[]) => {
    items.sort((a, b) => a.position - b.position)
    items.forEach(i => i.children && sort(i.children))
  }
  sort(roots)
  return roots
}

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const { data, error } = await supabaseAdmin
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .order('position')

    if (error) {
      logUnexpectedError('Load collections error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }

    const tree = buildTree(data as Collection[])
    return NextResponse.json({ collections: tree, flat: data })
  } catch (err) {
    logUnexpectedError('Load collections catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load collections' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const { name, parent_id } = await req.json()

    if (parent_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from('collections')
        .select('id')
        .eq('id', parent_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (parentError) {
        logUnexpectedError('Load parent collection error:', parentError)
        return NextResponse.json({ error: getErrorMessage(parentError) }, { status: 500 })
      }

      if (!parent) {
        return NextResponse.json({ error: 'Parent collection not found' }, { status: 404 })
      }
    }

    let posQuery = supabaseAdmin
      .from('collections')
      .select('position')
      .eq('user_id', user.id)
      .order('position', { ascending: false })
      .limit(1)
    if (parent_id) posQuery = posQuery.eq('parent_id', parent_id)
    else posQuery = posQuery.is('parent_id', null)

    const { data: siblings } = await posQuery
    const position = siblings?.length ? siblings[0].position + 1 : 0

    const { data, error } = await supabaseAdmin
      .from('collections')
      .insert({ user_id: user.id, name, parent_id: parent_id ?? null, position })
      .select()
      .single()

    if (error) {
      logUnexpectedError('Create collection error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ collection: data })
  } catch (err) {
    logUnexpectedError('Create collection catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create collection' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const { id, user_id: _ignoredUserId, ...updates } = await req.json()

    if (updates.parent_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from('collections')
        .select('id')
        .eq('id', updates.parent_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (parentError) {
        logUnexpectedError('Load parent collection error:', parentError)
        return NextResponse.json({ error: getErrorMessage(parentError) }, { status: 500 })
      }

      if (!parent) {
        return NextResponse.json({ error: 'Parent collection not found' }, { status: 404 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('collections')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      logUnexpectedError('Update collection error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ collection: data })
  } catch (err) {
    logUnexpectedError('Update collection catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update collection' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      logUnexpectedError('Delete collection error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logUnexpectedError('Delete collection catch error:', err)
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete collection' },
      { status: 500 }
    )
  }
}
