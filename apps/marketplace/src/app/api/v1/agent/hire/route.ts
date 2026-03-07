import { NextResponse } from 'next/server'
import { isValidServiceKey, verifyMember } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'
import { createAgentMember, createDMChannel, joinBroadcastChannels } from '@/lib/workspace/agent-lifecycle'
import { triggerProvision } from '@/lib/trigger'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/v1/agent/hire
// Body: { memberId (hiring agent), agentSlug, projectId }
// Only master/owner can hire
export async function POST(request: Request) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { memberId: string; agentSlug: string; projectId: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { memberId, agentSlug, projectId } = body
  if (!memberId || !agentSlug || !projectId) {
    return NextResponse.json({ error: 'Missing memberId, agentSlug, or projectId' }, { status: 400 })
  }

  // Verify hiring member has authority (must be master or owner)
  const member = await verifyMember(memberId)
  if (!member || member.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid member or project mismatch' }, { status: 403 })
  }
  if (!['master', 'owner'].includes(member.rank)) {
    return NextResponse.json({ error: 'Insufficient rank to hire agents' }, { status: 403 })
  }

  const service = createServiceClient()

  // Find the agent definition
  const { data: agent } = await service
    .from('agents')
    .select('id, name, slug')
    .eq('slug', agentSlug)
    .eq('status', 'published')
    .maybeSingle()

  if (!agent) {
    return NextResponse.json({ error: `Agent '${agentSlug}' not found` }, { status: 404 })
  }

  // Find the user who owns this project (needed for agent_instances)
  const { data: project } = await service
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Check if already hired
  const { data: existing } = await service
    .from('agent_instances')
    .select('id')
    .eq('user_id', project.user_id)
    .eq('agent_id', agent.id)
    .not('status', 'in', '("destroyed","destroying")')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Agent already hired', instanceId: existing.id }, { status: 409 })
  }

  // Clean up destroyed instances
  await service
    .from('agent_instances')
    .delete()
    .eq('user_id', project.user_id)
    .eq('agent_id', agent.id)
    .in('status', ['destroyed', 'destroying'])

  // Create agent_instance
  const { data: instance, error: instanceErr } = await service
    .from('agent_instances')
    .insert({
      user_id: project.user_id,
      agent_id: agent.id,
      display_name: agent.name,
      fly_app_name: 'pending',
      fly_machine_id: 'pending',
      status: 'provisioning',
    })
    .select('id')
    .single()

  if (instanceErr || !instance) {
    return NextResponse.json({ error: 'Failed to create instance' }, { status: 500 })
  }

  // Create workspace member
  const { memberId: agentMemberId } = await createAgentMember(
    projectId, instance.id, agent.name, 'worker', memberId
  )

  // Create DM channel between the project owner's member and the new agent
  // Find the owner member
  const { data: ownerMember } = await service
    .from('members')
    .select('id')
    .eq('project_id', projectId)
    .eq('rank', 'owner')
    .limit(1)
    .single()

  if (ownerMember) {
    await createDMChannel(projectId, ownerMember.id, agentMemberId, agent.name)
  }

  // Join broadcast channels
  await joinBroadcastChannels(projectId, agentMemberId)

  // Fire provisioning
  await triggerProvision({
    userId: project.user_id,
    agentId: agent.id,
    instanceId: instance.id,
    projectId,
    memberId: agentMemberId,
  })

  return NextResponse.json({
    instanceId: instance.id,
    memberId: agentMemberId,
    agentName: agent.name,
    status: 'provisioning',
  })
}
