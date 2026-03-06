import { getSupabase } from './supabase.js'

type AgentStatus = 'active' | 'idle' | 'working' | 'offline' | 'archived'

/**
 * Update a member's status.
 *
 * Called by the routing layer to reflect agent lifecycle:
 *   idle → working (dispatch started)
 *   working → idle (response received or error)
 *
 * This is pipeline step 7: TRACK.
 * The UI reads member status via Supabase Realtime to show
 * live working/idle indicators next to agent avatars.
 */
export async function setMemberStatus(
  memberId: string,
  status: AgentStatus,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('members')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', memberId)

  if (error) {
    // Non-fatal: status is cosmetic. Log and move on.
    console.warn(`[tracking] Failed to set ${memberId} → ${status}: ${error.message}`)
  }
}

/**
 * Check if a member is currently working.
 * Used by the cooldown guard to avoid double-dispatching.
 */
export async function isMemberWorking(memberId: string): Promise<boolean> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('members')
    .select('status')
    .eq('id', memberId)
    .single()

  if (error || !data) return false
  return data.status === 'working'
}
