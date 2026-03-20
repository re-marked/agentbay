import { Agents, Channels, Teams, TeamMembers } from '@agentbay/db/primitives'
import { hireAgentFlow } from '@/lib/flows'

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

  // 2. Run the hire flow (instance + member + DM + greeting + channels + provision)
  const displayName = `${teamName} Leader`
  const result = await hireAgentFlow({
    userId,
    projectId,
    userMemberId,
    agentId,
    displayName,
    rank: 'leader',
    greeting: TEAM_LEADER_GREETING(teamName),
    teamId,
    provisionExtras: {
      isTeamLeader: true,
      teamId,
      teamName,
      teamDescription,
    },
  })

  // 3. Post-flow: update team leader + add to team members + team channel
  await Promise.all([
    Teams.update(teamId, { leader_member_id: result.memberId }),
    TeamMembers.add(teamId, result.memberId, 'leader'),
    Channels.addMember(channelId, result.memberId, 'participant'),
  ])

  return { instanceId: result.instanceId, memberId: result.memberId }
}
