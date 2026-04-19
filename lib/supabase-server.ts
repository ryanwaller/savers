import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

function requiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function getServerSupabaseConfig() {
  return {
    url: requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

export async function createSupabaseServerClient() {
  const { url, anonKey } = getServerSupabaseConfig()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    db: { schema: 'savers' },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          // Extension → Railway is treated as cross-site. SameSite=Lax (Supabase's
          // default) blocks cookies on those requests, which is why the Chrome
          // extension gets "Auth session missing!". SameSite=None requires Secure,
          // so only apply it in production where the app is served over HTTPS.
          const isHttps = process.env.NODE_ENV === 'production'
          const patched = isHttps
            ? { ...options, sameSite: 'none' as const, secure: true }
            : options
          cookieStore.set(name, value, patched)
        }
      },
    },
  })
}

export function getSupabaseAdmin() {
  const { url, serviceRoleKey } = getServerSupabaseConfig()

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: 'savers' },
  })
}
