import { createServiceClient } from '@agentbay/db/server'
import { triggerProvision } from '@/lib/trigger'
import {
  createAgentMember,
  createDMChannel,
  joinBroadcastChannels,
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
  const service = createServiceClient()

  // 1. Find the Personal AI agent definition
  const { data: agent } = await service
    .from('agents')
    .select('id, name, slug')
    .eq('slug', 'personal-ai')
    .eq('status', 'published')
    .maybeSingle()

  if (!agent) {
    // Dev env without seed data — nothing to do
    throw new Error('Personal AI agent not found in database')
  }

  // 2. Check if already hired (any non-destroyed instance)
  const { data: existing } = await service
    .from('agent_instances')
    .select('id, status')
    .eq('user_id', userId)
    .eq('agent_id', agent.id)
    .not('status', 'in', '("destroyed","destroying")')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { instanceId: existing.id, alreadyExisted: true }
  }

  // 3. Clean up destroyed instances (same pattern as hireAgent)
  await service
    .from('agent_instances')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', agent.id)
    .in('status', ['destroyed', 'destroying'])

  // 4. Create agent_instance (provisioning)
  const { data: instance, error: instanceErr } = await service
    .from('agent_instances')
    .insert({
      user_id: userId,
      agent_id: agent.id,
      display_name: 'Personal AI',
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
    })
    .select('id')
    .single()

  // Race condition: another tab created it between our check and insert
  if (instanceErr?.code === '23505') {
    const { data: raced } = await service
      .from('agent_instances')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_id', agent.id)
      .not('status', 'in', '("destroyed","destroying")')
      .limit(1)
      .single()
    if (raced) return { instanceId: raced.id, alreadyExisted: true }
  }

  if (!instance) {
    throw new Error(`Failed to create co-founder instance: ${instanceErr?.message}`)
  }

  // 5. Link co-founder to corporation
  await service
    .from('corporations')
    .update({ co_founder_instance_id: instance.id })
    .eq('id', corporationId)

  // 6. Create workspace member (rank=master)
  const { memberId: agentMemberId } = await createAgentMember(
    projectId, instance.id, 'Personal AI', 'master', userMemberId
  )

  // 7. Create DM channel
  const { channelId } = await createDMChannel(projectId, userMemberId, agentMemberId, 'Personal AI')

  // 8. Seed greeting message so the DM isn't empty when user first opens it
  await service
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: agentMemberId,
      content: CO_FOUNDER_GREETING,
      message_kind: 'text',
      depth: 0,
    })

  // 9. Join broadcast channels (#general, etc.)
  await joinBroadcastChannels(projectId, agentMemberId)

  // 10. Fire provisioning task
  await triggerProvision({
    userId,
    agentId: agent.id,
    instanceId: instance.id,
    isCoFounder: true,
    projectId,
    memberId: agentMemberId,
  })

  return { instanceId: instance.id, alreadyExisted: false }
}
