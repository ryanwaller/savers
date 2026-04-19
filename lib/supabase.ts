import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: 'savers' },
    })
  }

  return browserClient
}
