import { db } from './client'

// ─── Reads ───────────────────────────────────────────────────────────

/** List all members of a team. */
export async function list(teamId: string) {
  const { data } = await db()
    .from('team_members')
    .select('team_id, member_id, role')
    .eq('team_id', teamId)
  return data ?? []
}

/** List team members excluding a specific member (e.g. the creator). */
export async function listExcluding(teamId: string, excludeMemberId: string) {
  const { data } = await db()
    .from('team_members')
    .select('member_id')
    .eq('team_id', teamId)
    .neq('member_id', excludeMemberId)
  return data ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────

/** Add a member to a team (idempotent via upsert). */
export async function add(teamId: string, memberId: string, role: string = 'worker') {
  await db()
    .from('team_members')
    .upsert(
      { team_id: teamId, member_id: memberId, role },
      { onConflict: 'team_id,member_id', ignoreDuplicates: true },
    )
}

/** Bulk add members to a team (idempotent). */
export async function addBulk(teamId: string, members: { memberId: string; role?: string }[]) {
  if (members.length === 0) return
  const rows = members.map(m => ({
    team_id: teamId,
    member_id: m.memberId,
    role: m.role ?? 'worker',
  }))
  await db()
    .from('team_members')
    .upsert(rows, { onConflict: 'team_id,member_id', ignoreDuplicates: true })
}

/** Remove a member from a team. */
export async function remove(teamId: string, memberId: string) {
  await db()
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('member_id', memberId)
}
