'use server'

import { revalidatePath } from 'next/cache'
import { Members, Channels, Teams, TeamMembers } from '@agentbay/db/primitives'
import { createTeamFlow } from '@/lib/flows'
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

  // Run the create-team flow
  const { teamId, channelId } = await createTeamFlow({
    projectId: activeProjectId,
    userMemberId,
    name,
    description,
  })

  // Auto-hire a team leader agent
  try {
    await hireTeamLeader({
      userId: user.id,
      projectId: activeProjectId,
      userMemberId,
      teamId,
      teamName: name,
      teamDescription: description,
      channelId,
    })
  } catch (e) {
    // Non-fatal — team still works without a leader agent
    console.error('[createTeam] team leader auto-hire failed:', e)
  }

  revalidatePath('/workspace', 'layout')
  return { teamId, channelId }
}

/**
 * Archive a team — archives the team and its channels.
 */
export async function archiveTeam(teamId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const team = await Teams.findById(teamId)
  if (!team) throw new Error('Team not found')

  await Teams.archive(teamId)
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

  const member = await Members.findByInstanceId(instanceId)
  if (!member) throw new Error('Agent not found')

  await TeamMembers.add(teamId, member.id, 'worker')

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
