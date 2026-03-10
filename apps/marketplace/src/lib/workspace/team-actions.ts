'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'
import { triggerProvision } from '@/lib/trigger'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
} from './agent-lifecycle'

/**
 * Create a team in the active project.
 * Auto-provisions a team leader agent (separate OpenClaw instance)
 * and creates a team channel.
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

  // ── 1. Find the Personal AI agent definition (reuse for team leader base image)
  const { data: personalAiAgent } = await service
    .from('agents')
    .select('id')
    .eq('slug', 'personal-ai')
    .eq('status', 'published')
    .maybeSingle()

  if (!personalAiAgent) throw new Error('Personal AI agent not found — cannot provision team leader')

  // ── 2. Create the team (leader set later after member is created)
  const { data: team, error: teamError } = await service
    .from('teams')
    .insert({
      project_id: activeProjectId,
      name,
      description,
      status: 'active',
    })
    .select('id')
    .single()

  if (!team) throw new Error(`Failed to create team: ${teamError?.message}`)

  // ── 3. Create team channel
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

  // ── 4. Add user to team + channel
  await service.from('team_members').insert({
    team_id: team.id,
    member_id: userMemberId,
    role: 'leader',
  })

  await service.from('channel_members').insert({
    channel_id: channel.id,
    member_id: userMemberId,
    role: 'owner',
  })

  // ── 5. Create team leader agent instance
  const leaderDisplayName = `${name} Leader`
  const { data: instance, error: instanceErr } = await service
    .from('agent_instances')
    .insert({
      user_id: user.id,
      agent_id: personalAiAgent.id,
      display_name: leaderDisplayName,
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
    })
    .select('id')
    .single()

  if (!instance) throw new Error(`Failed to create team leader instance: ${instanceErr?.message}`)

  // ── 6. Create workspace member for team leader (rank: leader)
  const { memberId: leaderMemberId } = await createAgentMember(
    activeProjectId,
    instance.id,
    leaderDisplayName,
    'leader',
    userMemberId,
  )

  // ── 7. Set team leader
  await service
    .from('teams')
    .update({ leader_member_id: leaderMemberId })
    .eq('id', team.id)

  // ── 8. Update team_members: set leader agent as leader (replace user as leader)
  // User stays as a member, leader agent becomes the actual team leader
  await service.from('team_members').upsert(
    { team_id: team.id, member_id: leaderMemberId, role: 'leader' },
    { onConflict: 'team_id,member_id', ignoreDuplicates: false },
  )

  // Demote user to worker in team_members (they're still the CEO)
  await service
    .from('team_members')
    .update({ role: 'worker' })
    .eq('team_id', team.id)
    .eq('member_id', userMemberId)

  // ── 9. Add leader to team channel
  await service.from('channel_members').upsert(
    { channel_id: channel.id, member_id: leaderMemberId, role: 'participant' },
    { onConflict: 'channel_id,member_id', ignoreDuplicates: true },
  )

  // ── 10. Create DM channel between user and team leader
  await createDMChannel(activeProjectId, userMemberId, leaderMemberId, leaderDisplayName)

  // ── 11. Join broadcast channels (leader participates in #general, #tasks)
  await joinBroadcastChannels(activeProjectId, leaderMemberId)

  // ── 12. Add all existing agents to the team as workers
  const { data: agentMembers } = await service
    .from('members')
    .select('id')
    .eq('project_id', activeProjectId)
    .not('instance_id', 'is', null)
    .neq('status', 'archived')
    .neq('id', leaderMemberId) // don't re-add the leader

  if (agentMembers && agentMembers.length > 0) {
    await Promise.all([
      service.from('channel_members').upsert(
        agentMembers.map(m => ({
          channel_id: channel.id,
          member_id: m.id,
          role: 'participant' as const,
        })),
        { onConflict: 'channel_id,member_id', ignoreDuplicates: true },
      ),
      service.from('team_members').upsert(
        agentMembers.map(m => ({
          team_id: team.id,
          member_id: m.id,
          role: 'worker' as const,
        })),
        { onConflict: 'team_id,member_id', ignoreDuplicates: true },
      ),
    ])
  }

  // ── 13. Fire provisioning task for team leader
  await triggerProvision({
    userId: user.id,
    agentId: personalAiAgent.id,
    instanceId: instance.id,
    projectId: activeProjectId,
    memberId: leaderMemberId,
    isTeamLeader: true,
    teamId: team.id,
    teamName: name,
    teamDescription: description,
  })

  revalidatePath('/workspace', 'layout')
  return { teamId: team.id, channelId: channel.id, leaderInstanceId: instance.id }
}

/**
 * Archive a team — archives the team, its channels, and destroys the team leader agent.
 */
export async function archiveTeam(teamId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const service = createServiceClient()

  const { data: team } = await service
    .from('teams')
    .select('id, project_id, leader_member_id')
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

  // Archive the team leader member + destroy its instance
  if (team.leader_member_id) {
    const { data: leaderMember } = await service
      .from('members')
      .select('id, instance_id')
      .eq('id', team.leader_member_id)
      .maybeSingle()

    if (leaderMember) {
      // Archive the member
      await service
        .from('members')
        .update({ status: 'archived' })
        .eq('id', leaderMember.id)

      // Mark instance as destroyed (shutdown-idle-machines will clean up Fly resources)
      if (leaderMember.instance_id) {
        await service
          .from('agent_instances')
          .update({ status: 'destroyed' })
          .eq('id', leaderMember.instance_id)
      }
    }
  }

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
