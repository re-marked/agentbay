'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { Members, Channels } from '@agentbay/db/primitives'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'
import { hireTeamLeader } from './team-leader'

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
  const channelId = await Channels.create(activeProjectId, {
    name: channelName,
    kind: 'team',
    teamId: team.id,
    description: `Team channel for ${name}`,
  })

  // Add creator as team member (leader)
  await service.from('team_members').insert({
    team_id: team.id,
    member_id: userMemberId,
    role: 'leader',
  })

  // Add creator to the channel
  await Channels.addMember(channelId, userMemberId, 'owner')

  // Add all active agent members in the project to the team channel (except co-founder)
  const agentMembers = await Members.listActive(activeProjectId, {
    type: 'agent',
    excludeRank: 'master',
  })

  if (agentMembers.length > 0) {
    const channelMembers = agentMembers.map(m => ({
      memberId: m.id,
      role: 'participant' as const,
    }))

    const teamRows = agentMembers.map(m => ({
      team_id: team.id,
      member_id: m.id,
      role: 'worker' as const,
    }))

    await Promise.all([
      Channels.addMembers(channelId, channelMembers),
      service.from('team_members').upsert(teamRows, {
        onConflict: 'team_id,member_id',
        ignoreDuplicates: true,
      }),
    ])
  }

  // Auto-hire a team leader agent
  try {
    await hireTeamLeader({
      userId: user.id,
      projectId: activeProjectId,
      userMemberId,
      teamId: team.id,
      teamName: name,
      teamDescription: description,
      channelId,
    })
  } catch (e) {
    // Non-fatal — team still works without a leader agent
    console.error('[createTeam] team leader auto-hire failed:', e)
  }

  revalidatePath('/workspace', 'layout')
  return { teamId: team.id, channelId }
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
  await Channels.archiveByTeam(teamId)

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
  const member = await Members.findByInstanceId(instanceId)
  if (!member) throw new Error('Agent not found')

  // Add to team_members
  await service
    .from('team_members')
    .upsert(
      { team_id: teamId, member_id: member.id, role: 'worker' },
      { onConflict: 'team_id,member_id', ignoreDuplicates: true },
    )

  // Add to all team channels
  const teamChannels = await Channels.findByTeam(teamId, 'team')

  if (teamChannels.length > 0) {
    await Promise.all(
      teamChannels.map(c =>
        Channels.addMembers(c.id, [{ memberId: member.id, role: 'participant' }])
      )
    )
  }

  revalidatePath('/workspace', 'layout')
}
