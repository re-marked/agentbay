'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { getActiveProjectId } from '@/lib/projects/queries'
import { tasks } from '@trigger.dev/sdk/v3'

/**
 * Post a system message to #tasks and link it to the task.
 * Returns the message ID (thread root) or null if channel not found.
 */
async function announceTask(
  db: ReturnType<typeof createServiceClient>,
  projectId: string,
  taskId: string,
  senderMemberId: string,
  content: string,
): Promise<{ threadRootId: string; channelId: string } | null> {
  // Find #tasks broadcast channel
  const { data: tasksChannel } = await db
    .from('channels')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', 'tasks')
    .eq('kind', 'broadcast')
    .maybeSingle()

  if (!tasksChannel) return null

  // Post announcement message
  const { data: msg } = await db
    .from('channel_messages')
    .insert({
      channel_id: tasksChannel.id,
      sender_id: senderMemberId,
      content,
      message_kind: 'system',
      depth: 0,
    })
    .select('id')
    .single()

  if (!msg) return null

  // Link task to channel and store the thread root message ID in metadata
  await db
    .from('tasks')
    .update({
      channel_id: tasksChannel.id,
      metadata: { thread_root_id: msg.id },
    })
    .eq('id', taskId)

  return { threadRootId: msg.id, channelId: tasksChannel.id }
}

/**
 * Dispatch a task to the assigned agent via Trigger.dev background task.
 * The agent works on it and the response is persisted as a thread reply.
 */
async function dispatchTaskToAssignee(
  db: ReturnType<typeof createServiceClient>,
  memberId: string,
  taskId: string,
  title: string,
  description: string | null,
  priority: string,
  channelId: string,
  threadRootId: string,
): Promise<void> {
  // Resolve member → instance
  const { data: member } = await db
    .from('members')
    .select('instance_id')
    .eq('id', memberId)
    .single()

  if (!member?.instance_id) {
    console.log('[task-actions] dispatchTaskToAssignee: member has no instance_id', { memberId })
    return
  }

  const { data: instance } = await db
    .from('agent_instances')
    .select('id, status')
    .eq('id', member.instance_id)
    .single()

  if (!instance || instance.status !== 'running') {
    console.log('[task-actions] dispatchTaskToAssignee: agent not running', { instanceId: member.instance_id, status: instance?.status })
    return
  }

  // Trigger the background dispatch task
  await tasks.trigger('dispatch-task-to-agent', {
    taskId,
    instanceId: member.instance_id,
    agentMemberId: memberId,
    channelId,
    threadRootId,
    title,
    description,
    priority,
  })
}

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

  // 2. Announce in #tasks channel
  let assigneeName = ''
  if (data.assignedTo) {
    const { data: assignee } = await db
      .from('members')
      .select('display_name')
      .eq('id', data.assignedTo)
      .single()
    assigneeName = assignee?.display_name ?? 'someone'
  }

  const announcement = data.assignedTo
    ? `📋 New task: **${data.title}** → assigned to **${assigneeName}**${data.priority && data.priority !== 'normal' ? ` [${data.priority}]` : ''}`
    : `📋 New task: **${data.title}**${data.priority && data.priority !== 'normal' ? ` [${data.priority}]` : ''} (unassigned)`

  const result = await announceTask(db, activeProjectId, task.id, userMemberId, announcement)
  console.log('[task-actions] announceTask result:', result ? { channelId: result.channelId, threadRootId: result.threadRootId } : null)

  // 3. Dispatch to assigned agent via Trigger.dev
  if (data.assignedTo && result) {
    console.log('[task-actions] dispatching to agent:', data.assignedTo)
    try {
      await dispatchTaskToAssignee(
        db,
        data.assignedTo,
        task.id,
        data.title,
        data.description ?? null,
        data.priority ?? 'normal',
        result.channelId,
        result.threadRootId,
      )
      console.log('[task-actions] dispatch triggered successfully')
    } catch (err) {
      console.error('[task-actions] dispatch failed:', err)
    }
  } else {
    console.log('[task-actions] skipping dispatch:', { assignedTo: data.assignedTo, hasResult: !!result })
  }

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

  const { activeProjectId } = await getActiveProjectId(user.id)
  if (!activeProjectId) throw new Error('No active project')

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

  // If assignee changed, dispatch task to the new assignee
  if (updates.assignedTo) {
    // Load the task's metadata to get thread_root_id and channel_id
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
