'use server'

import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function renameProject(projectId: string, name: string) {
  const user = await getUser()
  if (!user) redirect('/login')

  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 50) {
    return { error: 'Name must be 1-50 characters.' }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('projects')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to rename project.' }
  }

  revalidatePath('/workspace', 'layout')
  return { ok: true }
}

export async function renameCorporation(corporationId: string, name: string) {
  const user = await getUser()
  if (!user) redirect('/login')

  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 50) {
    return { error: 'Name must be 1-50 characters.' }
  }

  const service = createServiceClient()

  // Rename corporation
  const { error } = await service
    .from('corporations')
    .update({ name: trimmed })
    .eq('id', corporationId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to rename corporation.' }
  }

  // Also rename the first project in the corporation to match
  const { data: firstProject } = await service
    .from('projects')
    .select('id')
    .eq('corporation_id', corporationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstProject) {
    await service
      .from('projects')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', firstProject.id)
  }

  revalidatePath('/workspace', 'layout')
  return { ok: true }
}

export async function createProject(name: string) {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 50) {
    return { error: 'Project name must be 1-50 characters.' }
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('projects')
    .insert({ name: trimmed, user_id: user.id })
    .select('id')
    .single()

  if (error) {
    return { error: 'Failed to create project.' }
  }

  revalidatePath('/workspace', 'layout')
  return { id: data.id }
}
