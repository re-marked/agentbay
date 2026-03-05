import { Hono } from 'hono'
import { persistMessage } from '../lib/pipeline.js'
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

  // --- Validate required fields ---
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

  // --- Pipeline ---
  try {
    const message = await persistMessage(body)
    return c.json({ message }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

export { messages }
