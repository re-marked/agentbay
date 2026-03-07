import { createServiceClient } from '@agentbay/db/server'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
} from './agent-lifecycle'

/**
 * Ensure workspace primitives exist for a project.
 * Idempotent — safe to call on every page load.
 *
 * Creates:
 * 1. User member (rank=owner) if missing
 * 2. #general channel (kind=broadcast) if missing
 * 3. User added to #general
 * 4. Backfills any agent_instances that lack a workspace member
 */
export async function ensureWorkspaceBootstrapped(
  projectId: string,
  userId: string
): Promise<{ userMemberId: string }> {
  const service = createServiceClient()

  // 1. Create or find user member (rank=owner)
  let userMemberId: string

  const { data: existingMember } = await service
    .from('members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingMember) {
    userMemberId = existingMember.id
  } else {
    const { data: newMember, error } = await service
      .from('members')
      .insert({
        project_id: projectId,
        user_id: userId,
        display_name: 'You',
        rank: 'owner',
        status: 'active',
      })
      .select('id')
      .single()

    // Race condition: another request created it
    if (error?.code === '23505') {
      const { data: raced } = await service
        .from('members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single()
      userMemberId = raced!.id
    } else if (!newMember) {
      throw new Error(`Failed to create user member: ${error?.message}`)
    } else {
      userMemberId = newMember.id
    }
  }

  // 2. Create or find #general channel
  let generalChannelId: string

  const { data: existingGeneral } = await service
    .from('channels')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', 'general')
    .eq('kind', 'broadcast')
    .maybeSingle()

  if (existingGeneral) {
    generalChannelId = existingGeneral.id
  } else {
    const { data: newChannel, error } = await service
      .from('channels')
      .insert({
        project_id: projectId,
        name: 'general',
        kind: 'broadcast',
        description: 'Project-wide announcements',
      })
      .select('id')
      .single()

    // Race: another request created it
    if (!newChannel) {
      const { data: fallback } = await service
        .from('channels')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', 'general')
        .eq('kind', 'broadcast')
        .single()
      if (fallback) {
        generalChannelId = fallback.id
      } else {
        throw new Error(`Failed to create #general channel: ${error?.message}`)
      }
    } else {
      generalChannelId = newChannel.id
    }
  }

  // 3. Add user to #general (idempotent via unique constraint)
  await service
    .from('channel_members')
    .upsert(
      { channel_id: generalChannelId, member_id: userMemberId, role: 'owner' },
      { onConflict: 'channel_id,member_id', ignoreDuplicates: true }
    )

  // 4. Backfill: agent_instances without corresponding members
  const { data: instances } = await service
    .from('agent_instances')
    .select('id, display_name, agents!inner(name)')
    .eq('user_id', userId)
    .not('status', 'in', '("destroyed","destroying")')

  if (instances && instances.length > 0) {
    // Get existing members for this project that have instance_ids
    const { data: existingMembers } = await service
      .from('members')
      .select('instance_id')
      .eq('project_id', projectId)
      .not('instance_id', 'is', null)

    const existingInstanceIds = new Set(
      (existingMembers ?? []).map(m => m.instance_id)
    )

    // Create members for instances that don't have one yet
    for (const inst of instances) {
      if (existingInstanceIds.has(inst.id)) continue

      const agentName = inst.display_name ?? (inst.agents as any)?.name ?? 'Agent'
      try {
        const { memberId } = await createAgentMember(projectId, inst.id, agentName)
        await createDMChannel(projectId, userMemberId, memberId, agentName)
        await joinBroadcastChannels(projectId, memberId)
      } catch (e) {
        // Best effort — will retry on next page load
        console.error(`[bootstrap] failed to backfill agent ${inst.id}:`, e)
      }
    }
  }

  return { userMemberId }
}
