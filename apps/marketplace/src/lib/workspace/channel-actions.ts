'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@agentbay/db/server'
import { getUser } from '@/lib/auth/get-user'

/**
 * Archive a broadcast channel.
 * Team channels should be archived via archiveTeam() instead.
 */
export async function archiveChannel(channelId: string) {
  const user = await getUser()
  if (!user) throw new Error('Not authenticated')

  const service = createServiceClient()

  const { data: channel } = await service
    .from('channels')
    .select('id, kind, team_id')
    .eq('id', channelId)
    .single()

  if (!channel) throw new Error('Channel not found')

  // Don't allow archiving team channels directly — use archiveTeam
  if (channel.kind === 'team') {
    throw new Error('Team channels are managed by their team. Delete the team instead.')
  }

  await service
    .from('channels')
    .update({ archived: true })
    .eq('id', channelId)

  revalidatePath('/workspace', 'layout')
}
