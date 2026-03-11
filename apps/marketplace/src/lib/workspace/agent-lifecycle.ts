import { Members, Channels } from '@agentbay/db/primitives'

/**
 * Agent lifecycle operations — thin wrappers around @agentbay/db/primitives.
 *
 * These exist so callers (bootstrap, co-founder, team-leader, hire/actions)
 * don't need to change their imports. New code should import primitives directly.
 */

/**
 * Create a workspace member for an agent instance.
 * Protected by unique index (project_id, instance_id) — safe to call multiple times.
 */
export async function createAgentMember(
  projectId: string,
  instanceId: string,
  displayName: string,
  rank: string = 'worker',
  spawnedBy?: string
): Promise<{ memberId: string }> {
  const memberId = await Members.create(projectId, {
    instanceId,
    displayName,
    rank,
    spawnedBy,
  })
  return { memberId }
}

/**
 * Create a DM channel between two members.
 * Idempotent — returns existing channel if one already exists.
 */
export async function createDMChannel(
  projectId: string,
  userMemberId: string,
  agentMemberId: string,
  agentName: string
): Promise<{ channelId: string }> {
  const channelId = await Channels.createDM(projectId, userMemberId, agentMemberId, agentName)
  return { channelId }
}

/**
 * Add an agent member to all broadcast channels (#general, etc.) in the project.
 */
export async function joinBroadcastChannels(
  projectId: string,
  agentMemberId: string
): Promise<void> {
  await Channels.joinBroadcasts(projectId, agentMemberId)
}

/**
 * Add an agent member to all active team channels in the project.
 * Also adds them to the team_members table as a worker.
 */
export async function joinTeamChannels(
  projectId: string,
  agentMemberId: string
): Promise<void> {
  await Channels.joinAllTeams(projectId, agentMemberId)
}

/**
 * Archive an agent member — sets status to archived, archives DM channels,
 * removes from broadcast/team channels.
 * Rejects if the member is the master (co-founder) or owner.
 */
export async function archiveAgentMember(
  memberId: string
): Promise<{ error?: string }> {
  return Members.archive(memberId)
}

/**
 * Archive an agent member by their agent_instances ID.
 * Convenience wrapper for removeAgent() which has instanceId, not memberId.
 */
export async function archiveAgentMemberByInstanceId(
  instanceId: string
): Promise<{ error?: string }> {
  return Members.archiveByInstanceId(instanceId)
}
