import { db } from './client'

// ─── Types ───────────────────────────────────────────────────────────

export interface SendMessageOpts {
  kind?: string       // 'text' | 'system' | 'tool_result'
  parentId?: string   // thread parent
  depth?: number
  originId?: string   // origin message (for agent responses)
  metadata?: Record<string, unknown>
}

// ─── Reads ───────────────────────────────────────────────────────────

/**
 * List messages in a channel, newest first, with optional thread scoping.
 * Returns messages in chronological order (reversed from query).
 */
export async function list(
  channelId: string,
  opts?: { limit?: number; threadId?: string; before?: string; kinds?: string[] }
) {
  const limit = opts?.limit ?? 50

  let q = db()
    .from('channel_messages')
    .select('id, channel_id, sender_id, content, message_kind, depth, parent_id, origin_id, metadata, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts?.threadId) {
    q = q.or(`id.eq.${opts.threadId},parent_id.eq.${opts.threadId}`)
  }

  if (opts?.kinds && opts.kinds.length > 0) {
    q = q.in('message_kind', opts.kinds)
  }

  if (opts?.before) {
    q = q.lt('created_at', opts.before)
  }

  const { data } = await q
  return (data ?? []).reverse()
}

/**
 * Load recent message history formatted for LLM context.
 * Returns { role, content }[] in chronological order.
 */
export async function loadContext(
  channelId: string,
  userMemberId: string,
  opts?: { limit?: number; threadId?: string }
) {
  const messages = await list(channelId, {
    limit: opts?.limit ?? 30,
    threadId: opts?.threadId,
    kinds: ['text'],
  })

  return messages.map(msg => ({
    role: (msg.sender_id === userMemberId ? 'user' : 'assistant') as 'user' | 'assistant',
    content: msg.content,
  }))
}

// ─── Writes ──────────────────────────────────────────────────────────

/**
 * Send a message to a channel. Returns the message ID.
 */
export async function send(
  channelId: string,
  senderId: string,
  content: string,
  opts?: SendMessageOpts
): Promise<string> {
  const { data, error } = await db()
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: senderId,
      content,
      message_kind: opts?.kind ?? 'text',
      depth: opts?.depth ?? 0,
      parent_id: opts?.parentId ?? null,
      origin_id: opts?.originId ?? null,
      metadata: (opts?.metadata ?? null) as any,
    })
    .select('id')
    .single()

  if (!data) throw new Error(`Failed to send message: ${error?.message}`)
  return data.id
}
