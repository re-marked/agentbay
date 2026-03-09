import { schedules, tasks as triggerTasks, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'
import { FlyClient } from '@agentbay/fly'

/**
 * Health check cron — runs every 5 minutes.
 *
 * For running instances: verifies Fly machine state + pings /healthz
 * For stopped instances: restarts them
 * For destroyed/error instances: triggers auto-re-provisioning
 */
export const healthCheckMachines = schedules.task({
  id: 'health-check-machines',
  cron: '*/5 * * * *',
  maxDuration: 120,

  run: async () => {
    const db = createServiceClient()
    const fly = new FlyClient()

    // Fetch all instances that might need attention
    // Exclude 'provisioning' (in progress) to avoid double-provision
    const { data: instances } = await db
      .from('agent_instances')
      .select('id, fly_app_name, fly_machine_id, gateway_token, status, user_id, agent_id, display_name')
      .in('status', ['running', 'suspended', 'stopped', 'error', 'destroyed'])

    if (!instances?.length) {
      logger.info('No instances to check')
      return
    }

    logger.info(`Health-checking ${instances.length} instances`)

    const results = await Promise.allSettled(
      instances.map(async (inst) => {
        try {
          // ── Running: verify Fly state + OpenClaw health ──
          if (inst.status === 'running' && inst.fly_app_name && inst.fly_machine_id) {
            // 1. Check actual machine state on Fly
            let machineState: string
            try {
              const machine = await fly.getMachine(inst.fly_app_name, inst.fly_machine_id)
              machineState = machine.state
            } catch {
              machineState = 'unknown'
            }

            if (machineState !== 'started' && machineState !== 'unknown') {
              // Machine isn't running — sync DB and recover
              const newStatus = machineState === 'destroyed' ? 'destroyed'
                : machineState === 'stopped' ? 'stopped'
                : machineState === 'suspended' ? 'suspended'
                : 'error'

              await db.from('agent_instances')
                .update({ status: newStatus })
                .eq('id', inst.id)

              logger.warn(`Instance ${inst.id} was "running" but Fly says ${machineState}`)

              if (newStatus === 'destroyed' || newStatus === 'stopped') {
                await autoReprovision(db, inst)
              }

              return { id: inst.id, action: 'state-synced', to: newStatus }
            }

            // 2. Ping /healthz to verify OpenClaw is responsive
            if (inst.gateway_token) {
              try {
                const healthUrl = `https://${inst.fly_app_name}.fly.dev/healthz`
                const res = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) })

                if (!res.ok) {
                  logger.warn(`OpenClaw unhealthy on ${inst.fly_app_name}`, {
                    status: res.status,
                    instanceId: inst.id,
                  })
                  // Stop the machine — Fly's 'always' restart policy will bring it back
                  try {
                    await fly.stopMachine(inst.fly_app_name, inst.fly_machine_id)
                    logger.info(`Stopped unhealthy machine ${inst.fly_machine_id} (restart policy will recover)`)
                  } catch (err) {
                    logger.error('Failed to stop unhealthy machine', { error: String(err) })
                  }
                  return { id: inst.id, action: 'restarted-unhealthy' }
                }

                return { id: inst.id, action: 'healthy' }
              } catch {
                logger.warn(`/healthz unreachable on ${inst.fly_app_name}`, { instanceId: inst.id })
                return { id: inst.id, action: 'healthz-timeout' }
              }
            }

            return { id: inst.id, action: 'healthy' }
          }

          // ── Stopped: restart ──
          if (inst.status === 'stopped' && inst.fly_app_name && inst.fly_machine_id) {
            try {
              await fly.startMachine(inst.fly_app_name, inst.fly_machine_id)
              await db.from('agent_instances')
                .update({ status: 'running' })
                .eq('id', inst.id)
              logger.info(`Restarted stopped instance ${inst.id}`)
              return { id: inst.id, action: 'restarted' }
            } catch (err) {
              logger.warn('Failed to restart stopped instance', { error: String(err) })
              await autoReprovision(db, inst)
              return { id: inst.id, action: 'reprovision-after-restart-fail' }
            }
          }

          // ── Destroyed/Error: auto-re-provision ──
          if (inst.status === 'destroyed' || inst.status === 'error') {
            await autoReprovision(db, inst)
            return { id: inst.id, action: 'reprovision-triggered' }
          }

          // ── Suspended: sync state ──
          if (inst.status === 'suspended' && inst.fly_app_name && inst.fly_machine_id) {
            try {
              const machine = await fly.getMachine(inst.fly_app_name, inst.fly_machine_id)
              if (machine.state !== 'suspended') {
                const newStatus = machine.state === 'started' ? 'running' : machine.state
                await db.from('agent_instances')
                  .update({ status: newStatus })
                  .eq('id', inst.id)
                return { id: inst.id, action: 'state-synced', to: newStatus }
              }
            } catch {
              // Ignore — machine might not exist
            }
            return { id: inst.id, action: 'still-suspended' }
          }

          return { id: inst.id, action: 'skip' }
        } catch (err) {
          logger.error(`Health check failed for ${inst.id}`, { error: String(err) })
          return { id: inst.id, action: 'error', error: String(err) }
        }
      })
    )

    const healthy = results.filter(
      r => r.status === 'fulfilled' && (r.value as { action: string }).action === 'healthy'
    ).length
    logger.info(`Health check complete: ${healthy}/${instances.length} healthy`)
  },
})

/**
 * Trigger re-provisioning for a dead agent instance.
 * Detects co-founder by display_name, finds member for project context.
 */
async function autoReprovision(
  db: ReturnType<typeof createServiceClient>,
  inst: { id: string; user_id: string; agent_id: string; display_name?: string | null },
): Promise<void> {
  const isCoFounder = inst.display_name === 'Personal AI'

  const { data: member } = await db
    .from('members')
    .select('id, project_id')
    .eq('instance_id', inst.id)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  await db.from('agent_instances')
    .update({ status: 'provisioning' })
    .eq('id', inst.id)

  try {
    await triggerTasks.trigger('provision-agent-machine', {
      userId: inst.user_id,
      agentId: inst.agent_id,
      instanceId: inst.id,
      projectId: member?.project_id ?? undefined,
      memberId: member?.id ?? undefined,
      isCoFounder,
    })
    logger.info(`Auto-reprovision triggered for ${inst.id}`, { isCoFounder })
  } catch (err) {
    logger.error('Failed to trigger auto-reprovision', { instanceId: inst.id, error: String(err) })
    await db.from('agent_instances')
      .update({ status: 'error' })
      .eq('id', inst.id)
  }
}
