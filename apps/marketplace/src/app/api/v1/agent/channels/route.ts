import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET /api/v1/agent/channels — List channels the agent is a member of
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = createServiceClient()

  const { data: memberships, error } = await db
    .from('channel_members')
    .select('channels!inner(id, name, kind)')
    .eq('member_id', auth.memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const channels = (memberships ?? []).map((m: any) => ({
    id: m.channels.id,
    name: m.channels.name,
    kind: m.channels.kind,
  }))

  return NextResponse.json({ channels })
}
