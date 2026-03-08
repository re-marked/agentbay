import { task, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'
import { FlyClient } from '@agentbay/fly'

export interface DestroyPayload {
  instanceId: string
}

export const destroyAgentMachine = task({
  id: 'destroy-agent-machine',
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000 },

  run: async ({ instanceId }: DestroyPayload) => {
    const db = createServiceClient()
    const fly = new FlyClient()

    try {
      const { data: inst } = await db
        .from('agent_instances')
        .select('fly_app_name, fly_machine_id, fly_volume_id')
        .eq('id', instanceId)
        .single()

      if (!inst) throw new Error(`Instance not found: ${instanceId}`)

      // Skip if instance was already reset to pending (e.g. by re-provision)
      if (!inst.fly_app_name || inst.fly_app_name === 'pending') {
        logger.info('Instance already in pending state, nothing to destroy', { instanceId })
        return
      }

      // Stop then destroy machine
      try {
        await fly.stopMachine(inst.fly_app_name, inst.fly_machine_id)
      } catch {
        // already stopped — continue
      }

      await fly.deleteMachine(inst.fly_app_name, inst.fly_machine_id, true)
      logger.info('Machine destroyed', { machineId: inst.fly_machine_id })

      // Delete volume
      if (inst.fly_volume_id) {
        await fly.deleteVolume(inst.fly_app_name, inst.fly_volume_id)
        logger.info('Volume deleted', { volumeId: inst.fly_volume_id })
      }

      // Update DB
      await db
        .from('agent_instances')
        .update({ status: 'destroyed' })
        .eq('id', instanceId)

      logger.info('Instance marked destroyed', { instanceId })
    } catch (err) {
      logger.error('Destroy failed', {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      })
      await db
        .from('agent_instances')
        .update({ status: 'error' })
        .eq('id', instanceId)
      throw err
    }
  },
})
