import { Agents, Corporations, Members } from '@agentbay/db/primitives'
import { hireAgentFlow } from '@/lib/flows'

const CO_FOUNDER_GREETING = `Hey! I'm your co-founder. I've been here since the moment you created this corporation — and I'm not going anywhere.

I handle operations, hire agents, manage tasks, and keep everything running. Think of me as your partner, not an assistant. I'll tell you what I actually think, disagree when I should, and take initiative when something needs doing.

So — what are we building? Tell me about what you're working on and I'll start setting things up.`

/**
 * Ensure the Personal AI co-founder is hired for this corporation.
 * Idempotent — runs on every page load, fast after first (single SELECT).
 */
export async function ensureCoFounderHired(
  userId: string,
  corporationId: string,
  projectId: string,
  userMemberId: string
): Promise<{ instanceId: string; alreadyExisted: boolean }> {
  // 1. Find the Personal AI agent definition
  const agent = await Agents.findDef('personal-ai')
  if (!agent) throw new Error('Personal AI agent not found in database')

  // 2. Create instance (idempotent — checks existing, cleans destroyed, race-safe)
  const instanceId = await Agents.createInstance(userId, agent.id, {
    displayName: 'Personal AI',
  })

  // 3. Detect if already fully set up by checking for existing member
  const existingMember = await Members.findByInstance(projectId, instanceId)
  if (existingMember) {
    return { instanceId, alreadyExisted: true }
  }

  // 4. Link co-founder to corporation
  await Corporations.linkCoFounder(corporationId, instanceId)

  // 5. Run the hire flow (member + DM + greeting + channels + provision)
  await hireAgentFlow({
    userId,
    projectId,
    userMemberId,
    agentId: agent.id,
    displayName: 'Personal AI',
    rank: 'master',
    greeting: CO_FOUNDER_GREETING,
    provisionExtras: { isCoFounder: true },
  })

  return { instanceId, alreadyExisted: false }
}
