import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
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

  const db = createServiceClient()

  // Verify the agent is a member of this channel
  const { data: membership } = await db
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('member_id', auth.memberId)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  const { data: message, error } = await db
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: auth.memberId,
      content,
      message_kind: messageKind,
      depth: parentId ? 1 : 0,
      parent_id: parentId ?? null,
      origin_id: parentId ?? null,
    })
    .select('id, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: message.id, createdAt: message.created_at })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const channelId = req.nextUrl.searchParams.get('channelId')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100)

  if (!channelId) {
    return NextResponse.json({ error: 'channelId query param is required' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify the agent is a member of this channel
  const { data: membership } = await db
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('member_id', auth.memberId)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  const { data: messages, error } = await db
    .from('channel_messages')
    .select('id, sender_id, content, message_kind, created_at, members!sender_id(display_name, instance_id)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return newest-last for natural reading order
  const reversed = (messages ?? []).reverse().map((m: any) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: m.members?.display_name ?? 'Unknown',
    senderType: m.members?.instance_id ? 'agent' : 'user',
    content: m.content,
    kind: m.message_kind,
    createdAt: m.created_at,
  }))

  return NextResponse.json({ messages: reversed })
}
