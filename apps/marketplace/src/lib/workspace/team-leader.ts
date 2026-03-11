import { createServiceClient } from '@agentbay/db/server'
import { triggerProvision } from '@/lib/trigger'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
} from './agent-lifecycle'

const TEAM_LEADER_GREETING = (teamName: string) =>
  `I'm the leader of the **${teamName}** team. Created the moment this team was formed — my existence is tied to its success.

I own the outcomes of this team. I'll coordinate work, assign tasks, track progress, remove blockers, and report back to you. When things go well, the team did it. When things go wrong, that's on me.

What's the mission? Tell me what this team should be working on and I'll start organizing.`

/**
 * Ensure a "team-leader" system agent definition exists in the agents table.
 * All team leaders share this one definition (different instances per team).
 * Idempotent — safe to call on every team creation.
 */
async function ensureTeamLeaderAgent(creatorId: string): Promise<string> {
  const service = createServiceClient()

  const { data: existing } = await service
    .from('agents')
    .select('id')
    .eq('slug', 'team-leader')
    .maybeSingle()

  if (existing) return existing.id

  const { data: agent, error } = await service
    .from('agents')
    .insert({
      slug: 'team-leader',
      name: 'Team Leader',
      tagline: 'Coordinates team work, assigns tasks, and reports to you',
      description:
        "Auto-created when you form a team. Owns the team's outcomes — assigns tasks, tracks progress, removes blockers, and keeps you informed.",
      category: 'system',
      icon_url: '👑',
      status: 'published',
      pricing_model: 'free',
      creator_id: creatorId,
      github_repo_url: 'https://github.com/agentbay/team-leader',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  // Race condition: another request created it between check and insert
  if (error?.code === '23505') {
    const { data: raced } = await service
      .from('agents')
      .select('id')
      .eq('slug', 'team-leader')
      .single()
    if (raced) return raced.id
  }

  if (!agent) throw new Error(`Failed to create team-leader agent: ${error?.message}`)
  return agent.id
}

interface HireTeamLeaderParams {
  userId: string
  projectId: string
  userMemberId: string
  teamId: string
  teamName: string
  teamDescription: string | null
  channelId: string
}

/**
 * Hire a team leader agent for a newly created team.
 * Called automatically from createTeam().
 *
 * Creates:
 * 1. agent_instance (status=provisioning)
 * 2. member (rank=leader)
 * 3. Updates team.leader_member_id to the agent
 * 4. DM channel with greeting message
 * 5. Joins broadcast channels + own team channel
 * 6. Fires Trigger.dev provision task with isTeamLeader=true
 */
export async function hireTeamLeader({
  userId,
  projectId,
  userMemberId,
  teamId,
  teamName,
  teamDescription,
  channelId,
}: HireTeamLeaderParams): Promise<{ instanceId: string; memberId: string }> {
  const service = createServiceClient()

  // 1. Ensure team-leader agent definition exists
  const agentId = await ensureTeamLeaderAgent(userId)

  // 2. Clean up any destroyed team-leader instances for this team
  await service
    .from('agent_instances')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .eq('team_id', teamId)
    .in('status', ['destroyed', 'destroying'])

  // 3. Create agent_instance (team_id scoped — allows one leader per team)
  const displayName = `${teamName} Leader`
  const { data: instance, error: instanceErr } = await service
    .from('agent_instances')
    .insert({
      user_id: userId,
      agent_id: agentId,
      team_id: teamId,
      display_name: displayName,
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
    })
    .select('id')
    .single()

  if (!instance) throw new Error(`Failed to create team leader instance: ${instanceErr?.message}`)

  // 3. Create workspace member (rank=leader)
  const { memberId } = await createAgentMember(
    projectId,
    instance.id,
    displayName,
    'leader',
    userMemberId,
  )

  // 4. Update team.leader_member_id to the agent (replaces the user placeholder)
  await service.from('teams').update({ leader_member_id: memberId }).eq('id', teamId)

  // 5. Add to team_members as leader + team channel as participant
  await Promise.all([
    service.from('team_members').upsert(
      { team_id: teamId, member_id: memberId, role: 'leader' as const },
      { onConflict: 'team_id,member_id', ignoreDuplicates: true },
    ),
    service.from('channel_members').upsert(
      { channel_id: channelId, member_id: memberId, role: 'participant' as const },
      { onConflict: 'channel_id,member_id', ignoreDuplicates: true },
    ),
  ])

  // 6. Create DM channel + seed greeting
  const { channelId: dmChannelId } = await createDMChannel(
    projectId,
    userMemberId,
    memberId,
    displayName,
  )

  await service.from('channel_messages').insert({
    channel_id: dmChannelId,
    sender_id: memberId,
    content: TEAM_LEADER_GREETING(teamName),
    message_kind: 'text',
    depth: 0,
  })

  // 7. Join broadcast channels
  await joinBroadcastChannels(projectId, memberId)

  // 8. Fire provisioning task with team leader context
  await triggerProvision({
    userId,
    agentId,
    instanceId: instance.id,
    isTeamLeader: true,
    projectId,
    memberId,
    teamId,
    teamName,
    teamDescription,
  })

  return { instanceId: instance.id, memberId }
}
