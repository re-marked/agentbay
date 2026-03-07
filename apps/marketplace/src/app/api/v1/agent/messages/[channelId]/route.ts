import { NextResponse } from 'next/server'
import { isValidServiceKey } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// GET /api/v1/agent/messages/:channelId?limit=50&before=<cursor>
// Auth: Bearer $ROUTER_SERVICE_KEY
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = await params
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
  const before = url.searchParams.get('before') // cursor: created_at ISO string

  const service = createServiceClient()

  let query = service
    .from('channel_messages')
    .select('id, sender_id, content, message_kind, created_at')
    .eq('channel_id', channelId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: data ?? [] })
}
