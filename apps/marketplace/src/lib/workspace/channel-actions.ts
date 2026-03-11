'use server'

import { revalidatePath } from 'next/cache'
import { Channels, Teams, TeamMembers } from '@agentbay/db/primitives'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'

/**
 * Archive a channel (broadcast or team).
 */
export async function archiveChannel(channelId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const channel = await Channels.findById(channelId)
  if (!channel) throw new Error('Channel not found')

  await Channels.archive(channelId)

  revalidatePath('/workspace', 'layout')
}

/**
 * Create a channel inside a team.
 */
export async function createTeamChannel(teamId: string, name: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const { activeProjectId, userMemberId } = await getActiveProjectId(user.id)
  if (!activeProjectId || !userMemberId) throw new Error('No active project')

  // Verify team exists and is active
  const team = await Teams.findActive(teamId, activeProjectId)
  if (!team) throw new Error('Team not found')

  const channelName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  // Create the team channel
  const channelId = await Channels.create(activeProjectId, {
    name: channelName,
    kind: 'team',
    teamId,
  })

  // Add the creator
  await Channels.addMember(channelId, userMemberId, 'owner')

  // Add all team members to the new channel
  const teamMembers = await TeamMembers.listExcluding(teamId, userMemberId)

  if (teamMembers.length > 0) {
    await Channels.addMembers(
      channelId,
      teamMembers.map(m => ({ memberId: m.member_id, role: 'participant' })),
    )
  }

  revalidatePath('/workspace', 'layout')
  return { channelId }
}
