import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase-server'

export class UnauthorizedError extends Error {
  constructor(message = 'Please sign in to Savers.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

async function countRows(table: 'collections' | 'bookmarks', userId: string) {
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
    throw new UnauthorizedError(error?.message)
  }

  await claimLegacyLibrary(user.id)

  return { user }
}
