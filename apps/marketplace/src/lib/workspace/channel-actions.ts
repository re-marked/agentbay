'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'

/**
 * Archive a channel (broadcast or team).
 */
export async function archiveChannel(channelId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const service = createServiceClient()

  const { data: channel } = await service
    .from('channels')
    .select('id')
    .eq('id', channelId)
    .single()

  if (!channel) throw new Error('Channel not found')

  await service
    .from('channels')
    .update({ archived: true })
    .eq('id', channelId)

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

  const { data: channel, error } = await service
    .from('channels')
    .insert({
      project_id: activeProjectId,
      team_id: teamId,
      name: channelName,
      kind: 'team',
    })
    .select('id')
    .single()

  if (!channel) throw new Error(`Failed to create channel: ${error?.message}`)

  // Add the creator
  await service.from('channel_members').insert({
    channel_id: channel.id,
    member_id: userMemberId,
    role: 'owner',
  })

  // Add all team members to the new channel
  const { data: teamMembers } = await service
    .from('team_members')
    .select('member_id')
    .eq('team_id', teamId)
    .neq('member_id', userMemberId)

  if (teamMembers && teamMembers.length > 0) {
    await service.from('channel_members').upsert(
      teamMembers.map(m => ({
        channel_id: channel.id,
        member_id: m.member_id,
        role: 'participant' as const,
      })),
      { onConflict: 'channel_id,member_id', ignoreDuplicates: true },
    )
  }

  revalidatePath('/workspace', 'layout')
  return { channelId: channel.id }
}
