import { getSupabase } from './supabase.js'

export interface ChannelAgentMember {
  memberId: string
  displayName: string
  instanceId: string
}

export interface MentionMatch {
  memberId: string
  displayName: string
  /** The text directed at this agent (everything after @name until next @name or end). */
  message: string
}

/**
 * Get all agent members in a channel.
 * Agents have user_id IS NULL and instance_id IS NOT NULL.
 */
export async function getChannelAgentMembers(channelId: string): Promise<ChannelAgentMember[]> {
  const sb = getSupabase()

  // Two-step query: get member IDs from channel_members, then fetch member details
  const { data: cmRows, error: cmError } = await sb
    .from('channel_members')
    .select('member_id')
    .eq('channel_id', channelId)

  if (cmError || !cmRows || cmRows.length === 0) return []

  const memberIds = cmRows.map((r) => r.member_id)

  const { data: members, error: mError } = await sb
    .from('members')
    .select('id, display_name, instance_id, user_id')
    .in('id', memberIds)
    .is('user_id', null)
    .not('instance_id', 'is', null)

  if (mError || !members) return []

  return members.map((m) => ({
    memberId: m.id,
    displayName: m.display_name,
    instanceId: m.instance_id!,
  }))
}

/**
 * Extract @mentions from message content, resolved against channel members.
 *
 * Ported from SSE Gateway's extractMentions (index.ts:239-258) but:
 * - Case-insensitive matching
 * - Returns member UUIDs instead of string names
 * - Resolves against real DB members, not a hardcoded map
 */
export function extractMentions(
  text: string,
  agentMembers: ChannelAgentMember[],
): MentionMatch[] {
  if (agentMembers.length === 0 || !text) return []

  const nameToMember = new Map(
    agentMembers.map((m) => [m.displayName.toLowerCase(), m]),
  )

  // Sort by name length descending so "Personal AI" matches before "Personal"
  const sorted = [...agentMembers].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )
  const escaped = sorted.map((m) =>
    m.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  // Use lookahead for boundary: match must be followed by whitespace, punctuation, or end-of-string
  // This handles multi-word names like "Personal AI" that \b would break on
  const re = new RegExp(`@(${escaped.join('|')})(?=[\\s,.:!?;]|$)`, 'gi')

  const matches = [...text.matchAll(re)]
  if (matches.length === 0) return []

  const mentions: MentionMatch[] = []

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const name = match[1].toLowerCase()
    const member = nameToMember.get(name)
    if (!member) continue

    const start = match.index! + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length
    const message = text.slice(start, end).trim()

    // Only route if there's actual content after the @mention
    if (message) {
      mentions.push({
        memberId: member.memberId,
        displayName: member.displayName,
        message,
      })
    }
  }

  return mentions
}
