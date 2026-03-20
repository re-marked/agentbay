'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth/get-user'
import { getActiveProjectId } from '@/lib/projects/queries'
import { Tasks } from '@agentbay/db/primitives'
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

  // 1. Insert task
  const taskId = await Tasks.create(activeProjectId, {
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? 'normal',
    assignedTo: data.assignedTo ?? null,
    createdBy: userMemberId,
  })

  // 2. Announce in #tasks + dispatch to assignee
  await announceAndDispatchTask(activeProjectId, {
    id: taskId,
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

  await Tasks.update(taskId, {
    title: updates.title,
    description: updates.description,
    status: updates.status,
    priority: updates.priority,
    assignedTo: updates.assignedTo,
    dueAt: updates.dueAt,
  })

  // If assignee changed, announce + dispatch
  if (updates.assignedTo) {
    const task = await Tasks.findById(taskId)

    if (task) {
      const metadata = (task.metadata ?? {}) as Record<string, unknown>
      const threadRootId = metadata.thread_root_id as string | undefined
      const channelId = task.channel_id as string | undefined

      if (threadRootId && channelId) {
        // Already has thread → just dispatch to new assignee
        await dispatchTaskToAssignee(
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
        await announceAndDispatchTask(activeProjectId, {
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

  await Tasks.remove(taskId, activeProjectId)

  revalidatePath('/workspace/tasks')
}
