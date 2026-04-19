import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const { ids } = await req.json()
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
    }

    const { data: ownedRows, error: ownedRowsError } = await supabaseAdmin
      .from('collections')
      .select('id')
      .in('id', ids)
      .eq('user_id', user.id)

    if (ownedRowsError) {
      return NextResponse.json({ error: ownedRowsError.message }, { status: 500 })
    }

    if ((ownedRows ?? []).length !== ids.length) {
      return NextResponse.json({ error: 'One or more collections were not found' }, { status: 404 })
    }

    const updates = ids.map((id, index) =>
      supabaseAdmin
        .from('collections')
        .update({ position: index })
        .eq('id', id)
        .eq('user_id', user.id)
    )

    const results = await Promise.all(updates)
    const error = results.find(r => r.error)?.error

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
