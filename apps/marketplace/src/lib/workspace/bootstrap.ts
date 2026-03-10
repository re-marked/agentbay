import { createServiceClient } from '@agentbay/db/server'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
  joinTeamChannels,
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

  // Fast path: if user member already exists, check if channels + agents are set up
  // This avoids 10+ queries on every page load after the first bootstrap
  const { data: existingMember } = await service
    .from('members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingMember) {
    // Quick check: do broadcast channels exist? (covers 99% of page loads after first bootstrap)
    const { count: channelCount } = await service
      .from('channels')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('kind', 'broadcast')
      .in('name', ['general', 'tasks'])

    if ((channelCount ?? 0) >= 2) {
      return { userMemberId: existingMember.id }
    }
  }

  // Slow path: full bootstrap
  let userMemberId: string

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

  // 2. Create or find broadcast channels (#general, #tasks)
  const broadcastChannels = [
    { name: 'general', description: 'Project-wide announcements' },
    { name: 'tasks', description: 'Task assignments and progress updates' },
  ]

  for (const ch of broadcastChannels) {
    const { data: existing } = await service
      .from('channels')
      .select('id')
      .eq('project_id', projectId)
      .eq('name', ch.name)
      .eq('kind', 'broadcast')
      .maybeSingle()

    let channelId: string
    if (existing) {
      channelId = existing.id
    } else {
      // Use upsert-like pattern: insert only if not exists (race-safe)
      // First try insert, if unique violation or race, re-fetch
      const { data: newChannel, error } = await service
        .from('channels')
        .insert({
          project_id: projectId,
          name: ch.name,
          kind: 'broadcast',
          description: ch.description,
        })
        .select('id')
        .single()

      if (!newChannel || error) {
        // Race: another request created it — fetch the winner
        const { data: fallback } = await service
          .from('channels')
          .select('id')
          .eq('project_id', projectId)
          .eq('name', ch.name)
          .eq('kind', 'broadcast')
          .eq('archived', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()
        if (fallback) {
          channelId = fallback.id
        } else {
          throw new Error(`Failed to create #${ch.name} channel: ${error?.message}`)
        }
      } else {
        channelId = newChannel.id

        // Clean up any duplicates that slipped through (race condition)
        await service
          .from('channels')
          .delete()
          .eq('project_id', projectId)
          .eq('name', ch.name)
          .eq('kind', 'broadcast')
          .neq('id', channelId)
      }
    }

    // 3. Add user to channel (idempotent via unique constraint)
    await service
      .from('channel_members')
      .upsert(
        { channel_id: channelId, member_id: userMemberId, role: 'owner' },
        { onConflict: 'channel_id,member_id', ignoreDuplicates: true }
      )
  }

  // 4. Backfill: agent_instances without corresponding members
  const { data: instances } = await service
    .from('agent_instances')
    .select('id, display_name, agents!inner(name, slug)')
    .eq('user_id', userId)
    .not('status', 'in', '("destroyed","destroying")')

  if (instances && instances.length > 0) {
    // Detect co-founder instance for rank assignment
    const { data: corp } = await service
      .from('corporations')
      .select('co_founder_instance_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    const coFounderInstanceId = corp?.co_founder_instance_id ?? null

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
      const rank = inst.id === coFounderInstanceId ? 'master' : 'worker'
      try {
        const { memberId } = await createAgentMember(projectId, inst.id, agentName, rank)
        await createDMChannel(projectId, userMemberId, memberId, agentName)
        await joinBroadcastChannels(projectId, memberId)
        await joinTeamChannels(projectId, memberId)
      } catch (e) {
        // Best effort — will retry on next page load
        console.error(`[bootstrap] failed to backfill agent ${inst.id}:`, e)
      }
    }
  }

  return { userMemberId }
}
