import 'server-only'

import { randomBytes } from 'node:crypto'
import type { getSupabaseAdmin } from './supabase-server'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export async function createPublicCollectionId(admin: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = randomBytes(10)
    const candidate = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
    const [{ data: linkClash, error: linkError }, { data: imageClash, error: imageError }] = await Promise.all([
      admin.from('collections').select('id').eq('public_id', candidate).maybeSingle(),
      admin.schema('savers').from('image_collections').select('id').eq('public_id', candidate).maybeSingle(),
    ])
    if (linkError) throw linkError
    if (imageError) throw imageError
    if (!linkClash && !imageClash) return candidate
  }
  throw new Error('Could not create a unique public collection link')
}
