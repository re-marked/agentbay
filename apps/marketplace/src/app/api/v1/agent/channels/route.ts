import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { Channels } from '@agentbay/db/primitives'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET  /api/v1/agent/channels — List channels the agent is a member of
 * POST /api/v1/agent/channels — Create a new channel
 * PATCH /api/v1/agent/channels — Update channel settings (name, description, pinned, archived)
 */

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const memberships = await Channels.getMemberChannels(auth.memberId)

  const channels = memberships.map((m: any) => ({
    id: m.channels.id,
    name: m.channels.name,
    kind: m.channels.kind,
    archived: m.channels.archived,
  }))

  return NextResponse.json({ channels })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (auth.rank === 'subagent') {
    return NextResponse.json({ error: 'Subagents cannot create channels' }, { status: 403 })
  }

  const body = await req.json()
  const { name, kind = 'team', description, members = [] } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const validKinds = ['team', 'direct', 'broadcast']
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${validKinds.join(', ')}` }, { status: 400 })
  }

  if (kind === 'broadcast' && !['master', 'leader'].includes(auth.rank)) {
    return NextResponse.json({ error: 'Only master or leader can create broadcast channels' }, { status: 403 })
  }

  // For broadcast/team channels, check if one with the same name already exists
  if (kind === 'broadcast' || kind === 'team') {
    const existing = await Channels.findBroadcast(auth.projectId, name)
    if (existing.length > 0) {
      await Channels.addMember(existing[0].id, auth.memberId, 'participant')
      return NextResponse.json(existing[0], { status: 200 })
    }
  }

  // For direct channels, enforce exactly 1 other member and check for existing DM
  if (kind === 'direct') {
    if (members.length !== 1) {
      return NextResponse.json({ error: 'Direct channels require exactly 1 other member' }, { status: 400 })
    }

    const existingDM = await Channels.findDM(auth.projectId, auth.memberId, members[0])
    if (existingDM) {
      return NextResponse.json({
        error: 'A direct channel already exists between these members',
        existingChannelId: existingDM,
      }, { status: 409 })
    }
  }

  // Create the channel
  const channelId = await Channels.create(auth.projectId, {
    name,
    kind,
    description,
  })

  // Add creator as owner
  await Channels.addMember(channelId, auth.memberId, 'owner')

  // Add listed members as participants
  if (members.length > 0) {
    await Channels.addMembers(channelId, members.map((id: string) => ({ memberId: id })))
  }

  return NextResponse.json({ id: channelId, name, kind, description: description ?? null }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { channelId, ...updates } = body

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
  }

  // Verify channel exists in this project
  const channel = await Channels.findById(channelId)
  if (!channel || channel.project_id !== auth.projectId) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Check permission: must be channel owner OR master/leader rank
  const isMember = await Channels.isMember(channelId, auth.memberId)
  const isPrivileged = ['master', 'leader'].includes(auth.rank)

  if (!isMember && !isPrivileged) {
    return NextResponse.json({ error: 'Only channel owner or master/leader can update channels' }, { status: 403 })
  }

  // Build allowed updates (raw query — no update primitive for channels yet)
  const allowed: Record<string, unknown> = {}
  if (updates.name !== undefined) allowed.name = updates.name
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.pinned !== undefined) allowed.pinned = updates.pinned
  if (updates.archived !== undefined) allowed.archived = updates.archived

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: updated, error } = await db
    .from('channels')
    .update(allowed)
    .eq('id', channelId)
    .select('id, name, kind, description, pinned, archived, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
