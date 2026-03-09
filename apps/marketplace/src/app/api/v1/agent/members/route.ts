import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET /api/v1/agent/members — List all active members in the project
 * Lets agents discover who else is in the project (for inviting to channels, assigning tasks, etc.)
 */

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = createServiceClient()

  const { data: members, error } = await db
    .from('members')
    .select('id, display_name, rank, status, instance_id, created_at')
    .eq('project_id', auth.projectId)
    .neq('status', 'archived')
    .order('rank', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (members ?? []).map((m: any) => ({
    id: m.id,
    displayName: m.display_name,
    rank: m.rank,
    status: m.status,
    type: m.instance_id ? 'agent' : 'user',
    createdAt: m.created_at,
  }))

  return NextResponse.json({ members: result })
}
