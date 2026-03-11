import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateChannelOpts {
  name: string
  kind: 'broadcast' | 'team' | 'direct' | 'system'
  teamId?: string
  description?: string
}

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a channel by primary key. */
export async function findById(channelId: string) {
  const { data } = await db()
    .from('channels')
    .select('id, project_id, name, kind, team_id, description, archived, pinned, created_at')
    .eq('id', channelId)
    .maybeSingle()
  return data
}

/** Find broadcast channels in a project by name. */
export async function findBroadcast(projectId: string, name?: string) {
  let q = db()
    .from('channels')
    .select('id, name, description')
    .eq('project_id', projectId)
    .eq('kind', 'broadcast')
    .eq('archived', false)

  if (name) q = q.eq('name', name)

  const { data } = await q.order('created_at', { ascending: true })
  return data ?? []
}

/** Find a DM channel between two members in a project. */
export async function findDM(projectId: string, memberA: string, memberB: string) {
  // Find channels where memberA is a participant
  const { data: aMemberships } = await db()
    .from('channel_members')
    .select('channel_id')
    .eq('member_id', memberA)

  if (!aMemberships || aMemberships.length === 0) return null

  const channelIds = aMemberships.map(m => m.channel_id)

  // Find a direct channel in this project that's in memberA's channels
  const { data: dmChannel } = await db()
    .from('channels')
    .select('id')
    .eq('project_id', projectId)
    .eq('kind', 'direct')
    .eq('archived', false)
    .in('id', channelIds)
    .limit(1)
    .maybeSingle()

  if (!dmChannel) return null

  // Verify memberB is also in this channel
  const { data: bMembership } = await db()
    .from('channel_members')
    .select('id')
    .eq('channel_id', dmChannel.id)
    .eq('member_id', memberB)
    .maybeSingle()

  return bMembership ? dmChannel.id : null
}

/** Find channels belonging to a team. */
export async function findByTeam(teamId: string, kind?: string) {
  let q = db()
    .from('channels')
    .select('id, name, kind, description')
    .eq('team_id', teamId)
    .eq('archived', false)

  if (kind) q = q.eq('kind', kind)

  const { data } = await q
  return data ?? []
}

/** List all active broadcast channels in a project. */
export async function listBroadcasts(projectId: string) {
  const { data } = await db()
    .from('channels')
    .select('id, name, description')
    .eq('project_id', projectId)
    .eq('kind', 'broadcast')
    .eq('archived', false)
    .order('name', { ascending: true })
  return data ?? []
}

/** List all active team channels in a project (with team_id). */
export async function listTeamChannels(projectId: string) {
  const { data } = await db()
    .from('channels')
    .select('id, name, description, team_id')
    .eq('project_id', projectId)
    .eq('kind', 'team')
    .eq('archived', false)
    .order('name', { ascending: true })
  return data ?? []
}

/** Count broadcast channels in a project by names. */
export async function countBroadcast(projectId: string, names: string[]) {
  const { count } = await db()
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('kind', 'broadcast')
    .in('name', names)
  return count ?? 0
}

// ─── Channel Membership ─────────────────────────────────────────────

/** Check if a member is in a channel. */
export async function isMember(channelId: string, memberId: string) {
  const { data } = await db()
    .from('channel_members')
    .select('id')
    .eq('channel_id', channelId)
    .eq('member_id', memberId)
    .limit(1)
    .maybeSingle()
  return !!data
}

/** Get all members of a channel (with member details). */
export async function getMembers(channelId: string) {
  const { data } = await db()
    .from('channel_members')
    .select('member_id, role, members!inner(id, display_name, instance_id, rank, status)')
    .eq('channel_id', channelId)
  return data ?? []
}

/** Get agent members in a channel (members with instance_id, excluding a specific member). */
export async function getAgentMembers(channelId: string, excludeMemberId?: string) {
  let q = db()
    .from('channel_members')
    .select('member_id, members!inner(id, instance_id, display_name)')
    .eq('channel_id', channelId)

  if (excludeMemberId) {
    q = q.neq('member_id', excludeMemberId)
  }

  const { data } = await q
  // Filter to only agent members (those with instance_id)
  return (data ?? []).filter((cm: any) => cm.members?.instance_id != null)
}

