import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateMemberOpts {
  instanceId?: string
  userId?: string
  displayName: string
  rank?: string
  status?: string
  spawnedBy?: string
}

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a member by primary key. */
export async function findById(memberId: string) {
  const { data } = await db()
    .from('members')
    .select('id, project_id, instance_id, user_id, display_name, rank, status, spawned_by, created_at')
    .eq('id', memberId)
    .maybeSingle()
  return data
}

/** Find a member by project + instance_id. */
export async function findByInstance(projectId: string, instanceId: string) {
  const { data } = await db()
    .from('members')
    .select('id, display_name, rank, status, instance_id')
    .eq('project_id', projectId)
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .maybeSingle()
  return data
}

/** Find a member by instance_id only (no project scope). */
export async function findByInstanceId(instanceId: string) {
  const { data } = await db()
    .from('members')
    .select('id, instance_id, display_name, rank, status, project_id')
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()
  return data
}

/** Find a member by project + user_id. */
export async function findByUser(projectId: string, userId: string) {
  const { data } = await db()
    .from('members')
    .select('id, display_name, rank, status')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .neq('status', 'archived')
    .maybeSingle()
  return data
}

/** List all active (non-archived) members in a project. */
export async function listActive(
  projectId: string,
  filters?: { type?: 'agent' | 'user'; excludeRank?: string }
) {
  let q = db()
    .from('members')
    .select('id, display_name, rank, status, instance_id, user_id, spawned_by')
    .eq('project_id', projectId)
    .neq('status', 'archived')

  if (filters?.type === 'agent') {
    q = q.not('instance_id', 'is', null)
  } else if (filters?.type === 'user') {
    q = q.not('user_id', 'is', null)
  }

  if (filters?.excludeRank) {
    q = q.neq('rank', filters.excludeRank)
  }

  const { data } = await q.order('created_at', { ascending: true })
  return data ?? []
}

/** Resolve member → instance_id (for routing to agent). */
export async function resolveInstance(memberId: string) {
  const { data } = await db()
    .from('members')
    .select('instance_id')
    .eq('id', memberId)
    .single()
  return data?.instance_id ?? null
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Create a member in a project. Race-condition safe (unique constraint on project_id+instance_id / project_id+user_id).
 * Returns the member ID (existing or newly created).
 */
export async function create(projectId: string, opts: CreateMemberOpts): Promise<string> {
  // Check if already exists
  if (opts.instanceId) {
    const existing = await findByInstance(projectId, opts.instanceId)
    if (existing) return existing.id
  } else if (opts.userId) {
    const existing = await findByUser(projectId, opts.userId)
    if (existing) return existing.id
  }

  const { data, error } = await db()
    .from('members')
    .insert({
      project_id: projectId,
      instance_id: opts.instanceId ?? null,
      user_id: opts.userId ?? null,
      display_name: opts.displayName,
      rank: opts.rank ?? 'worker',
      status: opts.status ?? 'active',
      spawned_by: opts.spawnedBy ?? null,
    })
    .select('id')
    .single()

  // Race: another request created it between check and insert
  if (error?.code === '23505') {
    if (opts.instanceId) {
      const raced = await findByInstance(projectId, opts.instanceId)
      if (raced) return raced.id
    } else if (opts.userId) {
      const raced = await findByUser(projectId, opts.userId)
      if (raced) return raced.id
    }
  }

  if (!data) throw new Error(`Failed to create member: ${error?.message}`)
  return data.id
}

/** Update a member's status (idle, working, active, archived). */
export async function updateStatus(memberId: string, status: string) {
  await db()
    .from('members')
    .update({ status })
    .eq('id', memberId)
}

/**
 * Archive a member. Rejects if rank is 'master' or 'owner'.
 * Archives DM channels, removes from non-DM channels.
 */
export async function archive(memberId: string): Promise<{ error?: string }> {
  const member = await findById(memberId)
  if (!member) return {}
  if (member.status === 'archived') return {}
  if (member.rank === 'master') return { error: 'Cannot remove your co-founder' }
  if (member.rank === 'owner') return { error: 'Cannot remove the workspace owner' }

  // Archive the member
  await updateStatus(memberId, 'archived')

  // Get all channel memberships
  const { data: memberships } = await db()
    .from('channel_members')
    .select('id, channel_id, channels!inner(kind)')
    .eq('member_id', memberId)

  if (!memberships || memberships.length === 0) return {}

  // Archive DM channels (keep for history)
  const dmChannelIds = memberships
    .filter((m: any) => m.channels?.kind === 'direct')
    .map((m: any) => m.channel_id)

  if (dmChannelIds.length > 0) {
    await db()
      .from('channels')
      .update({ archived: true })
      .in('id', dmChannelIds)
  }

  // Remove from non-DM channels
  const nonDmIds = memberships
    .filter((m: any) => m.channels?.kind !== 'direct')
    .map((m: any) => m.id)

  if (nonDmIds.length > 0) {
    await db()
      .from('channel_members')
      .delete()
      .in('id', nonDmIds)
  }

  return {}
}

/** Archive a member by instance_id (convenience for removeAgent flow). */
export async function archiveByInstanceId(instanceId: string): Promise<{ error?: string }> {
  const member = await findByInstanceId(instanceId)
  if (!member) return {}
  return archive(member.id)
}
