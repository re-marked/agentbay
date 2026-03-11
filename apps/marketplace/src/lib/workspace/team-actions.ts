'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'

/**
 * Create a team in the active project.
 * Auto-creates a #team-{name} channel and adds the creator + all project agents.
 */
export async function createTeam(formData: FormData) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const name = (formData.get('name') as string)?.trim()
  if (!name) throw new Error('Team name is required')
  const description = (formData.get('description') as string)?.trim() || null

  const { activeProjectId, userMemberId } = await getActiveProjectId(user.id)
  if (!activeProjectId || !userMemberId) throw new Error('No active project')

  const service = createServiceClient()

  // Create the team with the user as leader
  const { data: team, error: teamError } = await service
    .from('teams')
    .insert({
      project_id: activeProjectId,
      name,
      description,
      leader_member_id: userMemberId,
      status: 'active',
    })
    .select('id')
    .single()

  if (!team) throw new Error(`Failed to create team: ${teamError?.message}`)

  // Auto-create the team channel
  const channelName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const { data: channel, error: channelError } = await service
    .from('channels')
    .insert({
      project_id: activeProjectId,
      team_id: team.id,
      name: channelName,
      kind: 'team',
      description: `Team channel for ${name}`,
    })
    .select('id')
    .single()

  if (!channel) throw new Error(`Failed to create team channel: ${channelError?.message}`)

  // Add creator as team member (leader)
  await service.from('team_members').insert({
    team_id: team.id,
    member_id: userMemberId,
    role: 'leader',
  })

  // Add creator to the channel
  await service.from('channel_members').insert({
    channel_id: channel.id,
    member_id: userMemberId,
    role: 'owner',
  })

  // Add all active agent members in the project to the team channel
  const { data: agentMembers } = await service
    .from('members')
    .select('id')
    .eq('project_id', activeProjectId)
    .not('instance_id', 'is', null)
    .neq('status', 'archived')

  if (agentMembers && agentMembers.length > 0) {
    const channelRows = agentMembers.map(m => ({
      channel_id: channel.id,
      member_id: m.id,
      role: 'participant' as const,
    }))

    const teamRows = agentMembers.map(m => ({
      team_id: team.id,
      member_id: m.id,
      role: 'worker' as const,
    }))

    await Promise.all([
      service.from('channel_members').upsert(channelRows, {
        onConflict: 'channel_id,member_id',
        ignoreDuplicates: true,
      }),
      service.from('team_members').upsert(teamRows, {
        onConflict: 'team_id,member_id',
        ignoreDuplicates: true,
      }),
    ])
  }

  revalidatePath('/workspace', 'layout')
  return { teamId: team.id, channelId: channel.id }
}

/**
 * Archive a team — archives the team and its channels.
 */
export async function archiveTeam(teamId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const service = createServiceClient()

  // Verify ownership
  const { data: team } = await service
    .from('teams')
    .select('id, project_id')
    .eq('id', teamId)
    .single()

  if (!team) throw new Error('Team not found')

  // Archive the team
  await service
    .from('teams')
    .update({ status: 'archived' })
    .eq('id', teamId)

  // Archive team channels
  await service
    .from('channels')
    .update({ archived: true })
    .eq('team_id', teamId)

  revalidatePath('/workspace', 'layout')
}

/**
 * Add an agent (by instance ID) to a team.
 * Adds to both team_members and all team channels.
 */
export async function addAgentToTeam(teamId: string, instanceId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const service = createServiceClient()

  // Resolve agent's member row
  const { data: member } = await service
    .from('members')
    .select('id')
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  if (!member) throw new Error('Agent not found')

  // Add to team_members
  await service
    .from('team_members')
    .upsert(
      { team_id: teamId, member_id: member.id, role: 'worker' },
      { onConflict: 'team_id,member_id', ignoreDuplicates: true },
    )

  // Add to all team channels
  const { data: teamChannels } = await service
    .from('channels')
    .select('id')
    .eq('team_id', teamId)
    .eq('kind', 'team')
    .eq('archived', false)

  if (teamChannels && teamChannels.length > 0) {
    const rows = teamChannels.map(c => ({
      channel_id: c.id,
      member_id: member.id,
      role: 'participant' as const,
    }))
    await service
      .from('channel_members')
      .upsert(rows, { onConflict: 'channel_id,member_id', ignoreDuplicates: true })
  }

  revalidatePath('/workspace', 'layout')
}
