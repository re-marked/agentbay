import { schedules, tasks as triggerTasks, logger } from '@trigger.dev/sdk/v3'
import { Agents, Members, Channels, Messages, Tasks } from '@agentbay/db/primitives'

/**
 * Heartbeat cron — wakes all running agents every 10 minutes.
 *
 * Task-aware behavior:
 * - Catches unannounced tasks (from CLI or failed API calls) and retroactively announces + dispatches
 * - Re-dispatches stale 'assigned' tasks (>10 min no activity) and 'in_progress' tasks (>30 min)
 * - Tracks last_dispatched_at in task metadata to prevent rapid re-dispatch
 * - Agents with no pending tasks still get a generic heartbeat for proactive checks
 */
export const heartbeatAgents = schedules.task({
  id: 'heartbeat-agents',
  cron: '*/10 * * * *',

  run: async () => {
    const instances = await Agents.listRunning()

    if (!instances.length) {
      logger.info('No running agents to heartbeat')
      return
    }

    logger.info(`Heartbeating ${instances.length} agent(s)`)

    const results = await Promise.allSettled(
      instances.map(async (inst) => {
        // Check if this agent has stale or unannounced tasks to dispatch
        const dispatched = await dispatchStaleTasks(inst.id)
        if (dispatched > 0) {
          logger.info(`Dispatched ${dispatched} task(s) for ${inst.display_name}`, { instanceId: inst.id })
          // Skip generic heartbeat — task dispatch is the heartbeat
          return { id: inst.id, ok: true, dispatched }
        }

        // No tasks to dispatch — send generic heartbeat
        const gatewayUrl = `https://${inst.fly_app_name}.fly.dev`
        try {
          const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${inst.gateway_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'default',
              messages: [{ role: 'user', content: 'HEARTBEAT' }],
            }),
            signal: AbortSignal.timeout(90_000),
          })

          if (!res.ok) {
            const text = await res.text().catch(() => '')
            logger.warn(`Heartbeat failed for ${inst.display_name}`, {
              instanceId: inst.id,
              status: res.status,
              body: text.slice(0, 200),
            })
            return { id: inst.id, ok: false, status: res.status }
          }

          logger.info(`Heartbeat sent to ${inst.display_name}`, { instanceId: inst.id })
          return { id: inst.id, ok: true }
        } catch (err) {
          logger.warn(`Heartbeat unreachable: ${inst.display_name}`, {
            instanceId: inst.id,
            error: String(err),
          })
          return { id: inst.id, ok: false, error: String(err) }
        }
      })
    )

    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length
    logger.info(`Heartbeat complete: ${succeeded}/${instances.length} succeeded`)
  },
})

/**
 * Safety net: find tasks assigned to this agent that need attention.
 *
 * A. Unannounced tasks — no thread_root_id in metadata (from CLI or failed API calls).
 *    Retroactively announce in #tasks + dispatch.
 *
 * B. Stale 'assigned' tasks — have thread but no activity for 10+ minutes.
 *    Re-dispatch via Trigger.dev.
 *
 * C. Stale 'in_progress' tasks — have thread but no activity for 30+ minutes.
 *    Re-dispatch via Trigger.dev (agent may have crashed/timed out).
 *
 * Respects last_dispatched_at to prevent rapid re-dispatch (minimum 10 min gap).
 */
async function dispatchStaleTasks(instanceId: string): Promise<number> {
  // Find the agent's member record
  const member = await Members.findByInstanceId(instanceId)
  if (!member) return 0

  // Find active tasks for this member (assigned or in_progress)
  const activeTasks = await Tasks.listByAssignee(member.id, ['assigned', 'in_progress'])
  if (!activeTasks.length) return 0

  let dispatched = 0
  const now = Date.now()
  const TEN_MINUTES = 10 * 60 * 1000
  const THIRTY_MINUTES = 30 * 60 * 1000

  for (const task of activeTasks) {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>
    const threadRootId = metadata.thread_root_id as string | undefined
    const channelId = task.channel_id as string | undefined
    const lastDispatched = metadata.last_dispatched_at as string | undefined

    // Guard: don't re-dispatch if we dispatched recently (within 10 min)
    if (lastDispatched) {
      const elapsed = now - new Date(lastDispatched).getTime()
      if (elapsed < TEN_MINUTES) continue
    }

    // Case A: Unannounced task — no thread_root_id
    if (!threadRootId || !channelId) {
      try {
        // Find #tasks channel for this project
        const tasksChannels = await Channels.findBroadcast(member.project_id, 'tasks')
        if (!tasksChannels.length) continue

        const tasksChannel = tasksChannels[0]

        // Resolve assignee name
        const memberData = await Members.findById(member.id)
        const assigneeName = memberData?.display_name ?? 'agent'
        const announcement = `📋 New task: **${task.title}** → assigned to **${assigneeName}**${task.priority !== 'normal' ? ` [${task.priority}]` : ''}`

        // Post announcement
        const msgId = await Messages.send(tasksChannel.id, member.id, announcement, {
          kind: 'system',
        })

        // Store thread_root_id + last_dispatched_at in task metadata
        await Tasks.update(task.id, {
          channelId: tasksChannel.id,
          metadata: { ...metadata, thread_root_id: msgId, last_dispatched_at: new Date().toISOString() },
        })

        // Dispatch to agent
        await triggerTasks.trigger('dispatch-task-to-agent', {
          taskId: task.id,
          instanceId,
          agentMemberId: member.id,
          channelId: tasksChannel.id,
          threadRootId: msgId,
          title: task.title,
          description: task.description,
          priority: task.priority,
        })

        dispatched++
        logger.info('Retroactively announced + dispatched unannounced task', { taskId: task.id })
      } catch (err) {
        logger.warn('Failed to announce+dispatch unannounced task', {
          taskId: task.id,
          error: String(err),
        })
      }
      continue
    }

    // Case B & C: Has thread — check for staleness
    const stalenessThreshold = task.status === 'assigned' ? TEN_MINUTES : THIRTY_MINUTES

    // Check for recent thread activity
    const cutoff = new Date(now - stalenessThreshold).toISOString()
    const replyCount = await Messages.countReplies(threadRootId, cutoff)

    if (replyCount > 0) continue // Recent activity exists, skip

    // Stale — re-dispatch
    try {
      // Update last_dispatched_at
      await Tasks.update(task.id, {
        metadata: { ...metadata, last_dispatched_at: new Date().toISOString() },
      })

      await triggerTasks.trigger('dispatch-task-to-agent', {
        taskId: task.id,
        instanceId,
        agentMemberId: member.id,
        channelId,
        threadRootId,
        title: task.title,
        description: task.description,
        priority: task.priority,
      })
      dispatched++
      logger.info(`Re-dispatched stale ${task.status} task`, { taskId: task.id, status: task.status })
    } catch (err) {
      logger.warn('Failed to re-dispatch stale task', {
        taskId: task.id,
        error: String(err),
      })
    }
  }

  return dispatched
}
