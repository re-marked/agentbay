'use server'

import { Agents, Members } from '@agentbay/db/primitives'
import { getUser } from '@/lib/auth/get-user'
import { triggerDestroy } from '@/lib/trigger'
import { revalidatePath } from 'next/cache'
import { ensureWorkspaceBootstrapped } from '@/lib/workspace/bootstrap'
import { hireAgentFlow, ensureCorpAndProject } from '@/lib/flows'

interface HireAgentParams {
  agentSlug: string
}

const MAX_AGENTS_PER_USER = 6

/**
 * Hire an agent from the marketplace.
 * Creates project/team if needed, creates agent_instance with status=provisioning,
 * fires Trigger.dev provision task, returns instance ID for polling.
 */
export async function hireAgent({ agentSlug }: HireAgentParams) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' } as const

  // 0. Enforce agent limit
  const count = await Agents.countInstances(user.id)
  if (count >= MAX_AGENTS_PER_USER) {
    return { error: `You can't hire more than ${MAX_AGENTS_PER_USER} agents right now.` } as const
  }

  // 1. Look up agent definition
  const agent = await Agents.findDef(agentSlug)
  if (!agent) return { error: `Agent not found: ${agentSlug}` } as const

  // 2. Check if already hired — fast path for UX
  const existing = await Agents.isHired(user.id, agent.id)
  if (existing) {
    return { instanceId: existing.id, status: existing.status, alreadyHired: true }
  }

  // 3. Ensure corporation + project exist
  const projectId = await ensureCorpAndProject(user.id)

  // 4. Run hire flow
  let instanceId: string
  try {
    const { userMemberId } = await ensureWorkspaceBootstrapped(projectId, user.id)
    const result = await hireAgentFlow({
      userId: user.id,
      projectId,
      userMemberId,
      agentId: agent.id,
      displayName: agent.name,
      rank: 'worker',
    })
    instanceId = result.instanceId
  } catch (e) {
    return { error: `Failed to hire agent: ${e instanceof Error ? e.message : String(e)}` } as const
  }

  revalidatePath('/workspace')
  return { instanceId, status: 'provisioning', alreadyHired: false }
}

/**
 * Remove a hired agent — destroys the Fly.io machine and marks instance as destroyed.
 */
export async function removeAgent(instanceId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const inst = await Agents.getInstance(instanceId)
  if (!inst || inst.user_id !== user.id) return { error: 'Agent not found' }
  if (inst.status === 'destroyed') return { error: 'Agent already removed' }

  // Check workspace rank — block removal of co-founder (rank=master)
  const archiveResult = await Members.archiveByInstanceId(instanceId)
  if (archiveResult?.error) return { error: archiveResult.error }

  // Mark as destroying immediately for UI feedback
  await Agents.updateInstance(instanceId, { status: 'destroying' })

  // Fire Trigger.dev destroy task (handles Fly cleanup async)
  if (inst.fly_app_name !== 'pending' && inst.fly_machine_id !== 'pending') {
    await triggerDestroy({ instanceId })
  } else {
    await Agents.updateInstance(instanceId, { status: 'destroyed' })
  }

  revalidatePath('/workspace')
  return { success: true }
}

/**
 * Check the status of an agent instance (for polling during provisioning).
 */
export async function checkInstanceStatus(instanceId: string) {
  const user = await getUser()
  if (!user) return null

  const inst = await Agents.getInstance(instanceId)
  if (!inst || inst.user_id !== user.id) return null

  return { id: inst.id, status: inst.status }
}
