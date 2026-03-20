import { NextRequest, NextResponse } from 'next/server'
import { Channels, Members } from '@agentbay/db/primitives'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET    /api/v1/agent/channels/members?channelId=... — List members of a channel
 * POST   /api/v1/agent/channels/members — Invite a member to a channel
 * DELETE /api/v1/agent/channels/members?channelId=...&memberId=... — Remove a member
 */

async function requireChannelAccess(
  channelId: string,
  projectId: string,
  memberId: string,
  rank: string,
  requireOwnerOrPrivileged = false
) {
  const channel = await Channels.findById(channelId)
  if (!channel || channel.project_id !== projectId) {
    return { error: 'Channel not found', status: 404 } as const
  }

  const isMember = await Channels.isMember(channelId, memberId)
  if (!isMember) {
    return { error: 'Not a member of this channel', status: 403 } as const
  }

  if (requireOwnerOrPrivileged) {
    const isPrivileged = ['master', 'leader'].includes(rank)
    if (!isPrivileged) {
      // Need to check if owner — isMember doesn't return role. Use getMembers.
      const members = await Channels.getMembers(channelId)
      const self = members.find((m: any) => m.member_id === memberId)
      if (self?.role !== 'owner') {
        return { error: 'Only channel owner or master/leader can manage members', status: 403 } as const
      }
    }
  }

  return { channel } as const
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: 'channelId query param is required' }, { status: 400 })
  }

  const access = await requireChannelAccess(channelId, auth.projectId, auth.memberId, auth.rank)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const members = await Channels.getMembers(channelId)

  const result = members.map((m: any) => ({
    memberId: m.member_id,
    role: m.role,
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

  const access = await requireChannelAccess(channelId, auth.projectId, auth.memberId, auth.rank, true)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Verify target member exists in the project
  const targetMember = await Members.findById(memberId)
  if (!targetMember) {
    return NextResponse.json({ error: 'Target member not found in project' }, { status: 404 })
  }

  await Channels.addMember(channelId, memberId, role)

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

  const access = await requireChannelAccess(channelId, auth.projectId, auth.memberId, auth.rank, true)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Check if target is the channel owner (can't remove them)
  const members = await Channels.getMembers(channelId)
  const target = members.find((m: any) => m.member_id === memberId)

  if (!target) {
    return NextResponse.json({ error: 'Member is not in this channel' }, { status: 404 })
  }

  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove channel owner' }, { status: 403 })
  }

  await Channels.removeMember(channelId, memberId)

  return NextResponse.json({ ok: true, removed: memberId })
}
