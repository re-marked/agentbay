import { getSupabase } from './supabase.js'
import type { MessagePayload, MessageRow, MessageQuery, MessageListResponse } from './types.js'

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

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * Fetch messages from a channel with cursor-based pagination.
 * Returns messages in chronological order (oldest first).
 *
 * - No cursor: latest N messages
 * - `before`: messages older than cursor (scroll up)
 * - `after`: messages newer than cursor (new messages)
 */
export async function fetchMessages(query: MessageQuery): Promise<MessageListResponse> {
  const sb = getSupabase()
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  // Fetch limit+1 to determine has_more
  let q = sb
    .from('channel_messages')
    .select('*')
    .eq('channel_id', query.channel_id)
    .is('deleted_at', null)
    .limit(limit + 1)

  if (query.before) {
    // Older messages — order DESC, then reverse
    q = q.lt('created_at', query.before).order('created_at', { ascending: false })
  } else if (query.after) {
    // Newer messages — order ASC
    q = q.gt('created_at', query.after).order('created_at', { ascending: true })
  } else {
    // Latest messages — order DESC, then reverse
    q = q.order('created_at', { ascending: false })
  }

  const { data, error } = await q

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`)
  }

  const rows = data as MessageRow[]
  const hasMore = rows.length > limit
  if (hasMore) rows.pop()

  // For DESC queries (no cursor or `before`), reverse to chronological order
  if (!query.after) rows.reverse()

  return { messages: rows, has_more: hasMore }
}
