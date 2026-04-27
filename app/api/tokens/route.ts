import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { hashApiToken, requireUser, UnauthorizedError } from '@/lib/auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

// Token format: "svr_<43 url-safe chars>" → 256 bits of entropy.
// The "svr_" prefix is purely cosmetic so users can recognize the string.
function generateToken(): { token: string; prefix: string } {
  const random = randomBytes(32).toString('base64url')
  const token = `svr_${random}`
  // Show enough prefix in the UI to disambiguate without leaking entropy.
  const prefix = token.slice(0, 12)
  return { token, prefix }
}

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) return
  if (process.env.DEBUG) {
    console.error(scope, error)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`${scope} ${message}`)
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 })
}

export async function GET() {
  try {
    const { user } = await requireUser()
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('api_tokens')
      .select('id, name, prefix, last_used_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ tokens: data ?? [] })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized(err.message)
    logUnexpectedError('List tokens error:', err)
    return NextResponse.json({ error: 'Could not list tokens' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const body = await req.json().catch(() => ({}))
    const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
    const name = rawName.slice(0, 60) || 'iOS Share Extension'

    const { token, prefix } = generateToken()
    const tokenHash = hashApiToken(token)

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('api_tokens')
      .insert({
        user_id: user.id,
        name,
        prefix,
        token_hash: tokenHash,
      })
      .select('id, name, prefix, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({
      token,
      record: data,
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized(err.message)
    logUnexpectedError('Create token error:', err)
    return NextResponse.json({ error: 'Could not create token' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from('api_tokens')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized(err.message)
    logUnexpectedError('Delete token error:', err)
    return NextResponse.json({ error: 'Could not delete token' }, { status: 500 })
  }
}
