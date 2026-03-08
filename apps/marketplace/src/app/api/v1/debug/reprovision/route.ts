import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { triggerProvision, triggerDestroy } from '@/lib/trigger'

/**
 * POST /api/v1/debug/reprovision
 *
 * Debug endpoint: destroys the current machine and re-provisions with the latest image.
 * Body: { instanceId: string }
 */
export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { instanceId } = await request.json()
  if (!instanceId) {
    return Response.json({ error: 'Missing instanceId' }, { status: 400 })
  }

  const service = createServiceClient()

  // Load instance — verify ownership
  const { data: instance } = await service
    .from('agent_instances')
    .select('id, agent_id, fly_app_name, fly_machine_id, status')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .single()

  if (!instance) {
    return Response.json({ error: 'Instance not found' }, { status: 404 })
  }

  // Find workspace context (project + member)
  const { data: member } = await service
    .from('members')
    .select('id, project_id')
    .eq('instance_id', instanceId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle()

  // 1. Destroy existing machine (if it has one)
  if (instance.fly_app_name && instance.fly_app_name !== 'pending') {
    try {
      await triggerDestroy({ instanceId: instance.id })
    } catch (err) {
      console.error('[debug/reprovision] destroy failed:', err)
    }
  }

  // 2. Reset instance to provisioning
  await service
    .from('agent_instances')
    .update({
      status: 'provisioning',
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
    })
    .eq('id', instanceId)

  // 3. Trigger fresh provision
  await triggerProvision({
    userId: user.id,
    agentId: instance.agent_id,
    instanceId: instance.id,
    projectId: member?.project_id ?? undefined,
    memberId: member?.id ?? undefined,
    isCoFounder: true, // Always use co-founder role for Personal AI
  })

  return Response.json({ ok: true, status: 'provisioning' })
}
