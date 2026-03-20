import { db } from './client'

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a corporation by ID. */
export async function findById(corporationId: string) {
  const { data } = await db()
    .from('corporations')
    .select('id, name, description, user_id, co_founder_instance_id, created_at')
    .eq('id', corporationId)
    .maybeSingle()
  return data
}

/** Find all corporations for a user (ordered by creation date). */
export async function findByUser(userId: string) {
  const { data } = await db()
    .from('corporations')
    .select('id, name, co_founder_instance_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return data ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Create a corporation. Race-safe — checks existence first.
 * Returns the corporation ID.
 */
export async function create(userId: string, name: string, description?: string): Promise<string> {
  const existing = await findByUser(userId)
  if (existing.length > 0) return existing[0].id

  const { data, error } = await db()
    .from('corporations')
    .insert({ user_id: userId, name, description: description ?? 'Your personal corporation' })
    .select('id')
    .single()

  // Race: another request created it
  if (error) {
    const fallback = await findByUser(userId)
    if (fallback.length > 0) return fallback[0].id
  }

  if (!data) throw new Error(`Failed to create corporation: ${error?.message}`)
  return data.id
}

/** Update a corporation. */
export async function update(corporationId: string, updates: Record<string, unknown>) {
  await db()
    .from('corporations')
    .update(updates)
    .eq('id', corporationId)
}

/** Link co-founder instance ID to a corporation. */
export async function linkCoFounder(corporationId: string, instanceId: string) {
  await db()
    .from('corporations')
    .update({ co_founder_instance_id: instanceId })
    .eq('id', corporationId)
}

/** Get co-founder instance ID for a user's first corporation. */
export async function getCoFounderInstanceId(userId: string): Promise<string | null> {
  const { data } = await db()
    .from('corporations')
    .select('co_founder_instance_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return data?.co_founder_instance_id ?? null
}
