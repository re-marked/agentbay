import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { getAgentConnectionInfo } from '@/lib/agents/dispatch'
import { streamFromAgent } from '@/lib/agents/stream-dispatch'

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

  let body: { channelId: string; content: string; threadId?: string; taskId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { channelId, content, threadId, taskId } = body
  if (!channelId || !content) {
    return new Response(JSON.stringify({ error: 'Missing channelId or content' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const service = createServiceClient()

  // 1. Load channel and verify access
  const { data: channel } = await service
    .from('channels')
    .select('id, project_id, kind')
    .eq('id', channelId)
    .single()

  if (!channel) {
    return new Response(JSON.stringify({ error: 'Channel not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Find user's member ID
  const { data: userMember } = await service
    .from('members')
    .select('id')
    .eq('project_id', channel.project_id)
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .limit(1)
    .single()

  if (!userMember) {
    return new Response(JSON.stringify({ error: 'Not a member of this project' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Verify channel membership (broadcast channels allow all project members)
  if (channel.kind !== 'broadcast') {
    const { data: membership } = await service
      .from('channel_members')
      .select('id')
      .eq('channel_id', channelId)
      .eq('member_id', userMember.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this channel' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // 4. Persist user message (with thread_id if in thread mode)
  const { data: userMsg, error: msgErr } = await service
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: userMember.id,
      content,
      message_kind: 'text',
      depth: threadId ? 1 : 0,
      ...(threadId ? { thread_id: threadId } : {}),
    })
    .select('id')
    .single()

  if (msgErr || !userMsg) {
    return new Response(JSON.stringify({ error: 'Failed to save message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 5. Find agent member — from task assignee (thread mode) or channel members (DM mode)
  let agentMember: { id: string; instance_id: string; display_name: string } | null = null

  if (taskId) {
    // In task thread mode, resolve agent from the task's assignee
    const { data: taskRow } = await service
      .from('tasks')
      .select('assigned_to, assignee:members!tasks_assigned_to_fkey(id, instance_id, display_name)')
      .eq('id', taskId)
      .single()

    if (taskRow?.assigned_to) {
      const assignee = (taskRow as any).assignee as { id: string; instance_id: string | null; display_name: string } | null
      if (assignee?.instance_id) {
        agentMember = assignee as { id: string; instance_id: string; display_name: string }
      }
    }
  }

  if (!agentMember) {
    // Fall back to finding agent in channel members
    const { data: channelMembers } = await service
      .from('channel_members')
      .select('member_id, members!inner(id, instance_id, display_name)')
      .eq('channel_id', channelId)
      .neq('member_id', userMember.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentMembership = channelMembers?.find((cm: any) => cm.members?.instance_id != null)
    if (agentMembership) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agentMember = (agentMembership as any).members as {
        id: string
        instance_id: string
        display_name: string
      }
    }
  }

  if (!agentMember) {
    return new Response(JSON.stringify({ error: 'No agent found for this context' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 6. Mark agent as working
  await service
    .from('members')
    .update({ status: 'working' })
    .eq('id', agentMember.id)

  // 7. Get agent connection info
  let flyAppName: string
  let gatewayToken: string
  try {
    const info = await getAgentConnectionInfo(agentMember.instance_id)
    flyAppName = info.flyAppName
    gatewayToken = info.gatewayToken
  } catch (err) {
    // Mark agent idle on connection error
    await service
      .from('members')
      .update({ status: 'idle' })
      .eq('id', agentMember.id)

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

  // 8. Load recent history for context (newest 30, then reverse to chronological order)
  // When in thread mode, scope history to the thread
  let historyQuery = service
    .from('channel_messages')
    .select('content, sender_id, message_kind')
    .eq('channel_id', channelId)
    .eq('message_kind', 'text')
    .order('created_at', { ascending: false })
    .limit(30)

  if (threadId) {
    historyQuery = historyQuery.or(`id.eq.${threadId},thread_id.eq.${threadId}`)
  }

  const { data: history } = await historyQuery

  const messages = (history ?? []).reverse().map(msg => ({
    role: (msg.sender_id === userMember.id ? 'user' : 'assistant') as 'user' | 'assistant',
    content: msg.content,
  }))

  // 9. Stream from agent — tools persist as real messages, text persists on completion
  const persistedToolIds = new Set<string>()

  // Stable session key: task-scoped when in task thread, otherwise channel-scoped.
  // OpenClaw maintains conversation history per session key.
  const sessionKey = taskId
    ? `agent:main:task-${taskId}`
    : `agent:main:dm-${channelId}`

  const stream = streamFromAgent(
    flyAppName,
    gatewayToken,
    messages,
    {
      async onToolEvent(tool) {
        // Persist each tool as a separate channel_message (tool_result kind)
        // Only persist on 'end' or 'error' — start events are ephemeral
        if (tool.state === 'end' || tool.state === 'error') {
          if (persistedToolIds.has(tool.id)) return // dedup
          persistedToolIds.add(tool.id)

          await service
            .from('channel_messages')
            .insert({
              channel_id: channelId,
              sender_id: agentMember.id,
              content: `${tool.tool}${tool.args ? ` ${tool.args}` : ''}`,
              message_kind: 'tool_result',
              depth: 1,
              origin_id: userMsg.id,
              parent_id: userMsg.id,
              ...(threadId ? { thread_id: threadId } : {}),
              metadata: {
                id: tool.id,
                tool: tool.tool,
                args: tool.args,
                output: tool.output,
                error: tool.error,
                status: tool.state === 'end' ? 'done' : 'error',
              },
            })
        }
      },

      async onComplete(result) {
        // Persist the agent's text response (if any)
        if (result.content) {
          await service
            .from('channel_messages')
            .insert({
              channel_id: channelId,
              sender_id: agentMember.id,
              content: result.content,
              message_kind: 'text',
              depth: 1,
              origin_id: userMsg.id,
              parent_id: userMsg.id,
              ...(threadId ? { thread_id: threadId } : {}),
            })
        }

        // Mark agent idle
        await service
          .from('members')
          .update({ status: 'idle' })
          .eq('id', agentMember.id)
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
