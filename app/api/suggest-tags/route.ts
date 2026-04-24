import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { isPublicUrl } from '@/lib/api'
import { fetchPageContent } from '@/lib/page-content'

const client = new Anthropic()

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

export async function POST(req: NextRequest) {
  try {
    await requireUser()
    const body = await req.json().catch(() => ({}))
    const { url, title: providedTitle, description: providedDescription, existing_tags } = body ?? {}

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
          .map((t) => normalizeTag(t))
          .filter((t): t is string => Boolean(t))
      : []

    const existingLine = existing.length
      ? `\nExisting tags on this bookmark (do NOT repeat these): ${existing.join(', ')}`
      : ''

    const prompt = `You are tagging a saved bookmark in a personal library. Suggest ${MIN_TAGS}–${MAX_TAGS} short tags that capture what this page IS and what makes it worth re-finding later.

Tagging guidance:
- Lowercase, 1–3 words each. No "#" prefix, no quotes.
- Mix BROAD topical tags ("design", "portfolio") with SPECIFIC concrete tags pulled from the actual page content (location, discipline, medium, named technique, named subject, era, genre).
- If the page makes the creator's location, country, or city explicit (e.g. "Based in Lagos", "Brooklyn-based"), include that location as a tag.
- If the page is a portfolio or about-page, include the discipline (e.g. "graphic design", "illustration", "branding").
- Prefer tags this user could plausibly use again on a future bookmark — not one-off proper nouns unless they're meaningful (e.g. a studio name is fine).
- Skip generic noise: "website", "page", "online", "html".
- Skip anything you can't infer from the page content. Don't guess.

Bookmark:
- URL: ${url}
- Title: ${title ?? 'Unknown'}
- Description: ${description ?? 'None'}
- Page text excerpt:
"""
${content.body_text || '(no body text extracted)'}
"""${existingLine}

Respond with JSON only, no explanation:
{"tags": ["tag-one", "tag-two", "tag-three"]}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    let parsed: { tags?: unknown }
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    } catch {
      return NextResponse.json({ tags: [] })
    }

    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
    const seen = new Set<string>(existing.map((t) => t.toLowerCase()))
    const tags: string[] = []
    for (const t of rawTags) {
      const norm = normalizeTag(t)
      if (!norm) continue
      if (seen.has(norm)) continue
      seen.add(norm)
      tags.push(norm)
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
