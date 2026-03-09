import { createServiceClient } from '@agentbay/db/server'

export interface TaskRow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to: string | null
  created_by: string | null
  team_id: string | null
  parent_task_id: string | null
  due_at: string | null
  started_at: string | null
  completed_at: string | null
  result: unknown
  metadata: unknown
  created_at: string
  updated_at: string
}

export interface TaskWithAssignee extends TaskRow {
  assignee: { id: string; display_name: string; instance_id: string | null } | null
  creator: { id: string; display_name: string } | null
}

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
  const db = createServiceClient()

  const { data, error } = await db
    .from('tasks')
    .select(`
      id, title, description, status, priority,
      assigned_to, created_by, team_id, parent_task_id,
      due_at, started_at, completed_at, result, metadata,
      created_at, updated_at,
      assignee:members!tasks_assigned_to_fkey(id, display_name, instance_id),
      creator:members!tasks_created_by_fkey(id, display_name)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[task-queries] getProjectTasks failed:', error.message)
    return []
  }

  return (data ?? []).map((row: any) => ({
    ...row,
    assignee: row.assignee ?? null,
    creator: row.creator ?? null,
  }))
}

/**
 * Load project members for the assignee picker.
 */
export async function getProjectMembersForPicker(projectId: string): Promise<ProjectMemberOption[]> {
  const db = createServiceClient()

  const { data, error } = await db
    .from('members')
    .select('id, display_name, instance_id, user_id')
    .eq('project_id', projectId)
    .neq('status', 'archived')
    .order('display_name', { ascending: true })

  if (error) {
    console.error('[task-queries] getProjectMembers failed:', error.message)
    return []
  }

  // Get icon URLs for agents
  const agentInstanceIds = (data ?? [])
    .filter(m => m.instance_id)
    .map(m => m.instance_id!)

  let iconMap: Record<string, string | null> = {}
  if (agentInstanceIds.length > 0) {
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

  return (data ?? []).map(m => ({
    id: m.id,
    displayName: m.display_name ?? 'Unknown',
    type: (m.instance_id ? 'agent' : 'user') as 'user' | 'agent',
    iconUrl: m.instance_id ? (iconMap[m.instance_id] ?? null) : null,
  }))
}
