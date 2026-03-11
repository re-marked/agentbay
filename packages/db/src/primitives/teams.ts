import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateTeamOpts {
  name: string
  description?: string | null
  leaderMemberId: string
}

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a team by ID. */
export async function findById(teamId: string) {
  const { data } = await db()
    .from('teams')
    .select('id, project_id, name, description, leader_member_id, status, created_at')
    .eq('id', teamId)
    .maybeSingle()
  return data
}

/** Find active team by ID in a project (non-archived). */
export async function findActive(teamId: string, projectId: string) {
  const { data } = await db()
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('project_id', projectId)
    .neq('status', 'archived')
    .maybeSingle()
  return data
}

/** List active teams in a project (non-archived). */
export async function listActive(projectId: string) {
  const { data } = await db()
    .from('teams')
    .select('id, name, description')
    .eq('project_id', projectId)
    .neq('status', 'archived')
    .order('name', { ascending: true })
  return data ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Create a team. Returns the team ID.
 */
export async function create(projectId: string, opts: CreateTeamOpts): Promise<string> {
  const { data, error } = await db()
    .from('teams')
    .insert({
      project_id: projectId,
      name: opts.name,
      description: opts.description ?? null,
      leader_member_id: opts.leaderMemberId,
      status: 'active',
    })
    .select('id')
    .single()

  if (!data) throw new Error(`Failed to create team: ${error?.message}`)
  return data.id
}

/** Update a team. */
export async function update(teamId: string, updates: Record<string, unknown>) {
  await db()
    .from('teams')
    .update(updates)
    .eq('id', teamId)
}

/** Archive a team (set status to 'archived'). */
export async function archive(teamId: string) {
  await db()
    .from('teams')
    .update({ status: 'archived' })
    .eq('id', teamId)
}
