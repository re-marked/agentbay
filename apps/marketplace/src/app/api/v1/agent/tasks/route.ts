import { NextResponse } from 'next/server'
import { isValidServiceKey, verifyMember } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// POST /api/v1/agent/tasks
// Body: { projectId, title, description?, priority?, assignedTo?, createdBy (memberId) }
export async function POST(request: Request) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    projectId: string
    title: string
    description?: string
    priority?: string
    assignedTo?: string
    createdBy: string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { projectId, title, createdBy, description, priority, assignedTo } = body
  if (!projectId || !title || !createdBy) {
    return NextResponse.json({ error: 'Missing projectId, title, or createdBy' }, { status: 400 })
  }

  const member = await verifyMember(createdBy)
  if (!member || member.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid member or project mismatch' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: task, error } = await service
    .from('tasks')
    .insert({
      project_id: projectId,
      title,
      description: description ?? null,
      priority: priority ?? 'medium',
      assigned_to: assignedTo ?? null,
      created_by: createdBy,
      status: assignedTo ? 'assigned' : 'pending',
    })
    .select('id, title, status, priority, created_at')
    .single()

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create task' }, { status: 500 })
  }

  return NextResponse.json({ task })
}

// GET /api/v1/agent/tasks?projectId=...&status=...&priority=...&assignee=...
export async function GET(request: Request) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
  }

  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')
  const assignee = url.searchParams.get('assignee')

  const service = createServiceClient()
  let query = service
    .from('tasks')
    .select('id, title, description, status, priority, assigned_to, created_by, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (assignee) query = query.eq('assigned_to', assignee)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data ?? [] })
}
