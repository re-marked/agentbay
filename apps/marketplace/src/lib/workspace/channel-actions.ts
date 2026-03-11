'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { Channels } from '@agentbay/db/primitives'
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

  const service = createServiceClient()

  // Verify team exists and is active
  const { data: team } = await service
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('project_id', activeProjectId)
    .neq('status', 'archived')
    .single()

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
  const { data: teamMembers } = await service
    .from('team_members')
    .select('member_id')
    .eq('team_id', teamId)
    .neq('member_id', userMemberId)

  if (teamMembers && teamMembers.length > 0) {
    await Channels.addMembers(
      channelId,
      teamMembers.map(m => ({ memberId: m.member_id, role: 'participant' })),
    )
  }

  revalidatePath('/workspace', 'layout')
  return { channelId }
}
