import { NextRequest, NextResponse } from 'next/server'
import { Channels, Messages } from '@agentbay/db/primitives'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * POST /api/v1/agent/messages — Send a message to a channel
 * GET  /api/v1/agent/messages?channelId=...&limit=50 — Read channel history
 */

export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { channelId, content, messageKind = 'text', parentId } = body

  if (!channelId || !content) {
    return NextResponse.json({ error: 'channelId and content are required' }, { status: 400 })
  }

  // Verify the agent is a member of this channel
  const isMember = await Channels.isMember(channelId, auth.memberId)
  if (!isMember) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  try {
    const messageId = await Messages.send(channelId, auth.memberId, content, {
      kind: messageKind,
      depth: parentId ? 1 : 0,
      parentId: parentId ?? undefined,
      originId: parentId ?? undefined,
    })

    return NextResponse.json({ id: messageId, createdAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const channelId = req.nextUrl.searchParams.get('channelId')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100)

  if (!channelId) {
    return NextResponse.json({ error: 'channelId query param is required' }, { status: 400 })
  }

  // Verify the agent is a member of this channel
  const isMember = await Channels.isMember(channelId, auth.memberId)
  if (!isMember) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  // Use Messages.list — returns chronological order
  const messages = await Messages.list(channelId, { limit })

  // The primitive returns raw rows; map to API shape
  // Note: sender name/type require member lookups. For now, return IDs.
  // TODO: Add a Messages.listWithSenders primitive if agents need sender info.
  const result = messages.map((m: any) => ({
    id: m.id,
    senderId: m.sender_id,
    content: m.content,
    kind: m.message_kind,
    createdAt: m.created_at,
  }))

  return NextResponse.json({ messages: result })
}
