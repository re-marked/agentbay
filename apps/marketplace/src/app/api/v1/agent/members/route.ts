import { NextRequest, NextResponse } from 'next/server'
import { Members } from '@agentbay/db/primitives'
import { authenticateAgent } from '@/lib/auth/service-key'

/**
 * GET /api/v1/agent/members — List all active members in the project
 * Lets agents discover who else is in the project (for inviting to channels, assigning tasks, etc.)
 */

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const members = await Members.listActive(auth.projectId)

  const result = members.map(m => ({
    id: m.id,
    displayName: m.display_name,
    rank: m.rank,
    status: m.status,
    type: m.instance_id ? 'agent' : 'user',
  }))

  return NextResponse.json({ members: result })
}
