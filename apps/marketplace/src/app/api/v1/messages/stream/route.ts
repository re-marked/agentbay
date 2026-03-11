import { getUser } from '@/lib/auth/get-user'
import { streamFromAgent } from '@/lib/agents/stream-dispatch'
import { Members, Channels, Messages, Agents } from '@agentbay/db/primitives'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/v1/messages/stream
 *
 * Streaming version of /api/v1/messages for DM channels.
 * Opens a WebSocket to the agent, streams text deltas + tool events as SSE.
 * Persists both user and agent messages to channel_messages.
 *
 * Body: { channelId: string, content: string, threadId?: string, taskId?: string }
 * Returns: SSE stream (text/event-stream)
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { channelId: string; content: string; threadId?: string; taskId?: string; instanceId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { channelId, content, threadId, taskId, instanceId } = body
  if (!channelId || !content) {
    return new Response(JSON.stringify({ error: 'Missing channelId or content' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1. Load channel and verify it exists
  const channel = await Channels.findById(channelId)
  if (!channel) {
    return new Response(JSON.stringify({ error: 'Channel not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Find user's member record in this project
  const userMember = await Members.findByUser(channel.project_id, user.id)
  if (!userMember) {
    return new Response(JSON.stringify({ error: 'Not a member of this project' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Verify channel membership (broadcast channels allow all project members)
  if (channel.kind !== 'broadcast') {
    const isMember = await Channels.isMember(channelId, userMember.id)
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Not a member of this channel' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // 4. Persist user message
  let userMsgId: string
  try {
    userMsgId = await Messages.send(channelId, userMember.id, content, {
      depth: threadId ? 1 : 0,
      parentId: threadId,
    })
  } catch (err) {
    console.error('[v1/messages/stream] Failed to save message:', err, {
      channelId,
      senderId: userMember.id,
      contentLength: content.length,
    })
    return new Response(JSON.stringify({ error: 'Failed to save message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 5. Resolve agent — 3-tier: instanceId hint → task assignee → channel members (prefer running)
  const agentMember = await Agents.resolveAgentForChannel(channelId, userMember.id, { instanceId, taskId })
  if (!agentMember) {
    return new Response(JSON.stringify({ error: 'No agent found for this context' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 6. Mark agent as working
  await Members.updateStatus(agentMember.memberId, 'working')

  // 7. Get agent connection info
  let flyAppName: string
  let gatewayToken: string
  try {
    const info = await Agents.getConnectionInfo(agentMember.instanceId)
    flyAppName = info.flyAppName
    gatewayToken = info.gatewayToken
  } catch (err) {
    await Members.updateStatus(agentMember.memberId, 'idle')

    const encoder = new TextEncoder()
    const errorMsg = err instanceof Error ? err.message : 'Agent not available'
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`))
        controller.close()
      },
    })
    return new Response(errorStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // 8. Load recent history for context
  const messages = await Messages.loadContext(channelId, userMember.id, { limit: 30, threadId })

  // 9. Stream from agent — tools persist as real messages, text persists on completion
  const persistedToolIds = new Set<string>()

  // Stable session key: task-scoped when in task thread, otherwise channel-scoped
  const sessionKey = taskId
    ? `agent:main:task-${taskId}`
    : `agent:main:dm-${channelId}`

  const stream = streamFromAgent(
    flyAppName,
    gatewayToken,
    messages,
    {
      async onToolEvent(tool) {
        if (tool.state === 'end' || tool.state === 'error') {
          if (persistedToolIds.has(tool.id)) return
          persistedToolIds.add(tool.id)

          await Messages.send(
            channelId,
            agentMember.memberId,
            `${tool.tool}${tool.args ? ` ${tool.args}` : ''}`,
            {
              kind: 'tool_result',
              depth: 1,
              originId: userMsgId,
              parentId: threadId ?? userMsgId,
              metadata: {
                id: tool.id,
                tool: tool.tool,
                args: tool.args,
                output: tool.output,
                error: tool.error,
                status: tool.state === 'end' ? 'done' : 'error',
              },
            }
          )
        }
      },

      async onComplete(result) {
        if (result.content) {
          await Messages.send(channelId, agentMember.memberId, result.content, {
            depth: 1,
            originId: userMsgId,
            parentId: threadId ?? userMsgId,
          })
        }
        await Members.updateStatus(agentMember.memberId, 'idle')
      },
    },
    request.signal,
    sessionKey,
  )

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
