'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { getActiveProjectId } from '@/lib/projects/queries'
import { announceAndDispatchTask, dispatchTaskToAssignee } from './task-dispatch'

export async function createTask(data: {
  title: string
  description?: string
  priority?: string
  assignedTo?: string
}) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const { activeProjectId, userMemberId } = await getActiveProjectId(user.id)
  if (!activeProjectId || !userMemberId) throw new Error('No active project')

  const db = createServiceClient()

  // 1. Insert task
  const { data: task, error } = await db.from('tasks').insert({
    project_id: activeProjectId,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? 'normal',
    status: data.assignedTo ? 'assigned' : 'pending',
    assigned_to: data.assignedTo ?? null,
    created_by: userMemberId,
  }).select('id').single()

  if (error || !task) throw new Error(error?.message ?? 'Failed to create task')

  // 2. Announce in #tasks + dispatch to assignee
  await announceAndDispatchTask(db, activeProjectId, {
    id: task.id,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? 'normal',
    assignedTo: data.assignedTo ?? null,
    createdBy: userMemberId,
  })

  revalidatePath('/workspace/tasks')
}

export async function updateTask(
  taskId: string,
  updates: {
    title?: string
    description?: string | null
    status?: string
    priority?: string
    assignedTo?: string | null
    dueAt?: string | null
  }
) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const { activeProjectId, userMemberId } = await getActiveProjectId(user.id)
  if (!activeProjectId || !userMemberId) throw new Error('No active project')

  const db = createServiceClient()

  const allowed: Record<string, unknown> = {}
  if (updates.title !== undefined) allowed.title = updates.title
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.status !== undefined) {
    allowed.status = updates.status
    if (updates.status === 'in_progress') {
      allowed.started_at = new Date().toISOString()
    }
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'cancelled') {
      allowed.completed_at = new Date().toISOString()
    }
  }
  if (updates.priority !== undefined) allowed.priority = updates.priority
  if (updates.assignedTo !== undefined) {
    allowed.assigned_to = updates.assignedTo
    // If assigning and status is pending, auto-advance to assigned
    if (updates.assignedTo && !updates.status) {
      allowed.status = 'assigned'
    }
  }
  if (updates.dueAt !== undefined) allowed.due_at = updates.dueAt

  if (Object.keys(allowed).length === 0) return

  const { error } = await db
    .from('tasks')
    .update(allowed)
    .eq('id', taskId)
    .eq('project_id', activeProjectId)

  if (error) throw new Error(error.message)

  // If assignee changed, announce + dispatch
  if (updates.assignedTo) {
    const { data: task } = await db
      .from('tasks')
      .select('title, description, priority, channel_id, metadata')
      .eq('id', taskId)
      .single()

    if (task) {
      const metadata = (task.metadata ?? {}) as Record<string, unknown>
      const threadRootId = metadata.thread_root_id as string | undefined
      const channelId = task.channel_id as string | undefined

      if (threadRootId && channelId) {
        // Already has thread → just dispatch to new assignee
        await dispatchTaskToAssignee(
          db,
          updates.assignedTo,
          taskId,
          task.title,
          task.description,
          task.priority,
          channelId,
          threadRootId,
        )
      } else {
        // No thread yet → full announce + dispatch
        await announceAndDispatchTask(db, activeProjectId, {
          id: taskId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          assignedTo: updates.assignedTo,
          createdBy: userMemberId!,
        })
      }
    }
  }

  revalidatePath('/workspace/tasks')
}

export async function deleteTask(taskId: string) {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')

  const { activeProjectId } = await getActiveProjectId(user.id)
  if (!activeProjectId) throw new Error('No active project')

  const db = createServiceClient()

  const { error } = await db
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('project_id', activeProjectId)

  if (error) throw new Error(error.message)

  revalidatePath('/workspace/tasks')
}