/** Get all channels a member belongs to (with channel details). */
export async function getMemberChannels(memberId: string) {
  const { data } = await db()
    .from('channel_members')
    .select('channel_id, role, channels!inner(id, name, kind, team_id, archived)')
    .eq('member_id', memberId)
  return data ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Create a channel. Race-safe for broadcast channels (checks existence first).
 * Returns the channel ID.
 */
export async function create(projectId: string, opts: CreateChannelOpts): Promise<string> {
  // For broadcast channels, check if one with this name already exists
  if (opts.kind === 'broadcast') {
    const existing = await findBroadcast(projectId, opts.name)
    if (existing.length > 0) return existing[0].id
  }

  const { data, error } = await db()
    .from('channels')
    .insert({
      project_id: projectId,
      name: opts.name,
      kind: opts.kind,
      team_id: opts.teamId ?? null,
      description: opts.description ?? null,
    })
    .select('id')
    .single()

  // Race: broadcast channel created by another request
  if (error && opts.kind === 'broadcast') {
    const fallback = await findBroadcast(projectId, opts.name)
    if (fallback.length > 0) return fallback[0].id
  }

  if (!data) throw new Error(`Failed to create channel: ${error?.message}`)

  // Clean up duplicate broadcast channels
  if (opts.kind === 'broadcast') {
    await db()
      .from('channels')
      .delete()
      .eq('project_id', projectId)
      .eq('name', opts.name)
      .eq('kind', 'broadcast')
      .neq('id', data.id)
  }

  return data.id
}

/** Archive a channel. */
export async function archive(channelId: string) {
  await db()
    .from('channels')
    .update({ archived: true })
    .eq('id', channelId)
}

/** Archive all channels belonging to a team. */
export async function archiveByTeam(teamId: string) {
  await db()
    .from('channels')
    .update({ archived: true })
    .eq('team_id', teamId)
}

/** Add a member to a channel (idempotent via upsert). */
export async function addMember(channelId: string, memberId: string, role: string = 'participant') {
  await db()
    .from('channel_members')
    .upsert(
      { channel_id: channelId, member_id: memberId, role },
      { onConflict: 'channel_id,member_id', ignoreDuplicates: true }
    )
}

/** Bulk add members to a channel (idempotent). */
export async function addMembers(channelId: string, members: { memberId: string; role?: string }[]) {
  if (members.length === 0) return
  const rows = members.map(m => ({
    channel_id: channelId,
    member_id: m.memberId,
    role: m.role ?? 'participant',
  }))
  await db()
    .from('channel_members')
    .upsert(rows, { onConflict: 'channel_id,member_id', ignoreDuplicates: true })
}

/** Remove a member from a channel. */
export async function removeMember(channelId: string, memberId: string) {
  await db()
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('member_id', memberId)
}

/**
 * Create a DM channel between two members. Idempotent — returns existing if found.
 * Returns the channel ID.
 */
export async function createDM(
  projectId: string,
  memberA: string,
  memberB: string,
  name: string
): Promise<string> {
  // Check if DM already exists
  const existing = await findDM(projectId, memberA, memberB)
  if (existing) return existing

  // Create new DM channel
  const channelId = await create(projectId, { name, kind: 'direct' })

  // Add both members
  await db().from('channel_members').insert([
    { channel_id: channelId, member_id: memberA, role: 'owner' },
    { channel_id: channelId, member_id: memberB, role: 'participant' },
  ])

  return channelId
}

/**
 * Add a member to all broadcast channels in a project.
 */
export async function joinBroadcasts(projectId: string, memberId: string) {
  const broadcasts = await findBroadcast(projectId)
  if (broadcasts.length === 0) return

  const rows = broadcasts.map(c => ({
    channel_id: c.id,
    member_id: memberId,
    role: 'participant' as const,
  }))

  await db()
    .from('channel_members')
    .upsert(rows, { onConflict: 'channel_id,member_id', ignoreDuplicates: true })
}

/**
 * Add a member to all team channels in a project + team_members table.
 */
export async function joinAllTeams(projectId: string, memberId: string) {
  const { data: teamChannels } = await db()
    .from('channels')
    .select('id, team_id')
    .eq('project_id', projectId)
    .eq('kind', 'team')
    .eq('archived', false)

  if (!teamChannels || teamChannels.length === 0) return

  // Add to channel_members
  const channelRows = teamChannels.map(c => ({
    channel_id: c.id,
    member_id: memberId,
    role: 'participant' as const,
  }))

  await db()
    .from('channel_members')
    .upsert(channelRows, { onConflict: 'channel_id,member_id', ignoreDuplicates: true })

  // Add to team_members
  const teamIds = [...new Set(teamChannels.map(c => c.team_id).filter(Boolean))]
  if (teamIds.length > 0) {
    const teamRows = teamIds.map(teamId => ({
      team_id: teamId!,
      member_id: memberId,
      role: 'worker' as const,
    }))

    await db()
      .from('team_members')
      .upsert(teamRows, { onConflict: 'team_id,member_id', ignoreDuplicates: true })
  }
}
