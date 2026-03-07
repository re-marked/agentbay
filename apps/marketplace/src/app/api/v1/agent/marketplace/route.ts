import { NextResponse } from 'next/server'
import { isValidServiceKey } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// GET /api/v1/agent/marketplace?category=...
// Returns published agents available for hiring
export async function GET(request: Request) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get('category')

  const service = createServiceClient()
  let query = service
    .from('agents')
    .select('id, name, slug, category, tagline, pricing_model')
    .eq('status', 'published')
    .order('name')

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ agents: data ?? [] })
}
