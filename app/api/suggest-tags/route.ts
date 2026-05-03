import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { isPublicUrl } from '@/lib/api'
import { fetchPageContent } from '@/lib/page-content'
import { deepseekJson } from '@/lib/ai-client'

const MIN_TAGS = 3
const MAX_TAGS = 6

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
  if (cleaned.length < 2 || cleaned.length > 30) return null
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

    const existingLine = existing.length
      ? `\nExisting tags on this bookmark (do NOT repeat these): ${existing.join(', ')}`
      : ''

    const collectionLine = collectionPath
      ? `\nThis bookmark is already filed under the collection "${collectionPath}". The collection path already implies its broad category, so do NOT return tags that just restate it (e.g. if the collection is "Design / Typographers", skip "typography", "type design", "fonts", "design", "portfolio").`
      : ''

    const prompt = `You are tagging a saved bookmark in a personal library. Return ${MIN_TAGS}–${MAX_TAGS} tags. Quality over quantity — fewer concrete tags beat more generic ones.

Your job is to surface SPECIFIC FACTS about this page that a person would have to read it carefully to find. The user can already see the title, URL, and collection — restating those is useless.

Prioritize, in order:
1. Location of the creator (city, country, region) — e.g. "lagos", "brooklyn", "berlin", "japan". Look in headers, footers, about/contact sections, "Based in…" lines. ALWAYS include this if the page states it.
2. Named studio, agency, or affiliation the creator is part of (e.g. "pentagram", "wieden+kennedy").
3. Discipline or medium that's narrower than the collection (e.g. for a typographer: "variable fonts", "arabic type", "lettering"; not "typography").
4. Languages, scripts, or cultural specificity (e.g. "arabic script", "japanese", "cyrillic").
5. Named techniques, materials, eras, or movements ("risograph", "brutalist", "1990s").
6. Notable subjects or recurring themes — only if the page makes them prominent.

Hard rules:
- Lowercase, 1–3 words each. No "#" prefix, no quotes, no proper-noun capitalization.
- DO NOT return tags that restate the obvious category of the page (it's a portfolio, it's a website, it's design).
- DO NOT guess. If the page doesn't state it, don't tag it. It is fine to return only 3 tags, or even zero.
- Skip generic noise: "website", "page", "online", "blog", "portfolio", "design", "creative".${collectionLine}

Bookmark:
- URL: ${url}
- Title: ${title ?? 'Unknown'}
- Description: ${description ?? 'None'}
- Page text excerpt (this is your primary source of truth — extract specific facts from here):
"""
${content.body_text || '(no body text extracted)'}
"""${existingLine}

Respond with JSON only, no explanation:
{"tags": ["tag-one", "tag-two", "tag-three"]}`

    const parsed = await deepseekJson<{ tags?: unknown }>(prompt, {
      max_tokens: 300,
    })

    if (!parsed) {
      return NextResponse.json({ tags: [] })
    }

    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
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

    return NextResponse.json({ tags })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message, tags: [] }, { status: 401 })
    }
    logUnexpectedError('Suggest tags error:', err)
    return NextResponse.json({ tags: [] })
  }
}
