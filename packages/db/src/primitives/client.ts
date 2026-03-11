import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'

let _client: SupabaseClient<Database> | null = null

/**
 * Lazy singleton service-role Supabase client for primitives.
 * Bypasses RLS — auth is handled at the API/flow layer.
 * Uses @supabase/supabase-js directly (no Next.js / @supabase/ssr dependency).
 */
export function db(): SupabaseClient<Database> {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    _client = createClient<Database>(url, key)
  }
  return _client
}
