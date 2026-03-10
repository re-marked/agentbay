import { tasks } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Post a system message to #tasks and link it to the task.
 * Idempotent — skips if task already has a thread_root_id in metadata.
 * Returns the message ID (thread root) or null if channel not found.
 */
export async function announceTask(
  db: SupabaseClient,
  projectId: string,
  taskId: string,
  senderMemberId: string,
  content: string,
): Promise<{ threadRootId: string; channelId: string } | null> {
  // Check if already announced
  const { data: existing } = await db
    .from('tasks')
    .select('metadata')
    .eq('id', taskId)
    .single()

  const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
  if (existingMeta.thread_root_id) {
    // Already has a thread — return existing info
    const { data: task } = await db
      .from('tasks')
      .select('channel_id')
      .eq('id', taskId)
      .single()
    return {
      threadRootId: existingMeta.thread_root_id as string,
      channelId: task?.channel_id as string,
    }
  }

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
      metadata: { ...existingMeta, thread_root_id: msg.id },
    })
    .eq('id', taskId)

  return { threadRootId: msg.id, channelId: tasksChannel.id }
}

/**
 * Dispatch a task to the assigned agent via Trigger.dev background task.
 * Resolves member → instance, verifies agent is running, triggers background task.
 */
export async function dispatchTaskToAssignee(
  db: SupabaseClient,
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
    console.log('[task-dispatch] dispatchTaskToAssignee: member has no instance_id', { memberId })
    return
  }

  const { data: instance } = await db
    .from('agent_instances')
    .select('id, status')
    .eq('id', member.instance_id)
    .single()

  if (!instance || instance.status !== 'running') {
    console.log('[task-dispatch] dispatchTaskToAssignee: agent not running', { instanceId: member.instance_id, status: instance?.status })
    return
  }

  // Update last_dispatched_at in task metadata
  const { data: task } = await db
    .from('tasks')
    .select('metadata')
    .eq('id', taskId)
    .single()

  const metadata = (task?.metadata ?? {}) as Record<string, unknown>
  await db
    .from('tasks')
    .update({
      metadata: { ...metadata, last_dispatched_at: new Date().toISOString() },
    })
    .eq('id', taskId)

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

/**
 * Full pipeline: announce in #tasks + dispatch to assignee.
 * Called from: createTask server action, updateTask server action,
 *              agent tasks API POST, agent tasks API PATCH.
 */
export async function announceAndDispatchTask(
  db: SupabaseClient,
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
    const { data: assignee } = await db
      .from('members')
      .select('display_name')
      .eq('id', task.assignedTo)
      .single()
    assigneeName = assignee?.display_name ?? 'someone'
  }

  const announcement = task.assignedTo
    ? `📋 New task: **${task.title}** → @"${assigneeName}"${task.priority && task.priority !== 'normal' ? ` [${task.priority}]` : ''}`
    : `📋 New task: **${task.title}**${task.priority && task.priority !== 'normal' ? ` [${task.priority}]` : ''} (unassigned)`

  const result = await announceTask(db, projectId, task.id, task.createdBy, announcement)
  console.log('[task-dispatch] announceTask result:', result ? { channelId: result.channelId, threadRootId: result.threadRootId } : null)

  // Dispatch to assigned agent via Trigger.dev
  if (task.assignedTo && result) {
    console.log('[task-dispatch] dispatching to agent:', task.assignedTo)
    try {
      await dispatchTaskToAssignee(
        db,
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
