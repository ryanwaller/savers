import { NextRequest, NextResponse } from 'next/server'
import { requireUser, UnauthorizedError } from '@/lib/auth-server'
import { isPublicUrl } from '@/lib/api'
import { fetchPageContent } from '@/lib/page-content'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  if (!isPublicUrl(url)) {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  try {
    await requireUser()
    const content = await fetchPageContent(url)

    if (!content) {
      return NextResponse.json({ title: null, description: null, og_image: null, favicon: null })
    }

    return NextResponse.json({
      title: content.title,
      description: content.description,
      og_image: content.og_image,
      favicon: content.favicon,
    })
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    return NextResponse.json({ title: null, description: null, og_image: null, favicon: null })
  }
}
