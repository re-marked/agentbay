import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface CreateTaskOpts {
  title: string
  description?: string | null
  priority?: string
  assignedTo?: string | null
  createdBy: string
  teamId?: string | null
}

export interface UpdateTaskOpts {
  title?: string
  description?: string | null
  status?: string
  priority?: string
  assignedTo?: string | null
  dueAt?: string | null
  channelId?: string
  metadata?: Record<string, unknown>
}

// ─── Reads ───────────────────────────────────────────────────────────

/** Find a task by ID. */
export async function findById(taskId: string) {
  const { data } = await db()
    .from('tasks')
    .select('id, project_id, title, description, status, priority, assigned_to, created_by, team_id, channel_id, parent_task_id, due_at, started_at, completed_at, result, metadata, created_at, updated_at')
    .eq('id', taskId)
    .maybeSingle()
  return data
}

/** List tasks for a project, with assignee and creator info. */
export async function list(projectId: string) {
  const { data } = await db()
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

  return (data ?? []).map((row: any) => ({
    ...row,
    assignee: row.assignee ?? null,
    creator: row.creator ?? null,
  }))
}

/** List tasks with specific filters (for agent API / heartbeat). */
export async function listFiltered(
  projectId: string,
  filters?: { status?: string; priority?: string; assignedTo?: string }
) {
  let q = db()
    .from('tasks')
    .select('id, title, description, status, priority, assigned_to, created_by, team_id, channel_id, metadata, created_at, updated_at')
    .eq('project_id', projectId)

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.priority) q = q.eq('priority', filters.priority)
  if (filters?.assignedTo) q = q.eq('assigned_to', filters.assignedTo)

  const { data } = await q.order('created_at', { ascending: false })
  return data ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────

/** Create a task. Returns the task ID. */
export async function create(projectId: string, opts: CreateTaskOpts): Promise<string> {
  const { data, error } = await db()
    .from('tasks')
    .insert({
      project_id: projectId,
      title: opts.title,
      description: opts.description ?? null,
      priority: opts.priority ?? 'normal',
      status: opts.assignedTo ? 'assigned' : 'pending',
      assigned_to: opts.assignedTo ?? null,
      created_by: opts.createdBy,
      team_id: opts.teamId ?? null,
    })
    .select('id')
    .single()

  if (!data) throw new Error(`Failed to create task: ${error?.message}`)
  return data.id
}

/** Update a task. Handles status timestamps automatically. */
export async function update(taskId: string, updates: UpdateTaskOpts) {
  const allowed: Record<string, unknown> = {}

  if (updates.title !== undefined) allowed.title = updates.title
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.priority !== undefined) allowed.priority = updates.priority
  if (updates.channelId !== undefined) allowed.channel_id = updates.channelId
  if (updates.dueAt !== undefined) allowed.due_at = updates.dueAt

  if (updates.status !== undefined) {
    allowed.status = updates.status
    if (updates.status === 'in_progress') {
      allowed.started_at = new Date().toISOString()
    }
    if (['completed', 'failed', 'cancelled'].includes(updates.status)) {
      allowed.completed_at = new Date().toISOString()
    }
  }

  if (updates.assignedTo !== undefined) {
    allowed.assigned_to = updates.assignedTo
    // Auto-advance to assigned if currently pending
    if (updates.assignedTo && !updates.status) {
      allowed.status = 'assigned'
    }
  }

  if (updates.metadata !== undefined) {
    allowed.metadata = updates.metadata
  }

  if (Object.keys(allowed).length === 0) return

  const { error } = await db()
    .from('tasks')
    .update(allowed)
    .eq('id', taskId)

  if (error) throw new Error(`Failed to update task: ${error.message}`)
}

/** Delete a task. */
export async function remove(taskId: string, projectId: string) {
  const { error } = await db()
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('project_id', projectId)

  if (error) throw new Error(`Failed to delete task: ${error.message}`)
}
