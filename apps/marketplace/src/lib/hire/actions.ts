'use server'

import { createServiceClient } from '@agentbay/db/server'
import { Agents } from '@agentbay/db/primitives'
import { getUser } from '@/lib/auth/get-user'
import { triggerProvision, triggerDestroy } from '@/lib/trigger'
import { revalidatePath } from 'next/cache'
import { ensureWorkspaceBootstrapped } from '@/lib/workspace/bootstrap'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
  joinTeamChannels,
  archiveAgentMemberByInstanceId,
} from '@/lib/workspace/agent-lifecycle'

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

  const service = createServiceClient()

  // 0. Enforce agent limit
  const count = await Agents.countInstances(user.id)

  if (count >= MAX_AGENTS_PER_USER) {
    return { error: `You can't hire more than ${MAX_AGENTS_PER_USER} agents right now.` } as const
  }

  // 1. Look up agent definition
  const agent = await Agents.findDef(agentSlug)
  if (!agent) return { error: `Agent not found: ${agentSlug}` } as const

  // 2. Check if already hired (running or suspended) — fast path for UX
  const { data: existing } = await service
    .from('agent_instances')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('agent_id', agent.id)
    .in('status', ['running', 'suspended', 'provisioning'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { instanceId: existing.id, status: existing.status, alreadyHired: true }
  }

  // 3. Ensure corporation + project exist (not primitives — raw queries)
  let { data: corp } = await service
    .from('corporations')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!corp) {
    const { data: newCorp } = await service
      .from('corporations')
      .insert({ user_id: user.id, name: 'My Corporation' })
      .select('id')
      .single()
    corp = newCorp
  }

  const { data: existingProject } = await service
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .eq('name', 'My Workspace')
    .limit(1)
    .maybeSingle()

  let projectId = existingProject?.id

  if (!projectId) {
    const { data: newProject } = await service
      .from('projects')
      .insert({
        user_id: user.id,
        name: 'My Workspace',
        corporation_id: corp?.id ?? null,
      })
      .select('id')
      .single()
    projectId = newProject?.id
  } else if (corp && !existingProject) {
    // Link orphan project to corporation
    await service
      .from('projects')
      .update({ corporation_id: corp.id })
      .eq('id', projectId)
      .is('corporation_id', null)
  }

  if (!projectId) return { error: 'Failed to create project' } as const

  // 4. Create agent instance (handles cleanup of destroyed instances + race safety)
  let instanceId: string
  try {
    instanceId = await Agents.createInstance(user.id, agent.id, { displayName: agent.name })
  } catch (e) {
    return { error: `Failed to create instance: ${e instanceof Error ? e.message : String(e)}` } as const
  }

  // 4b. Create workspace member + DM channel for the new agent
  try {
    const { userMemberId } = await ensureWorkspaceBootstrapped(projectId, user.id)
    const { memberId: agentMemberId } = await createAgentMember(
      projectId, instanceId, agent.name, 'worker', userMemberId
    )
    await createDMChannel(projectId, userMemberId, agentMemberId, agent.name)
    await joinBroadcastChannels(projectId, agentMemberId)
    await joinTeamChannels(projectId, agentMemberId)
  } catch (e) {
    // Non-fatal — bootstrap will backfill on next page load
    console.error('[hire] workspace member setup failed:', e)
  }

  // 5. Fire Trigger.dev provision task
  await triggerProvision({
    userId: user.id,
    agentId: agent.id,
    instanceId,
  })

  revalidatePath('/workspace')

  return { instanceId, status: 'provisioning', alreadyHired: false }
}

/**
 * Remove a hired agent — destroys the Fly.io machine and marks instance as destroyed.
 */
export async function removeAgent(instanceId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  // Fetch instance and verify ownership
  const inst = await Agents.getInstance(instanceId)

  if (!inst || inst.user_id !== user.id) return { error: 'Agent not found' }
  if (inst.status === 'destroyed') return { error: 'Agent already removed' }

  // Check workspace rank — block removal of co-founder (rank=master)
  const archiveResult = await archiveAgentMemberByInstanceId(instanceId)
  if (archiveResult?.error) return { error: archiveResult.error }

  // Mark as destroying immediately for UI feedback
  await Agents.updateInstance(instanceId, { status: 'destroying' })

  // Fire Trigger.dev destroy task (handles Fly cleanup async)
  if (inst.fly_app_name !== 'pending' && inst.fly_machine_id !== 'pending') {
    await triggerDestroy({ instanceId })
  } else {
    // No machine was ever created — just mark destroyed directly
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

  return {
    id: inst.id,
    status: inst.status,
  }
}
