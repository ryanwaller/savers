import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

const PUBLIC_ID_LENGTH = 10
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'c',
  'help',
  'login',
  'logout',
  'new',
  'public',
  'savers',
  'settings',
  'signin',
  'signup',
  'static',
  'support',
  'www',
])

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) return
  const message = error instanceof Error ? error.message : String(error)
  console.error(`${scope} ${message}`)
}

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 })
}

function generatePublicId(): string {
  // base32-ish lowercase letters + digits, easy to read & type. Use
  // crypto rather than Math.random for unguessability.
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(PUBLIC_ID_LENGTH)
  let out = ''
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!cleaned) return null
  if (!SLUG_PATTERN.test(cleaned)) return null
  if (RESERVED_SLUGS.has(cleaned)) return null
  return cleaned
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const body = await req.json().catch(() => ({}))
    const id =
      typeof body?.id === 'string' && body.id.trim() ? body.id.trim() : null
    if (!id) {
      return NextResponse.json({ error: 'Missing collection id' }, { status: 400 })
    }

    const wantsPublic = body?.is_public === true || body?.is_public === false
      ? Boolean(body.is_public)
      : null
    if (wantsPublic === null) {
      return NextResponse.json({ error: 'Missing is_public' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Confirm the collection belongs to the user before mutating.
    const { data: existing, error: fetchError } = await admin
      .from('collections')
      .select('id, user_id, public_id, public_slug, is_public, public_description')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = { is_public: wantsPublic }

    if (wantsPublic) {
      // Generate a stable public_id once and keep it forever, even
      // through unpublish/republish cycles, so old shared links keep
      // resolving when republished.
      if (!existing.public_id) {
        // Try a few times to avoid the very-unlikely collision case.
        let attempts = 0
        let candidate = generatePublicId()
        while (attempts < 5) {
          const { data: clash } = await admin
            .from('collections')
            .select('id')
            .eq('public_id', candidate)
            .maybeSingle()
          if (!clash) break
          candidate = generatePublicId()
          attempts += 1
        }
        updates.public_id = candidate
      }

      if ('public_slug' in body) {
        if (body.public_slug === null || body.public_slug === '') {
          updates.public_slug = null
        } else {
          const slug = normalizeSlug(body.public_slug)
          if (!slug) {
            return NextResponse.json(
              { error: 'Invalid slug. Use lowercase letters, digits, and hyphens.' },
              { status: 400 }
            )
          }
          // Uniqueness check.
          const { data: takenBy } = await admin
            .from('collections')
            .select('id, user_id')
            .eq('public_slug', slug)
            .maybeSingle()
          if (takenBy && takenBy.id !== id) {
            return NextResponse.json(
              { error: 'Slug already taken.' },
              { status: 409 }
            )
          }
          updates.public_slug = slug
        }
      }

      if ('public_description' in body) {
        const desc =
          typeof body.public_description === 'string'
            ? body.public_description.trim().slice(0, 280)
            : null
        updates.public_description = desc && desc.length > 0 ? desc : null
      }
    } else {
      // Going private wipes the slug + description but keeps public_id
      // dormant so re-publishing later restores the same URL.
      updates.public_slug = null
    }

    const { data: updated, error: updateError } = await admin
      .from('collections')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, is_public, public_id, public_slug, public_description')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ collection: updated })
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized(err.message)
    logUnexpectedError('Update collection visibility error:', err)
    return NextResponse.json(
      { error: 'Could not update visibility' },
      { status: 500 }
    )
  }
}
