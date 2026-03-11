import { Members, Channels, Agents } from '@agentbay/db/primitives'
import { createServiceClient } from '@agentbay/db/server'

/**
 * Ensure workspace primitives exist for a project.
 * Idempotent — safe to call on every page load.
 *
 * Creates:
 * 1. User member (rank=owner) if missing
 * 2. #general channel (kind=broadcast) if missing
 * 3. User added to #general
 * 4. Backfills any agent_instances that lack a workspace member
 */
export async function ensureWorkspaceBootstrapped(
  projectId: string,
  userId: string
): Promise<{ userMemberId: string }> {
  // Fast path: if user member already exists, check if channels + agents are set up
  // This avoids 10+ queries on every page load after the first bootstrap
  const existingMember = await Members.findByUser(projectId, userId)

  if (existingMember) {
    // Quick check: do broadcast channels exist? (covers 99% of page loads after first bootstrap)
    const channelCount = await Channels.countBroadcast(projectId, ['general', 'tasks'])

    if (channelCount >= 2) {
      return { userMemberId: existingMember.id }
    }
  }

  // Slow path: full bootstrap

  // 1. Create or find user member (race-safe)
  const userMemberId = existingMember
    ? existingMember.id
    : await Members.create(projectId, {
        userId,
        displayName: 'You',
        rank: 'owner',
        status: 'active',
      })

  // 2. Create or find broadcast channels (#general, #tasks)
  const broadcastChannels = [
    { name: 'general', description: 'Project-wide announcements' },
    { name: 'tasks', description: 'Task assignments and progress updates' },
  ]

  for (const ch of broadcastChannels) {
    const channelId = await Channels.create(projectId, {
      name: ch.name,
      kind: 'broadcast',
      description: ch.description,
    })

    // 3. Add user to channel (idempotent)
    await Channels.addMember(channelId, userMemberId, 'owner')
  }

  // 4. Backfill: agent_instances without corresponding members
  const instances = await Agents.listInstances(userId)

  if (instances.length > 0) {
    // Detect co-founder instance for rank assignment
    // (corporations table isn't a primitive yet — use service client for this one query)
    const service = createServiceClient()
    const { data: corp } = await service
      .from('corporations')
      .select('co_founder_instance_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    const coFounderInstanceId = corp?.co_founder_instance_id ?? null

    // Get existing agent members to avoid re-creating
    const existingAgentMembers = await Members.listActive(projectId, { type: 'agent' })
    const existingInstanceIds = new Set(
      existingAgentMembers.map(m => m.instance_id).filter(Boolean)
    )

    // Create members for instances that don't have one yet
    for (const inst of instances) {
      if (existingInstanceIds.has(inst.id)) continue

      const agentName = inst.display_name ?? (inst.agents as any)?.name ?? 'Agent'
      const rank = inst.id === coFounderInstanceId ? 'master' : 'worker'
      try {
        const memberId = await Members.create(projectId, {
          instanceId: inst.id,
          displayName: agentName,
          rank,
        })
        await Channels.createDM(projectId, userMemberId, memberId, agentName)
        await Channels.joinBroadcasts(projectId, memberId)
        await Channels.joinAllTeams(projectId, memberId)
      } catch (e) {
        // Best effort — will retry on next page load
        console.error(`[bootstrap] failed to backfill agent ${inst.id}:`, e)
      }
    }
  }

  return { userMemberId }
}
