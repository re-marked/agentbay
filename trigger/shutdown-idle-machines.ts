import { schedules, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'
import { FlyClient } from '@agentbay/fly'

const IDLE_THRESHOLD_HOURS = 72 // 3 days — at current scale, cold starts hurt more than costs

export const shutdownIdleMachines = schedules.task({
  id: 'shutdown-idle-machines',
  cron: '0 */6 * * *', // every 6 hours
  maxDuration: 120,

  run: async () => {
    const db = createServiceClient()
    const fly = new FlyClient()

    const cutoff = new Date(Date.now() - IDLE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()

    const { data: idle } = await db
      .from('agent_instances')
      .select('id, fly_app_name, fly_machine_id')
      .eq('status', 'running')
      .lt('last_active_at', cutoff)

    if (!idle?.length) {
      logger.info('No idle machines to shut down')
      return
    }

    logger.info(`Stopping ${idle.length} idle machines`)

    await Promise.allSettled(
      idle.map(async (inst) => {
        try {
          await fly.stopMachine(inst.fly_app_name, inst.fly_machine_id)
          await db
            .from('agent_instances')
            .update({ status: 'stopped' })
            .eq('id', inst.id)
          logger.info(`Stopped idle machine ${inst.fly_machine_id}`)
        } catch (err) {
          logger.error(`Failed to stop machine ${inst.fly_machine_id}`, { err })
        }
      })
    )
  },
})
