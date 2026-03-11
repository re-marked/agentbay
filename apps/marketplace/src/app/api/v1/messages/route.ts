import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { Members, Channels, Messages, Agents } from '@agentbay/db/primitives'
import { dispatchToAgent } from '@/lib/agents/dispatch'

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

  // 1. Load channel
  const channel = await Channels.findById(channelId)
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // 2. Find user's member
  const userMember = await Members.findByUser(channel.project_id, user.id)
  if (!userMember) {
    return NextResponse.json({ error: 'Not a member of this project' }, { status: 403 })
  }

  // 3. Verify channel membership
  const isMember = await Channels.isMember(channelId, userMember.id)
  if (!isMember) {
    return NextResponse.json({ error: 'Not a member of this channel' }, { status: 403 })
  }

  // 4. Persist user message
  const userMsgId = await Messages.send(channelId, userMember.id, content)

  // 5. If DM channel, dispatch to the agent
  let agentMessageId: string | undefined
  if (channel.kind === 'direct') {
    try {
      const agent = await Agents.resolveAgentForChannel(channelId, userMember.id)

      if (agent) {
        await Members.updateStatus(agent.memberId, 'working')

        try {
          const { flyAppName, gatewayToken } = await Agents.getConnectionInfo(agent.instanceId)
          const context = await Messages.loadContext(channelId, userMember.id, { limit: 30 })
          const result = await dispatchToAgent(flyAppName, gatewayToken, context)

          agentMessageId = await Messages.send(channelId, agent.memberId, result.content, {
            depth: 1,
            originId: userMsgId,
            parentId: userMsgId,
          })
        } finally {
          await Members.updateStatus(agent.memberId, 'idle')
        }
      }
    } catch (err) {
      console.error('[v1/messages] Agent dispatch failed:', err)
    }
  }

  return NextResponse.json({
    messageId: userMsgId,
    agentMessageId,
  })
}
