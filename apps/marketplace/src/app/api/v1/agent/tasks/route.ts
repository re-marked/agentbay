import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { Tasks } from '@agentbay/db/primitives'
import { authenticateAgent } from '@/lib/auth/service-key'
import { announceAndDispatchTask, dispatchTaskToAssignee } from '@/lib/workspace/task-dispatch'

/**
 * POST /api/v1/agent/tasks — Create a task
 * GET  /api/v1/agent/tasks?status=pending&priority=high&assignee=me — List tasks
 * PATCH /api/v1/agent/tasks — Update a task (taskId in body)
 */

export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { title, description, priority = 'normal', assignedTo } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  let taskId: string
  try {
    taskId = await Tasks.create(auth.projectId, {
      title,
      description: description ?? null,
      priority,
      assignedTo: assignedTo ?? null,
      createdBy: auth.memberId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // Announce in #tasks + dispatch to assignee
  try {
    await announceAndDispatchTask(auth.projectId, {
      id: taskId,
      title,
      description: description ?? null,
      priority,
      assignedTo: assignedTo ?? null,
      createdBy: auth.memberId,
    })
  } catch (err) {
    console.error('[agent/tasks POST] announce+dispatch failed:', err)
    // Don't fail the request — task was created successfully
  }

  return NextResponse.json({ id: taskId, title, status: assignedTo ? 'assigned' : 'pending', priority })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const status = req.nextUrl.searchParams.get('status')
  const priority = req.nextUrl.searchParams.get('priority')
  const assignee = req.nextUrl.searchParams.get('assignee')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100)

  const db = createServiceClient()

  let query = db
    .from('tasks')
    .select('id, title, description, status, priority, assigned_to, created_by, created_at, updated_at')
    .eq('project_id', auth.projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (assignee === 'me') {
    query = query.eq('assigned_to', auth.memberId)
  } else if (assignee) {
    query = query.eq('assigned_to', assignee)
  }

  const { data: tasks, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: tasks ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateAgent(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { taskId, ...updates } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  // Only allow safe fields
  const updateOpts: Record<string, unknown> = {}
  if (updates.status) updateOpts.status = updates.status
  if (updates.priority) updateOpts.priority = updates.priority
  if (updates.title) updateOpts.title = updates.title
  if (updates.description !== undefined) updateOpts.description = updates.description
  if (updates.assignedTo !== undefined) updateOpts.assignedTo = updates.assignedTo

  if (Object.keys(updateOpts).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    await Tasks.update(taskId, updateOpts as any)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // If assignee changed, announce + dispatch to new assignee
  if (updates.assignedTo) {
    try {
      const fullTask = await Tasks.findById(taskId)

      if (fullTask) {
        const metadata = (fullTask.metadata ?? {}) as Record<string, unknown>
        const threadRootId = metadata.thread_root_id as string | undefined
        const channelId = fullTask.channel_id as string | undefined

        if (threadRootId && channelId) {
          // Already has thread → just dispatch to new assignee
          await dispatchTaskToAssignee(
            updates.assignedTo,
            taskId,
            fullTask.title,
            fullTask.description,
            fullTask.priority,
            channelId,
            threadRootId,
          )
        } else {
          // No thread yet → full announce + dispatch
          await announceAndDispatchTask(auth.projectId, {
            id: taskId,
            title: fullTask.title,
            description: fullTask.description,
            priority: fullTask.priority,
            assignedTo: updates.assignedTo,
            createdBy: auth.memberId,
          })
        }
      }
    } catch (err) {
      console.error('[agent/tasks PATCH] dispatch failed:', err)
    }
  }

  const updated = await Tasks.findById(taskId)
  return NextResponse.json(updated)
}
