import { cookies } from 'next/headers'
import { createServiceClient } from '@agentbay/db/server'
import { ensureWorkspaceBootstrapped } from '@/lib/workspace/bootstrap'

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
 * Resolve the active project ID from the cookie, falling back to the first project.
 */
export async function getActiveProjectId(userId: string) {
  const service = createServiceClient()

  const { data: projects } = await service
    .from('projects')
    .select('id, name, description')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  let userProjects = projects ?? []
  if (userProjects.length === 0) {
    const { data: newProject } = await service
      .from('projects')
      .insert({ name: 'My Workspace', description: 'Personal', user_id: userId })
      .select('id, name, description')
      .single()
    if (newProject) userProjects = [newProject]
  }

  const cookieStore = await cookies()
  const activeProjectCookie = cookieStore.get('active_project')?.value
  const activeProjectId = userProjects.find(p => p.id === activeProjectCookie)?.id
    ?? userProjects[0]?.id
    ?? null

  // Bootstrap workspace primitives (idempotent — fast after first run)
  let userMemberId: string | null = null
  if (activeProjectId) {
    try {
      const result = await ensureWorkspaceBootstrapped(activeProjectId, userId)
      userMemberId = result.userMemberId
    } catch (e) {
      console.error('[workspace] bootstrap failed:', e)
    }
  }

  return { projects: userProjects, activeProjectId, userMemberId }
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
