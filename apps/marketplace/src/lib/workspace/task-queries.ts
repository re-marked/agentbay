import { Tasks, Members } from '@agentbay/db/primitives'
import { createServiceClient } from '@agentbay/db/server'

/** Return type from Tasks.list — task with joined assignee/creator. */
export type TaskWithAssignee = Awaited<ReturnType<typeof Tasks.list>>[number]

export interface ProjectMemberOption {
  id: string
  displayName: string
  type: 'user' | 'agent'
  iconUrl: string | null
}

/**
 * Load all tasks for a project, with assignee and creator info.
 */
export async function getProjectTasks(projectId: string): Promise<TaskWithAssignee[]> {
  return Tasks.list(projectId)
}

/**
 * Load project members for the assignee picker.
 */
export async function getProjectMembersForPicker(projectId: string): Promise<ProjectMemberOption[]> {
  const members = await Members.listActive(projectId)

  // Get icon URLs for agents (icon_url lives in legacy agents table, not in primitives)
  const agentInstanceIds = members
    .filter(m => m.instance_id)
    .map(m => m.instance_id!)

  let iconMap: Record<string, string | null> = {}
  if (agentInstanceIds.length > 0) {
    const db = createServiceClient()
    const { data: instances } = await db
      .from('agent_instances')
      .select('id, agents!inner(icon_url)')
      .in('id', agentInstanceIds)

    if (instances) {
      for (const inst of instances) {
        const agent = (inst as any).agents as { icon_url: string | null }
        iconMap[inst.id] = agent?.icon_url ?? null
      }
    }
  }

  return members.map(m => ({
    id: m.id,
    displayName: m.display_name ?? 'Unknown',
    type: (m.instance_id ? 'agent' : 'user') as 'user' | 'agent',
    iconUrl: m.instance_id ? (iconMap[m.instance_id] ?? null) : null,
  }))
}
