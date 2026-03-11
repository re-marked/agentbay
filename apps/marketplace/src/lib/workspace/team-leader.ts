import { createServiceClient } from '@agentbay/db/server'
import { Agents, Channels, Messages } from '@agentbay/db/primitives'
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
 * 1. agent definition (idempotent via Agents.createDef)
 * 2. agent_instance (status=provisioning, cleans up destroyed first)
 * 3. member (rank=leader)
 * 4. Updates team.leader_member_id to the agent
 * 5. DM channel with greeting message
 * 6. Joins broadcast channels + own team channel
 * 7. Fires Trigger.dev provision task with isTeamLeader=true
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

  // 1. Ensure team-leader agent definition exists (idempotent, race-safe)
  const agentId = await Agents.createDef({
    slug: 'team-leader',
    name: 'Team Leader',
    tagline: 'Coordinates team work, assigns tasks, and reports to you',
    description:
      "Auto-created when you form a team. Owns the team's outcomes — assigns tasks, tracks progress, removes blockers, and keeps you informed.",
    category: 'system',
    iconUrl: '👑',
    creatorId: userId,
  })

  // 2. Create agent_instance (cleans up destroyed instances, race-safe)
  const displayName = `${teamName} Leader`
  const instanceId = await Agents.createInstance(userId, agentId, {
    displayName,
    teamId,
  })

  // 3. Create workspace member (rank=leader)
  const { memberId } = await createAgentMember(
    projectId,
    instanceId,
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
    Channels.addMember(channelId, memberId, 'participant'),
  ])

  // 6. Create DM channel + seed greeting
  const { channelId: dmChannelId } = await createDMChannel(
    projectId,
    userMemberId,
    memberId,
    displayName,
  )

  await Messages.send(dmChannelId, memberId, TEAM_LEADER_GREETING(teamName))

  // 7. Join broadcast channels
  await joinBroadcastChannels(projectId, memberId)

  // 8. Fire provisioning task with team leader context
  await triggerProvision({
    userId,
    agentId,
    instanceId,
    isTeamLeader: true,
    projectId,
    memberId,
    teamId,
    teamName,
    teamDescription,
  })

  return { instanceId, memberId }
}
