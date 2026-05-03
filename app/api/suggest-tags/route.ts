import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { isPublicUrl } from '@/lib/api'
import { fetchPageContent } from '@/lib/page-content'
import { deepseekJson } from '@/lib/ai-client'
import { buildStructuredTaggingPrompt, flattenStructuredTags, MAX_AI_TAGS, TAGGING_SYSTEM_PROMPT } from '@/lib/structured-tagging'
import { enrichWithCountries } from '@/lib/tag-aliases'

const MIN_TAGS = 3
const MAX_TAGS = MAX_AI_TAGS

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return
  }
  if (process.env.DEBUG) {
    console.error(scope, error)
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`${scope} ${message}`)
}

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .toLowerCase()
    .replace(/^[#\s]+|[\s#]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 2 || cleaned.length > 60) return null
  if (/[<>]/.test(cleaned)) return null
  return cleaned
}

function normalizeTagList(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((part) => normalizeTag(part))
    .filter((t): t is string => Boolean(t))
}

export async function POST(req: NextRequest) {
  try {
    await requireUser()
    const body = await req.json().catch(() => ({}))
    const {
      url,
      title: providedTitle,
      description: providedDescription,
      existing_tags,
      collection_path: providedCollectionPath,
    } = body ?? {}

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }
    if (!isPublicUrl(url)) {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
    }

    const content = await fetchPageContent(url)
    if (!content) {
      return NextResponse.json({ tags: [] })
    }

    const title = (typeof providedTitle === 'string' && providedTitle.trim()) || content.title
    const description =
      (typeof providedDescription === 'string' && providedDescription.trim()) ||
      content.description

    const existing: string[] = Array.isArray(existing_tags)
      ? existing_tags
          .flatMap((t) => normalizeTagList(t))
      : []

    const collectionPath =
      typeof providedCollectionPath === 'string' && providedCollectionPath.trim()
        ? providedCollectionPath.trim()
        : null

    const prompt = buildStructuredTaggingPrompt({
      url,
      title,
      description,
      bodyText: content.body_text,
      existingTags: existing,
      collectionPath,
      maxTags: MAX_TAGS,
    })

    const parsed = await deepseekJson<Record<string, unknown>>(prompt, {
      systemPrompt: TAGGING_SYSTEM_PROMPT,
      responseFormat: 'json_object',
      max_tokens: 500,
      temperature: 0.2,
    })

    if (!parsed) {
      return NextResponse.json({ tags: [] })
    }

    const rawTags = flattenStructuredTags(parsed)
    const seen = new Set<string>(existing.map((t) => t.toLowerCase()))
    const tags: string[] = []
    for (const t of rawTags) {
      for (const norm of normalizeTagList(t)) {
        if (seen.has(norm)) continue
        seen.add(norm)
        tags.push(norm)
        if (tags.length >= MAX_TAGS) break
      }
      if (tags.length >= MAX_TAGS) break
    }

    return NextResponse.json({ tags: enrichWithCountries(tags).slice(0, MAX_TAGS) })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message, tags: [] }, { status: 401 })
    }
    logUnexpectedError('Suggest tags error:', err)
    return NextResponse.json({ tags: [] })
  }
}
