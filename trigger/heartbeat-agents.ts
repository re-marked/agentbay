import { schedules, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'

/**
 * Heartbeat cron — wakes all running agents every 10 minutes.
 * Sends "HEARTBEAT" as a user message via each agent's OpenClaw gateway.
 * The agent reads HEARTBEAT.md and acts on pending tasks, briefings, etc.
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
