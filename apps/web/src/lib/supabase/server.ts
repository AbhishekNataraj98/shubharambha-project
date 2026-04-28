import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { createClient as createBearerClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export async function createClient() {
  const headerStore = await headers()
  const authHeader = headerStore.get('authorization') ?? headerStore.get('Authorization')
  const bearer = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice('bearer '.length).trim() : null

  if (bearer) {
    return createBearerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
  }

  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}