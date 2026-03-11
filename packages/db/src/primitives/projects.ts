import { db } from './client'

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a project by ID. */
export async function findById(projectId: string) {
  const { data } = await db()
    .from('projects')
    .select('id, name, description, user_id, corporation_id, created_at')
    .eq('id', projectId)
    .maybeSingle()
  return data
}

/** List projects for a corporation (ordered by creation date). */
export async function listByCorporation(corporationId: string) {
  const { data } = await db()
    .from('projects')
    .select('id, name, description')
    .eq('corporation_id', corporationId)
    .order('created_at', { ascending: true })
  return data ?? []
}

/** Find orphan projects (no corporation_id) for a user. */
export async function findOrphans(userId: string) {
  const { data } = await db()
    .from('projects')
    .select('id, name, description')
    .eq('user_id', userId)
    .is('corporation_id', null)
  return data ?? []
}

/** Find a project by name for a user. */
export async function findByName(userId: string, name: string) {
  const { data } = await db()
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
  return data
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Create a project. Returns the project ID.
 */
export async function create(opts: {
  name: string
  userId: string
  corporationId?: string
  description?: string
}): Promise<string> {
  const { data, error } = await db()
    .from('projects')
    .insert({
      name: opts.name,
      user_id: opts.userId,
      corporation_id: opts.corporationId ?? null,
      description: opts.description ?? null,
    })
    .select('id')
    .single()

  if (!data) throw new Error(`Failed to create project: ${error?.message}`)
  return data.id
}

/** Update a project. */
export async function update(projectId: string, updates: Record<string, unknown>) {
  await db()
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
}

/** Link orphan projects to a corporation. */
export async function linkToCorporation(projectIds: string[], corporationId: string) {
  if (projectIds.length === 0) return
  await db()
    .from('projects')
    .update({ corporation_id: corporationId })
    .in('id', projectIds)
}

/** Get the first project in a corporation. */
export async function firstInCorporation(corporationId: string, userId: string) {
  const { data } = await db()
    .from('projects')
    .select('id')
    .eq('corporation_id', corporationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}
