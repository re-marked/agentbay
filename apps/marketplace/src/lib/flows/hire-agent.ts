import { Agents, Members, Channels, Messages, Corporations, Projects } from '@agentbay/db/primitives'
import { triggerProvision } from '@/lib/trigger'

/**
 * Core hire-agent flow — creates instance, member, DM, joins channels, provisions.
 *
 * Used by:
 * - hireAgent (marketplace hire)
 * - ensureCoFounderHired (page-load co-founder setup)
 * - hireTeamLeader (team creation)
 *
 * This is the reusable business logic. Callers handle:
 * - Auth (server actions verify user)
 * - Revalidation (server actions call revalidatePath)
 * - Pre-conditions (agent limit check, agent def lookup)
 * - Post-conditions (corporation linking, team member add, etc.)
 */

export interface HireAgentFlowOpts {
  userId: string
  projectId: string
  userMemberId: string
  agentId: string
  displayName: string
  rank: 'master' | 'leader' | 'worker'
  greeting?: string
  teamId?: string
  provisionExtras?: Record<string, unknown>
}

export interface HireAgentFlowResult {
  instanceId: string
  memberId: string
  dmChannelId: string
}

/**
 * Execute the hire-agent flow:
 * 1. Create agent instance (idempotent, race-safe)
 * 2. Create workspace member
 * 3. Create DM channel + seed greeting
 * 4. Join broadcast channels
 * 5. Join team channels
 * 6. Fire Trigger.dev provision task
 */
export async function hireAgentFlow(opts: HireAgentFlowOpts): Promise<HireAgentFlowResult> {
  const {
    userId, projectId, userMemberId, agentId,
    displayName, rank, greeting, teamId, provisionExtras,
  } = opts

  // 1. Create agent instance
  const instanceId = await Agents.createInstance(userId, agentId, {
    displayName,
    teamId,
  })

  // 2. Create workspace member
  const memberId = await Members.create(projectId, {
    instanceId,
    displayName,
    rank,
    spawnedBy: userMemberId,
  })

  // 3. Create DM channel
  const dmChannelId = await Channels.createDM(projectId, userMemberId, memberId, displayName)

  // 4. Seed greeting message (if provided)
  if (greeting) {
    await Messages.send(dmChannelId, memberId, greeting)
  }

  // 5. Join broadcast channels
  await Channels.joinBroadcasts(projectId, memberId)

  // 6. Join team channels
  await Channels.joinAllTeams(projectId, memberId)

  // 7. Fire Trigger.dev provision task
  await triggerProvision({
    userId,
    agentId,
    instanceId,
    projectId,
    memberId,
    ...provisionExtras,
  })

  return { instanceId, memberId, dmChannelId }
}

/**
 * Ensure corp + project exist for a user. Returns projectId.
 * Shared pre-condition for marketplace hire flow.
 */
export async function ensureCorpAndProject(userId: string): Promise<string> {
  const corporationId = await Corporations.create(userId, 'My Corporation')

  const existingProject = await Projects.findByName(userId, 'My Workspace')
  if (existingProject) return existingProject.id

  return Projects.create({
    userId,
    name: 'My Workspace',
    corporationId,
  })
}
