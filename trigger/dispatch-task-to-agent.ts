import { task, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'

export interface DispatchTaskPayload {
  taskId: string
  instanceId: string
  agentMemberId: string
  channelId: string
  threadRootId: string
  title: string
  description: string | null
  priority: string
}

/**
 * Dispatch a task to an agent via OpenClaw's HTTP API.
 * The agent works on the task and its response is persisted as a thread reply in #tasks.
 */
export const dispatchTaskToAgent = task({
  id: 'dispatch-task-to-agent',
  maxDuration: 300, // 5 min — agent tasks are long-running
  retry: { maxAttempts: 2 },

  run: async (payload: DispatchTaskPayload) => {
    const { taskId, instanceId, agentMemberId, channelId, threadRootId, title, description, priority } = payload
    const db = createServiceClient()

    // 1. Get agent connection info
    const { data: instance } = await db
      .from('agent_instances')
      .select('fly_app_name, gateway_token, status')
      .eq('id', instanceId)
      .single()

    if (!instance) {
      logger.error('Instance not found', { instanceId })
      return { ok: false, error: 'Instance not found' }
    }

    if (instance.status !== 'running' || !instance.fly_app_name || !instance.gateway_token) {
      logger.warn('Agent not running, skipping dispatch', { instanceId, status: instance.status })
      return { ok: false, error: `Agent is ${instance.status}` }
    }

    // 2. Post dispatch status message to thread
    await db.from('channel_messages').insert({
      channel_id: channelId,
      sender_id: agentMemberId,
      content: `Working on this task...`,
      message_kind: 'system',
      thread_id: threadRootId,
      depth: 1,
    })

    // 3. Update task status → in_progress
    await db
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', taskId)

    // 4. Mark agent as working
    await db
      .from('members')
      .update({ status: 'working' })
      .eq('id', agentMemberId)

    // 5. Build instruction message
    const instruction = [
      `TASK_ASSIGNED: ${taskId}`,
      `Title: ${title}`,
      `Priority: ${priority}`,
      description ? `Description: ${description}` : null,
      '',
      'Work on this task now. Use your tools to complete it.',
      `When done: workspace-task update ${taskId} --status completed`,
      `If blocked: workspace-task update ${taskId} --status blocked`,
      `Post progress to #tasks thread: workspace-msg send ${channelId} "update" --thread ${threadRootId}`,
    ].filter(Boolean).join('\n')

    // 6. POST to agent's OpenClaw gateway
    const gatewayUrl = `https://${instance.fly_app_name}.fly.dev/v1/chat/completions`
    const sessionKey = `agent:main:task-${taskId}`

    try {
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${instance.gateway_token}`,
        },
        body: JSON.stringify({
          model: 'main',
          messages: [{ role: 'user', content: instruction }],
          stream: false,
          // OpenClaw session key for isolated task context
          ...(sessionKey ? { metadata: { sessionKey } } : {}),
        }),
        signal: AbortSignal.timeout(240_000), // 4 min timeout
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        logger.error('Agent dispatch failed', { status: res.status, body: text.slice(0, 500) })

        // Post error to thread
        await db.from('channel_messages').insert({
          channel_id: channelId,
          sender_id: agentMemberId,
          content: `Failed to work on task (HTTP ${res.status})`,
          message_kind: 'system',
          thread_id: threadRootId,
          depth: 1,
        })

        return { ok: false, error: `HTTP ${res.status}` }
      }

      const data = await res.json() as {
        choices?: { message?: { content?: string } }[]
      }

      const content = data.choices?.[0]?.message?.content ?? ''

      // 7. Persist agent response as thread reply
      if (content) {
        await db.from('channel_messages').insert({
          channel_id: channelId,
          sender_id: agentMemberId,
          content,
          message_kind: 'text',
          thread_id: threadRootId,
          depth: 1,
        })
      }

      logger.info('Task dispatch complete', { taskId, contentLength: content.length })

      // 8. Mark agent idle
      await db
        .from('members')
        .update({ status: 'idle' })
        .eq('id', agentMemberId)

      return { ok: true, content }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Task dispatch error', { taskId, error: message })

      // Post error to thread
      await db.from('channel_messages').insert({
        channel_id: channelId,
        sender_id: agentMemberId,
        content: `Error while working on task: ${message}`,
        message_kind: 'system',
        thread_id: threadRootId,
        depth: 1,
      })

      // Mark agent idle
      await db
        .from('members')
        .update({ status: 'idle' })
        .eq('id', agentMemberId)

      throw err // rethrow so Trigger.dev retries
    }
  },
})
