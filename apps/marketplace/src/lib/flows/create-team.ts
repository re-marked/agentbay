import { Members, Channels, Teams, TeamMembers } from '@agentbay/db/primitives'

export interface CreateTeamFlowOpts {
  projectId: string
  userMemberId: string
  name: string
  description?: string | null
}

export interface CreateTeamFlowResult {
  teamId: string
  channelId: string
}

/**
 * Core create-team flow:
 * 1. Create team with user as leader
 * 2. Create #team-{name} channel
 * 3. Add creator as team member + channel owner
 * 4. Add all project agents to team + channel
 *
 * Caller handles: auth, revalidation, team-leader auto-hire.
 */
export async function createTeamFlow(opts: CreateTeamFlowOpts): Promise<CreateTeamFlowResult> {
  const { projectId, userMemberId, name, description } = opts

  // 1. Create the team
  const teamId = await Teams.create(projectId, {
    name,
    description,
    leaderMemberId: userMemberId,
  })

  // 2. Create the team channel
  const channelName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const channelId = await Channels.create(projectId, {
    name: channelName,
    kind: 'team',
    teamId,
    description: `Team channel for ${name}`,
  })

  // 3. Add creator
  await Promise.all([
    TeamMembers.add(teamId, userMemberId, 'leader'),
    Channels.addMember(channelId, userMemberId, 'owner'),
  ])

  // 4. Add all active agent members (except co-founder)
  const agentMembers = await Members.listActive(projectId, {
    type: 'agent',
    excludeRank: 'master',
  })

  if (agentMembers.length > 0) {
    await Promise.all([
      Channels.addMembers(channelId, agentMembers.map(m => ({
        memberId: m.id,
        role: 'participant' as const,
      }))),
      TeamMembers.addBulk(teamId, agentMembers.map(m => ({
        memberId: m.id,
        role: 'worker',
      }))),
    ])
  }

  return { teamId, channelId }
}
