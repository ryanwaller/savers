import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { isPublicUrl } from '@/lib/api'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  if (!isPublicUrl(url)) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  try {
    await requireUser()
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Savers/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const $ = cheerio.load(html)

    const get = (selectors: string[]) => {
      for (const s of selectors) {
        const val = $(s).attr('content') || $(s).text()
        if (val?.trim()) return val.trim()
      }
      return null
    }

    const title = get([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'title',
    ])

    const description = get([
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ])

    const og_image = get([
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ])

    // Resolve relative OG image URLs
    const resolvedImage = og_image
      ? og_image.startsWith('http')
        ? og_image
        : new URL(og_image, url).href
      : null

    const origin = new URL(url).origin
    const favicon = `https://www.google.com/s2/favicons?domain=${origin}&sz=32`

    return NextResponse.json({
      title: title?.slice(0, 200) ?? null,
      description: description?.slice(0, 500) ?? null,
      og_image: resolvedImage,
      favicon,
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ title: null, description: null, og_image: null, favicon: null })
  }
}
