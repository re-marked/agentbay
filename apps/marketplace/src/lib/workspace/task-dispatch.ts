import { tasks } from '@trigger.dev/sdk/v3'
import { Tasks, Channels, Messages, Members, Agents } from '@agentbay/db/primitives'

/**
 * Post a system message to #tasks and link it to the task.
 * Idempotent — skips if task already has a thread_root_id in metadata.
 * Returns the message ID (thread root) or null if channel not found.
 */
export async function announceTask(
  projectId: string,
  taskId: string,
  senderMemberId: string,
  content: string,
): Promise<{ threadRootId: string; channelId: string } | null> {
  // Check if already announced
  const existing = await Tasks.findById(taskId)
  const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
  if (existingMeta.thread_root_id) {
    // Already has a thread — return existing info
    return {
      threadRootId: existingMeta.thread_root_id as string,
      channelId: existing!.channel_id as string,
    }
  }

  // Find #tasks broadcast channel
  const broadcastChannels = await Channels.findBroadcast(projectId, 'tasks')
  const tasksChannel = broadcastChannels[0]
  if (!tasksChannel) return null

  // Post announcement message
  const msgId = await Messages.send(tasksChannel.id, senderMemberId, content, {
    kind: 'system',
    depth: 0,
  })

  // Link task to channel and store the thread root message ID in metadata
  await Tasks.update(taskId, {
    channelId: tasksChannel.id,
    metadata: { ...existingMeta, thread_root_id: msgId },
  })

  return { threadRootId: msgId, channelId: tasksChannel.id }
}

/**
 * Dispatch a task to the assigned agent via Trigger.dev background task.
 * Resolves member → instance, verifies agent is running, triggers background task.
 */
export async function dispatchTaskToAssignee(
  memberId: string,
  taskId: string,
  title: string,
  description: string | null,
  priority: string,
  channelId: string,
  threadRootId: string,
): Promise<void> {
  // Resolve member → instance
  const instanceId = await Members.resolveInstance(memberId)
  if (!instanceId) {
    console.log('[task-dispatch] dispatchTaskToAssignee: member has no instance_id', { memberId })
    return
  }

  const instance = await Agents.getInstance(instanceId)
  if (!instance || instance.status !== 'running') {
    console.log('[task-dispatch] dispatchTaskToAssignee: agent not running', { instanceId, status: instance?.status })
    return
  }

  // Update last_dispatched_at in task metadata
  const task = await Tasks.findById(taskId)
  const metadata = (task?.metadata ?? {}) as Record<string, unknown>
  await Tasks.update(taskId, {
    metadata: { ...metadata, last_dispatched_at: new Date().toISOString() },
  })

  // Trigger the background dispatch task
  await tasks.trigger('dispatch-task-to-agent', {
    taskId,
    instanceId,
    agentMemberId: memberId,
    channelId,
    threadRootId,
    title,
    description,
    priority,
  })
}

/**
 * Full pipeline: announce in #tasks + dispatch to assignee.
 * Called from: createTask server action, updateTask server action,
 *              agent tasks API POST, agent tasks API PATCH.
 */
export async function announceAndDispatchTask(
  projectId: string,
  task: {
    id: string
    title: string
    description: string | null
    priority: string
    assignedTo: string | null
    createdBy: string
  },
): Promise<{ threadRootId: string; channelId: string } | null> {
  // Resolve assignee display name for announcement
  let assigneeName = ''
  if (task.assignedTo) {
    const assignee = await Members.findById(task.assignedTo)
    assigneeName = assignee?.display_name ?? 'someone'
  }

  const announcement = task.assignedTo
    ? `📋 New task: **${task.title}** → @"${assigneeName}"${task.priority && task.priority !== 'normal' ? ` [${task.priority}]` : ''}`
    : `📋 New task: **${task.title}**${task.priority && task.priority !== 'normal' ? ` [${task.priority}]` : ''} (unassigned)`

  const result = await announceTask(projectId, task.id, task.createdBy, announcement)
  console.log('[task-dispatch] announceTask result:', result ? { channelId: result.channelId, threadRootId: result.threadRootId } : null)

  // Dispatch to assigned agent via Trigger.dev
  if (task.assignedTo && result) {
    console.log('[task-dispatch] dispatching to agent:', task.assignedTo)
    try {
      await dispatchTaskToAssignee(
        task.assignedTo,
        task.id,
        task.title,
        task.description,
        task.priority,
        result.channelId,
        result.threadRootId,
      )
      console.log('[task-dispatch] dispatch triggered successfully')
    } catch (err) {
      console.error('[task-dispatch] dispatch failed:', err)
    }
  } else {
    console.log('[task-dispatch] skipping dispatch:', { assignedTo: task.assignedTo, hasResult: !!result })
  }

  return result
}
