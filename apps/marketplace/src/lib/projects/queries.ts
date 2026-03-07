import { cookies } from 'next/headers'
import { createServiceClient } from '@agentbay/db/server'
import { ensureWorkspaceBootstrapped } from '@/lib/workspace/bootstrap'
import { ensureCoFounderHired } from '@/lib/workspace/co-founder'

export interface ProjectAgentInstance {
  id: string
  display_name: string | null
  status: string
  created_at: string
  agents: {
    name: string
    slug: string
    category: string
    tagline: string
    icon_url: string | null
  }
}

/**
 * Ensure a corporation exists for this user. Returns the corporation ID.
 * Creates "My Corporation" with a default "My Workspace" project if none exist.
 */
async function ensureCorporation(userId: string) {
  const service = createServiceClient()

  // Check for existing corporations
  const { data: corps } = await service
    .from('corporations')
    .select('id, name, co_founder_instance_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (corps && corps.length > 0) {
    return { corporationId: corps[0].id, corporations: corps }
  }

  // Create default corporation
  const { data: newCorp } = await service
    .from('corporations')
    .insert({ user_id: userId, name: 'My Corporation', description: 'Your personal corporation' })
    .select('id, name, co_founder_instance_id')
    .single()

  if (!newCorp) {
    // Race condition — another request created it
    const { data: fallback } = await service
      .from('corporations')
      .select('id, name, co_founder_instance_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    return { corporationId: fallback!.id, corporations: [fallback!] }
  }

  return { corporationId: newCorp.id, corporations: [newCorp] }
}

/**
 * Resolve the active project ID from the cookie, falling back to the first project.
 * Ensures corporation and project exist.
 */
export async function getActiveProjectId(userId: string) {
  const service = createServiceClient()

  // 1. Ensure corporation exists
  const { corporationId, corporations } = await ensureCorporation(userId)

  // 2. Get projects for this corporation
  const { data: projects } = await service
    .from('projects')
    .select('id, name, description')
    .eq('corporation_id', corporationId)
    .order('created_at', { ascending: true })

  let userProjects = projects ?? []

  // Also pick up legacy projects (no corporation_id) and link them
  const { data: orphanProjects } = await service
    .from('projects')
    .select('id, name, description')
    .eq('user_id', userId)
    .is('corporation_id', null)

  if (orphanProjects && orphanProjects.length > 0) {
    // Link orphan projects to this corporation
    const orphanIds = orphanProjects.map(p => p.id)
    await service
      .from('projects')
      .update({ corporation_id: corporationId })
      .in('id', orphanIds)
    userProjects = [...userProjects, ...orphanProjects]
  }

  // 3. Create default project if none exist
  if (userProjects.length === 0) {
    const { data: newProject } = await service
      .from('projects')
      .insert({
        name: 'My Workspace',
        description: 'Your first project',
        user_id: userId,
        corporation_id: corporationId,
      })
      .select('id, name, description')
      .single()
    if (newProject) userProjects = [newProject]
  }

  // 4. Resolve active project from cookie
  const cookieStore = await cookies()
  const activeProjectCookie = cookieStore.get('active_project')?.value
  const activeProjectId = userProjects.find(p => p.id === activeProjectCookie)?.id
    ?? userProjects[0]?.id
    ?? null

  // 5. Bootstrap workspace primitives (idempotent — fast after first run)
  let userMemberId: string | null = null
  if (activeProjectId) {
    try {
      const result = await ensureWorkspaceBootstrapped(activeProjectId, userId)
      userMemberId = result.userMemberId
    } catch (e) {
      console.error('[workspace] bootstrap failed:', e)
    }
  }

  // 6. Auto-hire co-founder (idempotent — fast after first run)
  let coFounderInstanceId: string | null = corporations[0]?.co_founder_instance_id ?? null
  if (activeProjectId && userMemberId && !coFounderInstanceId) {
    try {
      const result = await ensureCoFounderHired(userId, corporationId, activeProjectId, userMemberId)
      coFounderInstanceId = result.instanceId
    } catch (e) {
      console.error('[workspace] co-founder auto-hire failed:', e)
    }
  }

  return { corporations, corporationId, projects: userProjects, activeProjectId, userMemberId, coFounderInstanceId }
}

/**
 * Load agent instances for the user.
 * Queries agent_instances directly by user_id.
 */
export async function getProjectAgents(userId: string, _activeProjectId: string | null) {
  const service = createServiceClient()

  const { data: instances } = await service
    .from('agent_instances')
    .select('id, display_name, status, created_at, agents!inner(name, slug, category, tagline, icon_url)')
    .eq('user_id', userId)
    .not('status', 'in', '("destroyed","destroying")')
    .order('created_at', { ascending: false })

  if (!instances || instances.length === 0) return []

  return instances as unknown as ProjectAgentInstance[]
}

/**
 * Map raw DB instances to the AgentInfo shape used by components.
 */
export function toAgentInfoList(instances: ProjectAgentInstance[]) {
  return instances.map((inst) => {
    const agent = inst.agents
    return {
      instanceId: inst.id,
      name: inst.display_name ?? agent.name,
      slug: agent.slug,
      category: agent.category,
      tagline: agent.tagline,
      status: inst.status,
      iconUrl: agent.icon_url,
    }
  })
}
