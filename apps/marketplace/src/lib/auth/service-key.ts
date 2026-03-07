import { createServiceClient } from '@agentbay/db/server'
import { NextRequest } from 'next/server'

/**
 * Validate an agent's service key and extract its identity.
 * Agents pass: Authorization: Bearer <ROUTER_SERVICE_KEY>
 * Plus headers: X-Agent-Member-Id, X-Agent-Project-Id
 */
export async function authenticateAgent(req: NextRequest): Promise<
  | { ok: true; memberId: string; projectId: string }
  | { ok: false; error: string; status: number }
> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Missing Authorization header', status: 401 }
  }

  const token = authHeader.slice(7)
  const expectedKey = process.env.ROUTER_SERVICE_KEY
  if (!expectedKey || token !== expectedKey) {
    return { ok: false, error: 'Invalid service key', status: 403 }
  }

  const memberId = req.headers.get('x-agent-member-id')
  const projectId = req.headers.get('x-agent-project-id')

  if (!memberId || !projectId) {
    return { ok: false, error: 'Missing X-Agent-Member-Id or X-Agent-Project-Id headers', status: 400 }
  }

  // Verify the member actually exists in this project
  const db = createServiceClient()
  const { data: member } = await db
    .from('members')
    .select('id, status')
    .eq('id', memberId)
    .eq('project_id', projectId)
    .single()

  if (!member) {
    return { ok: false, error: 'Member not found in project', status: 403 }
  }

  if (member.status !== 'active') {
    return { ok: false, error: 'Member is not active', status: 403 }
  }

  return { ok: true, memberId, projectId }
}
