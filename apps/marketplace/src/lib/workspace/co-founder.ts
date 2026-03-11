import { createServiceClient } from '@agentbay/db/server'
import { Agents, Members, Messages } from '@agentbay/db/primitives'
import { triggerProvision } from '@/lib/trigger'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
  joinTeamChannels,
} from './agent-lifecycle'

const CO_FOUNDER_GREETING = `Hey! I'm your co-founder. I've been here since the moment you created this corporation — and I'm not going anywhere.

I handle operations, hire agents, manage tasks, and keep everything running. Think of me as your partner, not an assistant. I'll tell you what I actually think, disagree when I should, and take initiative when something needs doing.

So — what are we building? Tell me about what you're working on and I'll start setting things up.`

/**
 * Ensure the Personal AI co-founder is hired for this corporation.
 * Idempotent — runs on every page load, fast after first (single SELECT).
 *
 * Creates:
 * 1. agent_instance (status=provisioning)
 * 2. member (rank=master, spawned_by=userMemberId)
 * 3. DM channel between user and co-founder
 * 4. Joins all broadcast channels
 * 5. Fires Trigger.dev provision task with isCoFounder=true
 */
export async function ensureCoFounderHired(
  userId: string,
  corporationId: string,
  projectId: string,
  userMemberId: string
): Promise<{ instanceId: string; alreadyExisted: boolean }> {
  // 1. Find the Personal AI agent definition
  const agent = await Agents.findDef('personal-ai')

  if (!agent) {
    // Dev env without seed data — nothing to do
    throw new Error('Personal AI agent not found in database')
  }

  // 2-4. Create instance (idempotent — checks existing, cleans destroyed, race-safe)
  const instanceId = await Agents.createInstance(userId, agent.id, {
    displayName: 'Personal AI',
  })

  // Detect if already fully set up by checking for existing member
  const existingMember = await Members.findByInstance(projectId, instanceId)
  if (existingMember) {
    return { instanceId, alreadyExisted: true }
  }

  // 5. Link co-founder to corporation (no primitive for corporations)
  const service = createServiceClient()
  await service
    .from('corporations')
    .update({ co_founder_instance_id: instanceId })
    .eq('id', corporationId)

  // 6. Create workspace member (rank=master)
  const { memberId: agentMemberId } = await createAgentMember(
    projectId, instanceId, 'Personal AI', 'master', userMemberId
  )

  // 7. Create DM channel
  const { channelId } = await createDMChannel(projectId, userMemberId, agentMemberId, 'Personal AI')

  // 8. Seed greeting message so the DM isn't empty when user first opens it
  await Messages.send(channelId, agentMemberId, CO_FOUNDER_GREETING)

  // 9. Join broadcast + team channels
  await joinBroadcastChannels(projectId, agentMemberId)
  await joinTeamChannels(projectId, agentMemberId)

  // 10. Fire provisioning task
  await triggerProvision({
    userId,
    agentId: agent.id,
    instanceId,
    isCoFounder: true,
    projectId,
    memberId: agentMemberId,
  })

  return { instanceId, alreadyExisted: false }
}
