import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateInstanceOpts {
  displayName: string
  teamId?: string
}

// ─── Agent Definitions (the catalog) ─────────────────────────────────

/** Find an agent definition by slug. */
export async function findDef(slug: string) {
  const { data } = await db()
    .from('agents')
    .select('id, name, slug, tagline, description, category, icon_url, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return data
}

/** Create an agent definition (race-safe). Returns the agent ID. */
export async function createDef(opts: {
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  iconUrl?: string
  creatorId: string
}): Promise<string> {
  const existing = await findDef(opts.slug)
  if (existing) return existing.id

  const { data, error } = await db()
    .from('agents')
    .insert({
      slug: opts.slug,
      name: opts.name,
      tagline: opts.tagline,
      description: opts.description,
      category: opts.category,
      icon_url: opts.iconUrl ?? null,
      github_repo_url: '',
      status: 'published',
      pricing_model: 'free',
      creator_id: opts.creatorId,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error?.code === '23505') {
    const raced = await findDef(opts.slug)
    if (raced) return raced.id
  }

  if (!data) throw new Error(`Failed to create agent def: ${error?.message}`)
  return data.id
}

// ─── Agent Instances (the runtime) ──────────────────────────────────

/** Find an agent instance by ID. */
export async function getInstance(instanceId: string) {
  const { data } = await db()
    .from('agent_instances')
    .select('id, user_id, agent_id, display_name, fly_app_name, fly_machine_id, gateway_token, status, team_id, created_at')
    .eq('id', instanceId)
    .maybeSingle()
  return data
}

/** Get connection info (fly_app_name + gateway_token) for a running instance. */
export async function getConnectionInfo(instanceId: string) {
  const { data } = await db()
    .from('agent_instances')
    .select('fly_app_name, gateway_token, status')
    .eq('id', instanceId)
    .single()

  if (!data) throw new Error(`Instance ${instanceId} not found`)
  if (data.status !== 'running') throw new Error(`Agent is ${data.status}, not running`)
  if (!data.fly_app_name || !data.gateway_token) throw new Error('Agent not provisioned')

  return { flyAppName: data.fly_app_name, gatewayToken: data.gateway_token }
}

/**
 * Create an agent instance (status=provisioning). Race-safe.
 * Cleans up destroyed instances first.
 * Returns the instance ID.
 */
export async function createInstance(
  userId: string,
  agentId: string,
  opts: CreateInstanceOpts
): Promise<string> {
  // Check if already exists (non-destroyed)
  let q = db()
    .from('agent_instances')
    .select('id, status')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .not('status', 'in', '("destroyed","destroying")')
    .limit(1)

  if (opts.teamId) {
    q = q.eq('team_id', opts.teamId)
  }

  const { data: existing } = await q.maybeSingle()
  if (existing) return existing.id

  // Clean up destroyed instances
  let cleanup = db()
    .from('agent_instances')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .in('status', ['destroyed', 'destroying'])

  if (opts.teamId) {
    cleanup = cleanup.eq('team_id', opts.teamId)
  }

  await cleanup

  // Create new instance
  const { data, error } = await db()
    .from('agent_instances')
    .insert({
      user_id: userId,
      agent_id: agentId,
      display_name: opts.displayName,
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
      team_id: opts.teamId ?? null,
    })
    .select('id')
    .single()

  // Race: another request created it
  if (error?.code === '23505') {
    const { data: raced } = await db()
      .from('agent_instances')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .not('status', 'in', '("destroyed","destroying")')
      .limit(1)
      .single()
    if (raced) return raced.id
  }

  if (!data) throw new Error(`Failed to create instance: ${error?.message}`)
  return data.id
}

/** Update an agent instance. */
export async function updateInstance(instanceId: string, updates: Record<string, unknown>) {
  await db()
    .from('agent_instances')
    .update(updates)
    .eq('id', instanceId)
}

/** List instances for a user (excluding destroyed). */
export async function listInstances(userId: string) {
  const { data } = await db()
    .from('agent_instances')
    .select('id, display_name, status, fly_app_name, gateway_token, agent_id, team_id, agents!inner(name, slug, icon_url)')
    .eq('user_id', userId)
    .not('status', 'in', '("destroyed","destroying")')

  return data ?? []
}

/** Count active (non-destroyed) instances for a user. */
export async function countInstances(userId: string) {
  const { count } = await db()
    .from('agent_instances')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('status', 'in', '("destroyed","destroying")')
  return count ?? 0
}

/**
 * Find a running agent in a channel (for streaming).
 * Resolution priority: instanceId hint → task assignee → channel members (prefer running).
 */
export async function resolveAgentForChannel(
  channelId: string,
  userMemberId: string,
  opts?: { instanceId?: string; taskId?: string }
): Promise<{ memberId: string; instanceId: string; displayName: string } | null> {
  // 1. instanceId hint — direct lookup
  if (opts?.instanceId) {
    const { data: member } = await db()
      .from('members')
      .select('id, instance_id, display_name')
      .eq('instance_id', opts.instanceId)
      .neq('status', 'archived')
      .limit(1)
      .maybeSingle()

    if (member?.instance_id) {
      return { memberId: member.id, instanceId: member.instance_id, displayName: member.display_name ?? 'Agent' }
    }
  }

  // 2. Task assignee
  if (opts?.taskId) {
    const { data: task } = await db()
      .from('tasks')
      .select('assigned_to, assignee:members!tasks_assigned_to_fkey(id, instance_id, display_name)')
      .eq('id', opts.taskId)
      .single()

    if (task?.assigned_to) {
      const assignee = (task as any).assignee as { id: string; instance_id: string | null; display_name: string } | null
      if (assignee?.instance_id) {
        return { memberId: assignee.id, instanceId: assignee.instance_id, displayName: assignee.display_name ?? 'Agent' }
      }
    }
  }

  // 3. Channel members — prefer running instances
  const { data: channelMembers } = await db()
    .from('channel_members')
    .select('member_id, members!inner(id, instance_id, display_name)')
    .eq('channel_id', channelId)
    .neq('member_id', userMemberId)

  const agentMembers = (channelMembers ?? []).filter((cm: any) => cm.members?.instance_id != null)
  if (agentMembers.length === 0) return null

  // Check which instances are running
  const instanceIds = agentMembers.map((cm: any) => cm.members.instance_id as string)
  const { data: instances } = await db()
    .from('agent_instances')
    .select('id, status')
    .in('id', instanceIds)

  const runningIds = new Set(instances?.filter(i => i.status === 'running').map(i => i.id))

  // Pick running first, fall back to any
  const runningMatch = agentMembers.find((cm: any) => runningIds.has(cm.members.instance_id))
  const match = runningMatch ?? agentMembers[0]
  const m = (match as any).members

  return { memberId: m.id, instanceId: m.instance_id, displayName: m.display_name ?? 'Agent' }
}
