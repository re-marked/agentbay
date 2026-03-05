import { getSupabase } from './supabase.js'
import type { MessagePayload, MessageRow } from './types.js'

/**
 * Persist a message to the channel_messages table.
 * This is step 3 of the message pipeline.
 *
 * Future phases will add broadcast (step 4), extract (step 5),
 * route (step 6), and track (step 7) after this.
 */
export async function persistMessage(payload: MessagePayload): Promise<MessageRow> {
  const sb = getSupabase()

  const { data, error } = await sb
    .from('channel_messages')
    .insert({
      channel_id: payload.channel_id,
      sender_id: payload.sender_id,
      content: payload.content,
      message_kind: payload.message_kind ?? 'text',
      mentions: payload.mentions ?? [],
      parent_id: payload.parent_id ?? null,
      origin_id: payload.origin_id ?? null,
      depth: payload.depth ?? 0,
      metadata: payload.metadata ?? {},
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to persist message: ${error.message}`)
  }

  return data as MessageRow
}
