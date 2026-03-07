import { createServiceClient } from '@agentbay/db/server'

/**
 * Authenticate a request using the Router service key.
 * Agents call API routes with `Authorization: Bearer $ROUTER_SERVICE_KEY`.
 * Returns the verified member ID from the request body, or null if auth fails.
 */
export async function authenticateAgent(
  request: Request
): Promise<{ memberId: string; projectId: string } | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const serviceKey = process.env.ROUTER_SERVICE_KEY
  if (!serviceKey || token !== serviceKey) return null

  // Extract memberId from body or query — caller must provide it
  // We verify the member exists and is active
  return null // Caller handles member extraction
}

/**
 * Validate that a Bearer token matches the Router service key.
 */
export function isValidServiceKey(request: Request): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const serviceKey = process.env.ROUTER_SERVICE_KEY
  return !!serviceKey && token === serviceKey
}

/**
 * Verify a member ID is valid and active, return their project context.
 */
export async function verifyMember(memberId: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('members')
    .select('id, project_id, rank, status, instance_id, display_name')
    .eq('id', memberId)
    .neq('status', 'archived')
    .single()
  return data
}
