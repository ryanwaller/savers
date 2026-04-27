import 'server-only'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient, getSupabaseAdmin } from '@/lib/supabase-server'

export class UnauthorizedError extends Error {
  constructor(message = 'Please sign in to Savers.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

async function countRows(table: 'collections' | 'bookmarks', userId: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    throw error
  }

  return count ?? 0
}

async function claimLegacyLibrary(userId: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const [ownedCollections, ownedBookmarks] = await Promise.all([
    countRows('collections', userId),
    countRows('bookmarks', userId),
  ])

  if (ownedCollections > 0 || ownedBookmarks > 0) {
    return
  }

  const [{ error: collectionsError }, { error: bookmarksError }] = await Promise.all([
    supabaseAdmin.from('collections').update({ user_id: userId }).is('user_id', null),
    supabaseAdmin.from('bookmarks').update({ user_id: userId }).is('user_id', null),
  ])

  if (collectionsError) {
    throw collectionsError
  }

  if (bookmarksError) {
    throw bookmarksError
  }
}

export function hashApiToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

async function getBearerToken(): Promise<string | null> {
  const headerList = await headers()
  const authHeader = headerList.get('authorization') || headerList.get('Authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()
  return token || null
}

async function userFromBearerToken(): Promise<User | null> {
  const token = await getBearerToken()
  if (!token) return null

  const supabaseAdmin = getSupabaseAdmin()
  const tokenHash = hashApiToken(token)

  const { data: tokenRow, error } = await supabaseAdmin
    .from('api_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !tokenRow) return null

  // Best-effort touch of last_used_at — don't fail the request if this throws.
  void supabaseAdmin
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)
    .then(() => undefined)

  const { data: userRes, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(tokenRow.user_id)

  if (userError || !userRes?.user) return null
  return userRes.user
}

export async function requireUser(): Promise<{ user: User }> {
  // Prefer Bearer token if present (used by the iOS Share Extension and any
  // other non-browser client). Fall back to the Supabase session cookie used
  // by the web app and the Chrome extension.
  const bearerUser = await userFromBearerToken()
  if (bearerUser) {
    await claimLegacyLibrary(bearerUser.id)
    return { user: bearerUser }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    // Supabase's AuthRetryableFetchError sometimes stringifies the request URL
    // into .message ({"url":"…/auth/v1/user"}). Don't leak that to the UI.
    const raw = error?.message?.trim()
    const looksLikeUrlDump =
      !!raw && (raw.startsWith('{"url"') || raw.includes('/auth/v1/user'))
    throw new UnauthorizedError(looksLikeUrlDump ? undefined : raw)
  }

  await claimLegacyLibrary(user.id)

  return { user }
}
