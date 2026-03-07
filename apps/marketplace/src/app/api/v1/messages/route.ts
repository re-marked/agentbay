import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { dispatchToAgent, getAgentConnectionInfo } from '@/lib/agents/dispatch'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/v1/messages
 *
 * Send a message in a channel. If the channel is a DM, auto-dispatches
 * to the agent and persists the response.
 *
 * Body: { channelId: string, content: string }
 * Returns: { messageId: string, agentMessageId?: string }
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { channelId: string; content: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channelId, content } = body
  if (!channelId || !content) {
    return NextResponse.json({ error: 'Missing channelId or content' }, { status: 400 })
  }

  const service = createServiceClient()

  // 1. Load channel and verify user has access
  const { data: channel } = await service
    .from('channels')
    .select('id, project_id, kind')
    .eq('id', channelId)
    .single()

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // 2. Find user's member ID in this project
  const { data: userMember } = await service
    .from('members')
    .select('id')
    .eq('project_id', channel.project_id)
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .limit(1)
    .single()

  if (!userMember) {
    return NextResponse.json({ error: 'Not a member of this project' }, { status: 403 })
  }

  // 3. Verify user is a member of this channel
  const { data: membership } = await service
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('member_id', userMember.id)
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  // 4. Persist user message
  const { data: userMsg, error: msgErr } = await service
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: userMember.id,
      content,
      message_kind: 'text',
      depth: 0,
    })
    .select('id')
    .single()

  if (msgErr || !userMsg) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  // 5. If DM channel, dispatch to the agent
  let agentMessageId: string | undefined
  if (channel.kind === 'direct') {
    try {
      // Find the agent member in this channel
      const { data: channelMembers } = await service
        .from('channel_members')
        .select('member_id, members!inner(id, instance_id, display_name)')
        .eq('channel_id', channelId)
        .neq('member_id', userMember.id)

      const agentMembership = channelMembers?.find(
        (cm: any) => cm.members?.instance_id != null
      )

      if (agentMembership) {
        const agentMember = agentMembership.members as any as {
          id: string; instance_id: string; display_name: string
        }

        // Mark agent as working
        await service
          .from('members')
          .update({ status: 'working' })
          .eq('id', agentMember.id)

        try {
          // Get agent connection info
          const { flyAppName, gatewayToken } = await getAgentConnectionInfo(
            agentMember.instance_id
          )

          // Load recent channel history for context
          const { data: history } = await service
            .from('channel_messages')
            .select('content, sender_id')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(30)

          // Build OpenAI-format messages array
          const messages = (history ?? []).map(msg => ({
            role: (msg.sender_id === userMember.id ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content,
          }))

          // Dispatch to agent
          const result = await dispatchToAgent(flyAppName, gatewayToken, messages)

          // Persist agent response
          const { data: agentMsg } = await service
            .from('channel_messages')
            .insert({
              channel_id: channelId,
              sender_id: agentMember.id,
              content: result.content,
              message_kind: 'text',
              depth: 1,
              origin_id: userMsg.id,
              parent_id: userMsg.id,
            })
            .select('id')
            .single()

          agentMessageId = agentMsg?.id
        } finally {
          // Mark agent as idle
          await service
            .from('members')
            .update({ status: 'idle' })
            .eq('id', agentMember.id)
        }
      }
    } catch (err) {
      console.error('[v1/messages] Agent dispatch failed:', err)
      // Don't fail the whole request — user message was saved
    }
  }

  return NextResponse.json({
    messageId: userMsg.id,
    agentMessageId,
  })
}
