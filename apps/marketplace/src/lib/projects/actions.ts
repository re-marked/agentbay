'use server'

import { getUser } from '@/lib/auth/get-user'
import { Corporations, Projects } from '@agentbay/db/primitives'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function renameProject(projectId: string, name: string) {
  const user = await getUser()
  if (!user) redirect('/login')

  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 50) {
    return { error: 'Name must be 1-50 characters.' }
  }

  try {
    await Projects.update(projectId, { name: trimmed })
  } catch {
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

  try {
    await Corporations.update(corporationId, { name: trimmed })
  } catch {
    return { error: 'Failed to rename corporation.' }
  }

  // Also rename the first project in the corporation to match
  const firstProject = await Projects.firstInCorporation(corporationId, user.id)
  if (firstProject) {
    await Projects.update(firstProject.id, { name: trimmed })
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

  try {
    const id = await Projects.create({ name: trimmed, userId: user.id })
    revalidatePath('/workspace', 'layout')
    return { id }
  } catch {
    return { error: 'Failed to create project.' }
  }
}
