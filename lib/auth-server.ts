import 'server-only'

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

export async function requireUser(): Promise<{ user: User }> {
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
