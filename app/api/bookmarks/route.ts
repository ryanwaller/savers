import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { canonicalBookmarkUrl } from '@/lib/api'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { fetchPageContent } from '@/lib/page-content'
import { removePreviewObjects, storeBookmarkPreview } from '@/lib/preview-server'

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
  const supabaseAdmin = getSupabaseAdmin()

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
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const body = await req.json()
    const { url, title, description, og_image, favicon, collection_id, tags, notes } = body

    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

    await ensureOwnedCollection(user.id, collection_id ?? null)

    // Server-side metadata fill-in: if any of title / description / og_image
    // / favicon weren't provided by the client (e.g. iOS Share Extension
    // saving from Instagram, where the share sheet only passes the URL),
    // fetch the page and use its OG tags. Best-effort — failures don't
    // block the save.
    let resolvedTitle = title ?? null
    let resolvedDescription = description ?? null
    let resolvedOgImage = og_image ?? null
    let resolvedFavicon = favicon ?? null

    const needsMetadata =
      !resolvedTitle || !resolvedDescription || !resolvedOgImage || !resolvedFavicon
    if (needsMetadata) {
      try {
        const fetched = await fetchPageContent(url)
        if (fetched) {
          resolvedTitle = resolvedTitle ?? fetched.title
          resolvedDescription = resolvedDescription ?? fetched.description
          resolvedOgImage = resolvedOgImage ?? fetched.og_image
          resolvedFavicon = resolvedFavicon ?? fetched.favicon
        }
      } catch {
        // ignore metadata fetch errors; we still save the bookmark.
      }
    }

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .insert({
        user_id: user.id,
        url,
        title: resolvedTitle,
        description: resolvedDescription,
        og_image: resolvedOgImage,
        favicon: resolvedFavicon,
        collection_id: collection_id ?? null,
        tags: tags ?? [],
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) throw error
    let bookmark = data

    try {
      const stored = await storeBookmarkPreview({
        bookmarkId: data.id,
        userId: user.id,
        url: data.url,
        previewVersion: data.preview_version ?? Date.now(),
      })
      bookmark = stored.bookmark
    } catch (previewError) {
      logUnexpectedError('Store bookmark preview error:', previewError)
    }

    return NextResponse.json({ bookmark })
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
    const supabaseAdmin = getSupabaseAdmin()
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
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const body = await req.json()
    const { id, user_id: _ignoredUserId, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    if (updates.collection_id) {
      await ensureOwnedCollection(user.id, updates.collection_id)
    }

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

    const shouldRefreshPreview =
      Object.prototype.hasOwnProperty.call(updates, 'preview_version') ||
      Object.prototype.hasOwnProperty.call(updates, 'url')

    let bookmark = data

    if (shouldRefreshPreview) {
      try {
        const stored = await storeBookmarkPreview({
          bookmarkId: data.id,
          userId: user.id,
          url: data.url,
          force: Object.prototype.hasOwnProperty.call(updates, 'preview_version'),
          previewVersion:
            typeof data.preview_version === 'number' ? data.preview_version : Date.now(),
          currentPreviewPath: data.preview_path ?? null,
        })
        bookmark = stored.bookmark
      } catch (previewError) {
        logUnexpectedError('Refresh bookmark preview error:', previewError)

        if (Object.prototype.hasOwnProperty.call(updates, 'url')) {
          const { data: clearedPreviewBookmark, error: clearError } = await supabaseAdmin
            .from('bookmarks')
            .update({
              preview_path: null,
              preview_provider: null,
              preview_updated_at: null,
            })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single()

          if (!clearError && clearedPreviewBookmark) {
            bookmark = clearedPreviewBookmark
          }
        }
      }
    }

    return NextResponse.json({ bookmark })
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
    const supabaseAdmin = getSupabaseAdmin()
    const { user } = await requireUser()
    const deleteDuplicates = req.nextUrl.searchParams.get('duplicates') === 'true'
    const id = req.nextUrl.searchParams.get('id')

    if (deleteDuplicates) {
      const { data: bookmarks, error: loadError } = await supabaseAdmin
        .from('bookmarks')
        .select('id, url, created_at, preview_path, custom_preview_path')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (loadError) {
        logUnexpectedError('Load bookmarks before duplicate delete error:', loadError)
        return NextResponse.json({ error: getErrorMessage(loadError) }, { status: 500 })
      }

      const seenCanonicalUrls = new Set<string>()
      const duplicateGroupKeys = new Set<string>()
      const idsToDelete: string[] = []
      const previewPathsToDelete: string[] = []

      for (const bookmark of bookmarks ?? []) {
        const canonicalUrl = canonicalBookmarkUrl(bookmark.url)

        if (seenCanonicalUrls.has(canonicalUrl)) {
          idsToDelete.push(bookmark.id)
          duplicateGroupKeys.add(canonicalUrl)
          if (bookmark.preview_path) {
            previewPathsToDelete.push(bookmark.preview_path)
          }
          if (bookmark.custom_preview_path) {
            previewPathsToDelete.push(bookmark.custom_preview_path)
          }
          continue
        }

        seenCanonicalUrls.add(canonicalUrl)
      }

      if (idsToDelete.length === 0) {
        return NextResponse.json({
          ok: true,
          deleted_ids: [],
          deleted_count: 0,
          duplicate_group_count: 0,
        })
      }

      const { error: deleteError } = await supabaseAdmin
        .from('bookmarks')
        .delete()
        .eq('user_id', user.id)
        .in('id', idsToDelete)

      if (deleteError) {
        logUnexpectedError('Bulk duplicate delete error:', deleteError)
        return NextResponse.json({ error: getErrorMessage(deleteError) }, { status: 500 })
      }

      if (previewPathsToDelete.length > 0) {
        void removePreviewObjects(previewPathsToDelete)
      }

      return NextResponse.json({
        ok: true,
        deleted_ids: idsToDelete,
        deleted_count: idsToDelete.length,
        duplicate_group_count: duplicateGroupKeys.size,
      })
    }

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: existingBookmark, error: existingError } = await supabaseAdmin
      .from('bookmarks')
      .select('preview_path, custom_preview_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError) {
      logUnexpectedError('Load bookmark before delete error:', existingError)
    }

    const { error } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      logUnexpectedError('Delete bookmark error:', error)
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
    }

    void removePreviewObjects([existingBookmark?.preview_path, existingBookmark?.custom_preview_path])

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
