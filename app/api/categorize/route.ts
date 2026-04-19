import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Collection } from '@/lib/types'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-server'

const client = new Anthropic()

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

function flattenCollections(collections: Collection[], path = ''): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = []
  for (const c of collections) {
    const fullPath = path ? `${path} / ${c.name}` : c.name
    result.push({ id: c.id, path: fullPath })
    if (c.children?.length) {
      result.push(...flattenCollections(c.children, fullPath))
    }
  }
  return result
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function loadCollectionExamples(collectionIds: string[], userId: string) {
  if (!collectionIds.length) return new Map<string, string[]>()
  const supabaseAdmin = getSupabaseAdmin()

  const { data, error } = await supabaseAdmin
    .from('bookmarks')
    .select('collection_id,title,url,tags,created_at')
    .eq('user_id', userId)
    .in('collection_id', collectionIds)
    .order('created_at', { ascending: false })

  if (error || !data) return new Map<string, string[]>()

  const grouped = new Map<string, string[]>()
  for (const row of data) {
    if (!row.collection_id) continue
    const current = grouped.get(row.collection_id) ?? []
    if (current.length >= 3) continue
    const parts = [
      row.title || domainOf(row.url),
      `(${domainOf(row.url)})`,
      Array.isArray(row.tags) && row.tags.length ? `[${row.tags.slice(0, 3).join(', ')}]` : null,
    ].filter(Boolean)
    current.push(parts.join(' '))
    grouped.set(row.collection_id, current)
  }
  return grouped
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser()
    const { url, title, description, collections } = await req.json()

    const hasCollections = Array.isArray(collections) && collections.length > 0
    const flat = hasCollections ? flattenCollections(collections) : []
    const examplesById = hasCollections
      ? await loadCollectionExamples(flat.map((c) => c.id), user.id)
      : new Map<string, string[]>()
    const collectionList = hasCollections
      ? flat
          .map((c, i) => {
            const examples = examplesById.get(c.id) ?? []
            const examplesLine = examples.length ? `\n   Examples: ${examples.join(' | ')}` : ''
            return `${i + 1}. ${c.path} (id: ${c.id})${examplesLine}`
          })
          .join('\n')
      : '(none yet — propose a fresh collection name)'

    const promptBody = hasCollections
      ? `You are helping categorize a saved bookmark into an existing personal library taxonomy.

Your job:
1. Choose the best EXISTING collection when there is a reasonable fit.
2. If none fit neatly, propose a NEW collection name that would make sense to this user.
3. Prefer the deepest specific existing collection over a broad parent when appropriate.
4. Only propose a new collection when the bookmark clearly does not belong in any existing collection.

Important taxonomy guidance:
- "Recipes" is a parent collection with sub-collections. If the bookmark is clearly a recipe or recipe-related, prefer a Recipes child over the root when possible.
- Use "Recipes / Inspo" for roundups, seasonal recipe collections, or inspiration pages.
- Use "Recipes / Prep" for meal prep, batch prep, freezer prep, make-ahead, or storage-oriented pages.
- Use dish-format children like Bowls, Bread, Dessert, Lunches, Meals, Salads, Sandwiches, Soups when the bookmark clearly matches that food type.
- Use the root "Recipes" only if it is recipe-related but no child is clearly better.
- "Misc" is a last resort and should be avoided if any meaningful category fits.
- Domain can be a hint, but do not classify using domain alone if title/description point elsewhere.

When proposing a new collection:
- Keep the new collection name short, natural, and title cased.
- Prefer proposing it under an existing parent when that makes sense.
- Do not propose a redundant collection if an existing one is close enough.`
      : `You are helping the user start their personal bookmark library. They have no collections yet.

Your job:
- Propose a NEW top-level collection name that this bookmark naturally belongs in.
- Pick a name short enough to reuse for similar future bookmarks — not so narrow it only fits this one page, not so broad it becomes a catch-all.
- Title case, one to three words. Examples of good names: "Shopping", "Recipes", "Design Inspo", "Reading List".
- Avoid "Misc", "Other", "Bookmarks", "Saved".`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `${promptBody}

Bookmark:
- URL: ${url}
- Title: ${title ?? 'Unknown'}
- Description: ${description ?? 'None'}

Collections:
${collectionList}

Respond with JSON only, no explanation:
{"collection_id": "<id-or-null>", "collection_path": "<full path-or-null>", "proposed_collection_name": "<name-or-null>", "proposed_parent_collection_id": "<id-or-null>", "proposed_parent_collection_path": "<path-or-null>", "confidence": "high"|"medium"|"low"}

Rules for output:
- If an existing collection fits, set collection_id + collection_path and leave proposed_* as null.
- If no existing collection fits neatly, set collection_id + collection_path to null and fill proposed_collection_name. proposed_parent_* may be null for a new top-level collection.
- If there are no existing collections at all, always fill proposed_collection_name and leave collection_id null.
- If the bookmark is too ambiguous, use confidence "low".`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    const suggestion = {
      collection_id: parsed.collection_id ?? null,
      collection_path: parsed.collection_path ?? null,
      proposed_collection_name: parsed.proposed_collection_name ?? null,
      proposed_parent_collection_id: parsed.proposed_parent_collection_id ?? null,
      proposed_parent_collection_path: parsed.proposed_parent_collection_path ?? null,
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
          ? parsed.confidence
          : 'low',
    }

    if (!suggestion.collection_id && !suggestion.proposed_collection_name) {
      return NextResponse.json({ suggestion: null })
    }

    return NextResponse.json({ suggestion })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message, suggestion: null }, { status: 401 })
    }
    logUnexpectedError('AI categorize error:', err)
    return NextResponse.json({ suggestion: null })
  }
}
