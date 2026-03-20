import { cache } from 'react'
import { cookies } from 'next/headers'
import { Agents, Corporations, Projects } from '@agentbay/db/primitives'
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
  const corps = await Corporations.findByUser(userId)

  if (corps.length > 0) {
    return { corporationId: corps[0].id, corporations: corps }
  }

  const corporationId = await Corporations.create(userId, 'My Corporation', 'Your personal corporation')

  const newCorps = await Corporations.findByUser(userId)
  return { corporationId, corporations: newCorps }
}

/**
 * Resolve the active project ID from the cookie, falling back to the first project.
 * Ensures corporation and project exist.
 */
export const getActiveProjectId = cache(async function getActiveProjectId(userId: string) {
  // 1. Ensure corporation exists
  const { corporationId, corporations } = await ensureCorporation(userId)

  // 2. Get projects for this corporation
  let userProjects = await Projects.listByCorporation(corporationId)

  // Also pick up legacy projects (no corporation_id) and link them
  const orphanProjects = await Projects.findOrphans(userId)

  if (orphanProjects.length > 0) {
    const orphanIds = orphanProjects.map(p => p.id)
    await Projects.linkToCorporation(orphanIds, corporationId)
    userProjects = [...userProjects, ...orphanProjects]
  }

  // 3. Create default project if none exist
  if (userProjects.length === 0) {
    const newProjectId = await Projects.create({
      name: 'My Workspace',
      description: 'Your first project',
      userId,
      corporationId,
    })
    userProjects = [{ id: newProjectId, name: 'My Workspace', description: 'Your first project' }]
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
})

/**
 * Load agent instances for the user via the Agents primitive.
 */
export const getProjectAgents = cache(async function getProjectAgents(userId: string, _activeProjectId: string | null) {
  const instances = await Agents.listInstances(userId)
  if (instances.length === 0) return []
  return instances as unknown as ProjectAgentInstance[]
})

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
