import { NextResponse } from 'next/server'
import { isValidServiceKey } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// GET /api/v1/agent/channels/:channelId/members
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = await params
  const service = createServiceClient()

  const { data, error } = await service
    .from('channel_members')
    .select('member_id, role, members!inner(id, display_name, rank, status, instance_id)')
    .eq('channel_id', channelId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const members = (data ?? []).map((cm: any) => ({
    memberId: cm.members.id,
    displayName: cm.members.display_name,
    rank: cm.members.rank,
    status: cm.members.status,
    isAgent: cm.members.instance_id != null,
    role: cm.role,
  }))

  return NextResponse.json({ members })
}
