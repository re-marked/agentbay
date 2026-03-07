import { NextResponse } from 'next/server'
import { isValidServiceKey } from '@/lib/auth/service-key'
import { createServiceClient } from '@agentbay/db/server'

export const runtime = 'nodejs'

// PATCH /api/v1/agent/tasks/:taskId
// Body: { status?, priority?, title?, description?, assignedTo? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status) updates.status = body.status
  if (body.priority) updates.priority = body.priority
  if (body.title) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.assignedTo !== undefined) updates.assigned_to = body.assignedTo

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: task, error } = await service
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select('id, title, status, priority, assigned_to, updated_at')
    .single()

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? 'Task not found' }, { status: 404 })
  }

  return NextResponse.json({ task })
}

// DELETE /api/v1/agent/tasks/:taskId
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  if (!isValidServiceKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await params
  const service = createServiceClient()

  const { data: task, error } = await service
    .from('tasks')
    .update({ status: 'cancelled' })
    .eq('id', taskId)
    .select('id, status')
    .single()

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  return NextResponse.json({ task })
}
