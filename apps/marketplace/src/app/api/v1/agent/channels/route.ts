import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET  /api/v1/agent/channels — List channels the agent is a member of
 * POST /api/v1/agent/channels — Create a new channel
 * PATCH /api/v1/agent/channels — Update channel settings (name, description, pinned, archived)
 */

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = createServiceClient()

  const { data: memberships, error } = await db
    .from('channel_members')
    .select('channels!inner(id, name, kind, description, pinned, archived)')
    .eq('member_id', auth.memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const channels = (memberships ?? []).map((m: any) => ({
    id: m.channels.id,
    name: m.channels.name,
    kind: m.channels.kind,
    description: m.channels.description,
    pinned: m.channels.pinned,
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

  // Only master/leader can create broadcast channels
  if (kind === 'broadcast' && !['master', 'leader'].includes(auth.rank)) {
    return NextResponse.json({ error: 'Only master or leader can create broadcast channels' }, { status: 403 })
  }

  const db = createServiceClient()

  // For broadcast/team channels, check if one with the same name already exists
  if (kind === 'broadcast' || kind === 'team') {
    const { data: existing } = await db
      .from('channels')
      .select('id, name, kind, description')
      .eq('project_id', auth.projectId)
      .eq('name', name)
      .eq('kind', kind)
      .eq('archived', false)
      .maybeSingle()

    if (existing) {
      // Ensure agent is a member, then return existing channel
      await db
        .from('channel_members')
        .upsert(
          { channel_id: existing.id, member_id: auth.memberId, role: 'participant' },
          { onConflict: 'channel_id,member_id', ignoreDuplicates: true }
        )
      return NextResponse.json(existing, { status: 200 })
    }
  }

  // For direct channels, enforce exactly 1 other member and check for existing DM
  if (kind === 'direct') {
    if (members.length !== 1) {
      return NextResponse.json({ error: 'Direct channels require exactly 1 other member' }, { status: 400 })
    }

    // Find all DM channels this agent is in
    const { data: myDms } = await db
      .from('channel_members')
      .select('channel_id, channels!inner(kind, project_id, archived)')
      .eq('member_id', auth.memberId)

    if (myDms) {
      const dmChannelIds = myDms
        .filter((m: any) =>
          m.channels.kind === 'direct' &&
          m.channels.project_id === auth.projectId &&
          !m.channels.archived
        )
        .map((m: any) => m.channel_id)

      if (dmChannelIds.length > 0) {
        const { data: sharedDms } = await db
          .from('channel_members')
          .select('channel_id')
          .eq('member_id', members[0])
          .in('channel_id', dmChannelIds)

        if (sharedDms && sharedDms.length > 0) {
          return NextResponse.json({
            error: 'A direct channel already exists between these members',
            existingChannelId: sharedDms[0].channel_id,
          }, { status: 409 })
        }
      }
    }
  }

  // Create the channel
  const { data: channel, error } = await db
    .from('channels')
    .insert({
      project_id: auth.projectId,
      name,
      kind,
      description: description ?? null,
    })
    .select('id, name, kind, description, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add creator as owner
  await db.from('channel_members').insert({
    channel_id: channel.id,
    member_id: auth.memberId,
    role: 'owner',
  })

  // Add listed members as participants
  if (members.length > 0) {
    const memberRows = members.map((memberId: string) => ({
      channel_id: channel.id,
      member_id: memberId,
      role: 'participant' as const,
    }))
    await db.from('channel_members').insert(memberRows)
  }

  return NextResponse.json(channel, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { channelId, ...updates } = body

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
  }

  const db = createServiceClient()

  // Check the channel exists in this project
  const { data: channel } = await db
    .from('channels')
    .select('id, kind, project_id')
    .eq('id', channelId)
    .eq('project_id', auth.projectId)
    .single()

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  // Check permission: must be channel owner OR master/leader rank
  const { data: membership } = await db
    .from('channel_members')
    .select('role')
    .eq('channel_id', channelId)
    .eq('member_id', auth.memberId)
    .single()

  const isOwner = membership?.role === 'owner'
  const isPrivileged = ['master', 'leader'].includes(auth.rank)

  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: 'Only channel owner or master/leader can update channels' }, { status: 403 })
  }

  // Build allowed updates
  const allowed: Record<string, unknown> = {}
  if (updates.name !== undefined) allowed.name = updates.name
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.pinned !== undefined) allowed.pinned = updates.pinned
  if (updates.archived !== undefined) allowed.archived = updates.archived

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

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
