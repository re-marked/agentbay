import { task, logger } from '@trigger.dev/sdk/v3'
import { Agents } from '@agentbay/db/primitives'
import { FlyClient } from '@agentbay/fly'

export interface DestroyPayload {
  instanceId: string
}

export const destroyAgentMachine = task({
  id: 'destroy-agent-machine',
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000 },

  run: async ({ instanceId }: DestroyPayload) => {
    const fly = new FlyClient()

    try {
      const inst = await Agents.getInstance(instanceId)
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
      if ((inst as any).fly_volume_id) {
        await fly.deleteVolume(inst.fly_app_name, (inst as any).fly_volume_id)
        logger.info('Volume deleted', { volumeId: (inst as any).fly_volume_id })
      }

      // Update DB
      await Agents.updateInstance(instanceId, { status: 'destroyed' })
      logger.info('Instance marked destroyed', { instanceId })
    } catch (err) {
      logger.error('Destroy failed', {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      })
      await Agents.updateInstance(instanceId, { status: 'error' })
      throw err
    }
  },
})
