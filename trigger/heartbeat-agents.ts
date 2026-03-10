import { schedules, tasks as triggerTasks, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'

/**
 * Heartbeat cron — wakes all running agents every 10 minutes.
 *
 * Task-aware behavior:
 * - If an agent has 'assigned' tasks with no recent thread activity, re-dispatch via Trigger.dev
 * - Agents with no pending tasks still get a generic heartbeat for proactive checks
 */
export const heartbeatAgents = schedules.task({
  id: 'heartbeat-agents',
  cron: '*/10 * * * *',

  run: async () => {
    const db = createServiceClient()

    // Find all running instances that have a gateway token
    const { data: instances, error } = await db
      .from('agent_instances')
      .select('id, fly_app_name, gateway_token, display_name')
      .eq('status', 'running')
      .not('gateway_token', 'is', null)
      .not('fly_app_name', 'is', null)

    if (error) {
      logger.error('Failed to fetch running instances', { error: error.message })
      return
    }

    if (!instances?.length) {
      logger.info('No running agents to heartbeat')
      return
    }

    logger.info(`Heartbeating ${instances.length} agent(s)`)

    const results = await Promise.allSettled(
      instances.map(async (inst) => {
        // Check if this agent has stale assigned tasks to re-dispatch
        const dispatched = await dispatchStaleTasks(db, inst.id)
        if (dispatched > 0) {
          logger.info(`Re-dispatched ${dispatched} stale task(s) for ${inst.display_name}`, { instanceId: inst.id })
          return { id: inst.id, ok: true, dispatched }
        }

        // No stale tasks — send generic heartbeat
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
 * Find assigned/in_progress tasks for this agent instance that have stale threads,
 * and re-dispatch them via Trigger.dev.
 * Returns the number of tasks dispatched.
 */
async function dispatchStaleTasks(
  db: ReturnType<typeof createServiceClient>,
  instanceId: string,
): Promise<number> {
  // Find the agent's member record
  const { data: member } = await db
    .from('members')
    .select('id')
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  if (!member) return 0

  // Find assigned tasks for this member that have a thread_root_id
  const { data: staleTasks } = await db
    .from('tasks')
    .select('id, title, description, priority, channel_id, metadata')
    .eq('assigned_to', member.id)
    .in('status', ['assigned'])

  if (!staleTasks?.length) return 0

  let dispatched = 0

  for (const task of staleTasks) {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>
    const threadRootId = metadata.thread_root_id as string | undefined
    const channelId = task.channel_id as string | undefined

    if (!threadRootId || !channelId) continue

    // Check if there's recent activity in the thread (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await db
      .from('channel_messages')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', threadRootId)
      .gt('created_at', tenMinutesAgo)

    if (count && count > 0) continue // Recent activity exists, skip

    // Re-dispatch via Trigger.dev
    try {
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
    } catch (err) {
      logger.warn('Failed to re-dispatch stale task', {
        taskId: task.id,
        error: String(err),
      })
    }
  }

  return dispatched
}
