import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'
import { authenticateAgent } from '@/lib/auth/service-key'

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

  const db = createServiceClient()

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      project_id: auth.projectId,
      title,
      description: description ?? null,
      priority,
      status: assignedTo ? 'assigned' : 'pending',
      assigned_to: assignedTo ?? null,
      created_by: auth.memberId,
    })
    .select('id, title, status, priority, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(task)
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
  const allowed: Record<string, unknown> = {}
  if (updates.status) allowed.status = updates.status
  if (updates.priority) allowed.priority = updates.priority
  if (updates.title) allowed.title = updates.title
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.assignedTo !== undefined) allowed.assigned_to = updates.assignedTo

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: task, error } = await db
    .from('tasks')
    .update(allowed)
    .eq('id', taskId)
    .eq('project_id', auth.projectId)
    .select('id, title, status, priority, assigned_to, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(task)
}
