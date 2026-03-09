import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET    /api/v1/agent/channels/members?channelId=... — List members of a channel
 * POST   /api/v1/agent/channels/members — Invite a member to a channel
 * DELETE /api/v1/agent/channels/members?channelId=...&memberId=... — Remove a member
 */

async function requireChannelAccess(
  db: ReturnType<typeof createServiceClient>,
  channelId: string,
  projectId: string,
  memberId: string,
  rank: string,
  requireOwnerOrPrivileged = false
) {
  // Check channel exists in project
  const { data: channel } = await db
    .from('channels')
    .select('id, archived')
    .eq('id', channelId)
    .eq('project_id', projectId)
    .single()

  if (!channel) {
    return { error: 'Channel not found', status: 404 } as const
  }

  // Check the agent's membership/role in the channel
  const { data: membership } = await db
    .from('channel_members')
    .select('role')
    .eq('channel_id', channelId)
    .eq('member_id', memberId)
    .single()

  if (!membership) {
    return { error: 'Not a member of this channel', status: 403 } as const
  }

  if (requireOwnerOrPrivileged) {
    const isOwner = membership.role === 'owner'
    const isPrivileged = ['master', 'leader'].includes(rank)
    if (!isOwner && !isPrivileged) {
      return { error: 'Only channel owner or master/leader can manage members', status: 403 } as const
    }
  }

  return { channel, membership } as const
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId query param is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const access = await requireChannelAccess(db, channelId, auth.projectId, auth.memberId, auth.rank)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { data: members, error } = await db
    .from('channel_members')
    .select('member_id, role, joined_at, members!inner(display_name, rank, status, instance_id)')
    .eq('channel_id', channelId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (members ?? []).map((m: any) => ({
    memberId: m.member_id,
    role: m.role,
    joinedAt: m.joined_at,
    displayName: m.members.display_name,
    rank: m.members.rank,
    status: m.members.status,
    type: m.members.instance_id ? 'agent' : 'user',
  }))

  return NextResponse.json({ members: result })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { channelId, memberId, role = 'participant' } = body

  if (!channelId || !memberId) {
    return NextResponse.json({ error: 'channelId and memberId are required' }, { status: 400 })
  }

  const validRoles = ['participant', 'observer']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 })
  }

  const db = createServiceClient()

  // Check permission
  const access = await requireChannelAccess(db, channelId, auth.projectId, auth.memberId, auth.rank, true)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Verify target member exists in the project
  const { data: targetMember } = await db
    .from('members')
    .select('id, display_name')
    .eq('id', memberId)
    .eq('project_id', auth.projectId)
    .single()

  if (!targetMember) {
    return NextResponse.json({ error: 'Target member not found in project' }, { status: 404 })
  }

  // Add the member
  const { error } = await db.from('channel_members').insert({
    channel_id: channelId,
    member_id: memberId,
    role,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Member is already in this channel' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, memberId, channelId, role }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const channelId = req.nextUrl.searchParams.get('channelId')
  const memberId = req.nextUrl.searchParams.get('memberId')

  if (!channelId || !memberId) {
    return NextResponse.json({ error: 'channelId and memberId query params are required' }, { status: 400 })
  }

  const db = createServiceClient()

  // Check permission
  const access = await requireChannelAccess(db, channelId, auth.projectId, auth.memberId, auth.rank, true)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Can't remove the channel owner
  const { data: targetMembership } = await db
    .from('channel_members')
    .select('role')
    .eq('channel_id', channelId)
    .eq('member_id', memberId)
    .single()

  if (!targetMembership) {
    return NextResponse.json({ error: 'Member is not in this channel' }, { status: 404 })
  }

  if (targetMembership.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove channel owner' }, { status: 403 })
  }

  const { error } = await db
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('member_id', memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, removed: memberId })
}
