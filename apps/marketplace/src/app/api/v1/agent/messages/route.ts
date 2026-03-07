import { NextResponse } from 'next/server'
import { isValidServiceKey, verifyMember } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// POST /api/v1/agent/messages
// Body: { memberId, channelId, content, messageKind? }
// Auth: Bearer $ROUTER_SERVICE_KEY
export async function POST(request: Request) {
  // 1. Validate service key
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { memberId: string; channelId: string; content: string; messageKind?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { memberId, channelId, content, messageKind } = body
  if (!memberId || !channelId || !content) {
    return NextResponse.json({ error: 'Missing memberId, channelId, or content' }, { status: 400 })
  }

  // 3. Verify member exists and is active
  const member = await verifyMember(memberId)
  if (!member) {
    return NextResponse.json({ error: 'Member not found or archived' }, { status: 403 })
  }

  // 4. Verify member is in this channel
  const service = createServiceClient()
  const { data: membership } = await service
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('member_id', memberId)
    .limit(1)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  // 5. Persist message
  const { data: msg, error: msgErr } = await service
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: memberId,
      content,
      message_kind: messageKind ?? 'text',
      depth: 0,
    })
    .select('id, created_at')
    .single()

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  return NextResponse.json({ messageId: msg.id, createdAt: msg.created_at })
}
