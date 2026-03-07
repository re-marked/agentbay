import { createServiceClient } from '@agentbay/db/server'

/**
 * Create a workspace member for an agent instance.
 * Protected by unique index (project_id, instance_id) — safe to call multiple times.
 */
export async function createAgentMember(
  projectId: string,
  instanceId: string,
  displayName: string,
  rank: string = 'worker',
  spawnedBy?: string
): Promise<{ memberId: string }> {
  const service = createServiceClient()

  // Check if member already exists for this instance
  const { data: existing } = await service
    .from('members')
    .select('id')
    .eq('project_id', projectId)
    .eq('instance_id', instanceId)
    .maybeSingle()

  if (existing) return { memberId: existing.id }

  const { data: member, error } = await service
    .from('members')
    .insert({
      project_id: projectId,
      instance_id: instanceId,
      display_name: displayName,
      rank,
      status: 'active',
      spawned_by: spawnedBy ?? null,
    })
    .select('id')
    .single()

  // Race condition: another request created it between our check and insert
  if (error?.code === '23505') {
    const { data: raced } = await service
      .from('members')
      .select('id')
      .eq('project_id', projectId)
      .eq('instance_id', instanceId)
      .single()
    if (raced) return { memberId: raced.id }
  }

  if (!member) throw new Error(`Failed to create agent member: ${error?.message}`)
  return { memberId: member.id }
}

/**
 * Create a DM channel between two members.
 * Idempotent — returns existing channel if one already exists.
 */
export async function createDMChannel(
  projectId: string,
  userMemberId: string,
  agentMemberId: string,
  agentName: string
): Promise<{ channelId: string }> {
  const service = createServiceClient()

  // Check if a DM channel already exists between these two members
  const { data: agentMemberships } = await service
    .from('channel_members')
    .select('channel_id')
    .eq('member_id', agentMemberId)

  if (agentMemberships && agentMemberships.length > 0) {
    const channelIds = agentMemberships.map(cm => cm.channel_id)

    // Find a direct channel in this project that contains both members
    const { data: existing } = await service
      .from('channels')
      .select('id')
      .eq('project_id', projectId)
      .eq('kind', 'direct')
      .eq('archived', false)
      .in('id', channelIds)
      .limit(1)
      .maybeSingle()

    if (existing) return { channelId: existing.id }
  }

  // Create new DM channel
  const { data: channel, error } = await service
    .from('channels')
    .insert({
      project_id: projectId,
      name: agentName,
      kind: 'direct',
    })
    .select('id')
    .single()

  if (!channel) throw new Error(`Failed to create DM channel: ${error?.message}`)

  // Add both members
  await service.from('channel_members').insert([
    { channel_id: channel.id, member_id: userMemberId, role: 'owner' },
    { channel_id: channel.id, member_id: agentMemberId, role: 'participant' },
  ])

  return { channelId: channel.id }
}

/**
 * Add an agent member to all broadcast channels (#general, etc.) in the project.
 */
export async function joinBroadcastChannels(
  projectId: string,
  agentMemberId: string
): Promise<void> {
  const service = createServiceClient()

  const { data: broadcastChannels } = await service
    .from('channels')
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', 'broadcast')
    .eq('archived', false)

  if (!broadcastChannels || broadcastChannels.length === 0) return

  const rows = broadcastChannels.map(c => ({
    channel_id: c.id,
    member_id: agentMemberId,
    role: 'participant' as const,
  }))

  // upsert with ignoreDuplicates handles the case where agent is already a member
  await service
    .from('channel_members')
    .upsert(rows, { onConflict: 'channel_id,member_id', ignoreDuplicates: true })
}

/**
 * Archive an agent member — sets status to archived, archives DM channels,
 * removes from broadcast/team channels.
 * Rejects if the member is the master (co-founder) or owner.
 */
export async function archiveAgentMember(
  memberId: string
): Promise<{ error?: string }> {
  const service = createServiceClient()

  // Check rank
  const { data: member } = await service
    .from('members')
    .select('id, rank, status')
    .eq('id', memberId)
    .single()

  if (!member) return {}  // No member found — nothing to archive
  if (member.status === 'archived') return {}  // Already archived
  if (member.rank === 'master') return { error: 'Cannot remove your co-founder' }
  if (member.rank === 'owner') return { error: 'Cannot remove the workspace owner' }

  // Archive the member
  await service
    .from('members')
    .update({ status: 'archived' })
    .eq('id', memberId)

  // Get all channel memberships for this member
  const { data: memberships } = await service
    .from('channel_members')
    .select('id, channel_id, channels!inner(kind)')
    .eq('member_id', memberId)

  if (!memberships || memberships.length === 0) return {}

  // Archive DM channels (keep the channel for history, mark as archived)
  const dmChannelIds = memberships
    .filter((m: any) => m.channels?.kind === 'direct')
    .map((m: any) => m.channel_id)

  if (dmChannelIds.length > 0) {
    await service
      .from('channels')
      .update({ archived: true })
      .in('id', dmChannelIds)
  }

  // Remove from non-DM channels (broadcast, team)
  const nonDmMembershipIds = memberships
    .filter((m: any) => m.channels?.kind !== 'direct')
    .map((m: any) => m.id)

  if (nonDmMembershipIds.length > 0) {
    await service
      .from('channel_members')
      .delete()
      .in('id', nonDmMembershipIds)
  }

  return {}
}

/**
 * Archive an agent member by their agent_instances ID.
 * Convenience wrapper for removeAgent() which has instanceId, not memberId.
 */
export async function archiveAgentMemberByInstanceId(
  instanceId: string
): Promise<{ error?: string }> {
  const service = createServiceClient()

  const { data: member } = await service
    .from('members')
    .select('id')
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .maybeSingle()

  if (!member) return {}  // No workspace member — legacy instance, nothing to archive
  return archiveAgentMember(member.id)
}
