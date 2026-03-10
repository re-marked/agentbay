'use server'

import { createServiceClient } from '@agentbay/db/server'
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
  const { count } = await service
    .from('agent_instances')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('status', 'in', '("destroyed","destroying")')

  if (count !== null && count >= MAX_AGENTS_PER_USER) {
    return { error: `You can't hire more than ${MAX_AGENTS_PER_USER} agents right now.` } as const
  }

  // 1. Look up agent
  const { data: agent } = await service
    .from('agents')
    .select('id, name, slug')
    .eq('slug', agentSlug)
    .eq('status', 'published')
    .single()

  if (!agent) return { error: `Agent not found: ${agentSlug}` } as const

  // 2. Check if already hired (running or suspended)
  const { data: existing } = await service
    .from('agent_instances')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('agent_id', agent.id)
    .in('status', ['running', 'suspended', 'provisioning'])
    .limit(1)
    .single()

  if (existing) {
    return { instanceId: existing.id, status: existing.status, alreadyHired: true }
  }

  // 2b. Clean up any destroyed instance so the unique constraint doesn't block re-hire
  await service
    .from('agent_instances')
    .delete()
    .eq('user_id', user.id)
    .eq('agent_id', agent.id)
    .in('status', ['destroyed', 'destroying'])

  // 3. Ensure corporation + project exist
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

  // 4. Create agent instance with provisioning status
  const { data: instance, error: instanceErr } = await service
    .from('agent_instances')
    .insert({
      user_id: user.id,
      agent_id: agent.id,
      display_name: agent.name,
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
    })
    .select('id')
    .single()

  if (instanceErr || !instance) {
    return { error: `Failed to create instance: ${instanceErr?.message}` } as const
  }

  // 4b. Create workspace member + DM channel for the new agent
  try {
    const { userMemberId } = await ensureWorkspaceBootstrapped(projectId, user.id)
    const { memberId: agentMemberId } = await createAgentMember(
      projectId, instance.id, agent.name, 'worker', userMemberId
    )
    await createDMChannel(projectId, userMemberId, agentMemberId, agent.name)
    await joinBroadcastChannels(projectId, agentMemberId)
    await joinTeamChannels(projectId, agentMemberId)
  } catch (e) {
    // Non-fatal — bootstrap will backfill on next page load
    console.error('[hire] workspace member setup failed:', e)
  }

  // 5. Add to default chat (first chat in the project)
  const { data: defaultChat } = await service
    .from('chats')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (defaultChat) {
    await service.from('chat_agents').insert({
      chat_id: defaultChat.id,
      instance_id: instance.id,
    })
  }

  // 7. Fire Trigger.dev provision task
  await triggerProvision({
    userId: user.id,
    agentId: agent.id,
    instanceId: instance.id,
  })

  revalidatePath('/workspace')

  return { instanceId: instance.id, status: 'provisioning', alreadyHired: false }
}

/**
 * Remove a hired agent — destroys the Fly.io machine and marks instance as destroyed.
 */
export async function removeAgent(instanceId: string) {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const service = createServiceClient()

  // Verify ownership
  const { data: inst } = await service
    .from('agent_instances')
    .select('id, status, fly_app_name, fly_machine_id')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single()

  if (!inst) return { error: 'Agent not found' }
  if (inst.status === 'destroyed') return { error: 'Agent already removed' }

  // Check workspace rank — block removal of co-founder (rank=master)
  const archiveResult = await archiveAgentMemberByInstanceId(instanceId)
  if (archiveResult?.error) return { error: archiveResult.error }

  // Mark as destroying immediately for UI feedback
  await service
    .from('agent_instances')
    .update({ status: 'destroying' })
    .eq('id', instanceId)

  // Fire Trigger.dev destroy task (handles Fly cleanup async)
  if (inst.fly_app_name !== 'pending' && inst.fly_machine_id !== 'pending') {
    await triggerDestroy({ instanceId })
  } else {
    // No machine was ever created — just mark destroyed directly
    await service
      .from('agent_instances')
      .update({ status: 'destroyed' })
      .eq('id', instanceId)
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

  const service = createServiceClient()

  const { data } = await service
    .from('agent_instances')
    .select('id, status')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single()

  if (!data) return null

  return {
    id: data.id,
    status: data.status,
  }
}
