import { schedules, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'
import { FlyClient } from '@agentbay/fly'

export const healthCheckMachines = schedules.task({
  id: 'health-check-machines',
  cron: '*/30 * * * *', // every 30 minutes
  maxDuration: 120,

  run: async () => {
    const db = createServiceClient()
    const fly = new FlyClient()

    const { data: instances } = await db
      .from('agent_instances')
      .select('id, fly_app_name, fly_machine_id, status')
      .in('status', ['running', 'suspended'])

    if (!instances?.length) {
      logger.info('No active instances to check')
      return
    }

    logger.info(`Health-checking ${instances.length} instances`)

    const results = await Promise.allSettled(
      instances.map(async (inst) => {
        try {
          const machine = await fly.getMachine(inst.fly_app_name, inst.fly_machine_id)

          // Sync DB state with actual machine state
          const newStatus =
            machine.state === 'started' ? 'running'
            : machine.state === 'suspended' ? 'suspended'
            : machine.state === 'stopped' ? 'stopped'
            : machine.state === 'destroyed' ? 'destroyed'
            : null

          if (newStatus && newStatus !== inst.status) {
            await db
              .from('agent_instances')
              .update({ status: newStatus })
              .eq('id', inst.id)
            logger.info(`Instance ${inst.id} state synced: ${inst.status} → ${newStatus}`)
          }

          // Restart crashed machines
          if (machine.state === 'stopped' && inst.status === 'running') {
            logger.warn(`Machine ${inst.fly_machine_id} unexpectedly stopped — restarting`)
            await fly.startMachine(inst.fly_app_name, inst.fly_machine_id)
          }

          return { instanceId: inst.id, state: machine.state }
        } catch (err) {
          logger.error(`Failed to check machine ${inst.fly_machine_id}`, { err })
          await db
            .from('agent_instances')
            .update({ status: 'error', error_message: String(err) })
            .eq('id', inst.id)
          return { instanceId: inst.id, error: String(err) }
        }
      })
    )

    const ok = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    logger.info(`Health check done: ${ok} ok, ${failed} failed`)
  },
})
