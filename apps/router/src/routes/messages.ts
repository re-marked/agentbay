import { Hono } from 'hono'
import { persistMessage, fetchMessages } from '../lib/pipeline.js'
import { routeMessage } from '../lib/routing.js'
import type { MessagePayload } from '../lib/types.js'

const messages = new Hono()

/**
 * POST /v1/messages
 *
 * Receives a message from any sender (UI, agent, webhook) and pushes it
 * through the message pipeline. Phase 1 only persists — future phases
 * add broadcast, extract, route, and track.
 */
messages.post('/v1/messages', async (c) => {
  const body = await c.req.json<MessagePayload>()

  if (!body.channel_id || !body.sender_id) {
    return c.json({ error: 'channel_id and sender_id are required' }, 400)
  }
  if (typeof body.content !== 'string') {
    return c.json({ error: 'content must be a string' }, 400)
  }

  const validKinds = ['text', 'tool_result', 'status', 'system', 'file']
  if (body.message_kind && !validKinds.includes(body.message_kind)) {
    return c.json({ error: `message_kind must be one of: ${validKinds.join(', ')}` }, 400)
  }

  try {
    const message = await persistMessage(body)

    // Fire-and-forget: extract @mentions, route to agents, persist responses.
    // POST returns 201 immediately. Agent responses appear via Supabase Realtime.
    routeMessage(message).catch((err) => {
      console.error('[routing] Background routing failed:', err)
    })

    return c.json({ message }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

/**
 * GET /v1/messages/:channelId
 *
 * Fetch message history for a channel. Cursor-based pagination:
 *   ?limit=50       (default 50, max 200)
 *   ?before=<iso>   older messages (scroll up)
 *   ?after=<iso>    newer messages (new arrivals)
 *
 * Returns messages in chronological order (oldest first).
 */
messages.get('/v1/messages/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const limit = c.req.query('limit')
  const before = c.req.query('before')
  const after = c.req.query('after')

  try {
    const result = await fetchMessages({
      channel_id: channelId,
      limit: limit ? parseInt(limit, 10) : undefined,
      before: before || undefined,
      after: after || undefined,
    })
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

export { messages }
