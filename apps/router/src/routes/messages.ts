import { Hono } from 'hono'
import { persistMessage, fetchMessages } from '../lib/pipeline.js'
import { routeMessage } from '../lib/routing.js'
import {
  MessagePayloadSchema,
  MessageQuerySchema,
  formatZodError,
} from '../lib/validation.js'

const messages = new Hono()

/**
 * POST /v1/messages
 *
 * Receives a message from any sender (UI, agent, webhook) and pushes it
 * through the full message pipeline:
 *   RECEIVE → VALIDATE → PERSIST → (BROADCAST via Realtime) → EXTRACT → ROUTE → TRACK
 *
 * Returns 201 immediately after persist. Routing happens async (fire-and-forget).
 * Agent responses appear in the channel via Supabase Realtime.
 */
messages.post('/v1/messages', async (c) => {
  // VALIDATE: Zod schema validation
  const raw = await c.req.json().catch(() => null)

  if (!raw) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const result = MessagePayloadSchema.safeParse(raw)

  if (!result.success) {
    return c.json({ error: formatZodError(result.error) }, 400)
  }

  const payload = result.data

  try {
    // PERSIST: Insert into channel_messages
    const message = await persistMessage(payload)

    // EXTRACT + ROUTE + TRACK: fire-and-forget
    // POST returns 201 immediately. Agent responses appear via Supabase Realtime.
    routeMessage(message).catch((err) => {
      console.error('[routing] Background routing failed:', err)
    })

    return c.json({ message }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[messages] POST failed:', msg)
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

  // Validate query params
  const queryResult = MessageQuerySchema.safeParse({
    limit: c.req.query('limit'),
    before: c.req.query('before') || undefined,
    after: c.req.query('after') || undefined,
  })

  if (!queryResult.success) {
    return c.json({ error: formatZodError(queryResult.error) }, 400)
  }

  try {
    const result = await fetchMessages({
      channel_id: channelId,
      ...queryResult.data,
    })
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[messages] GET failed:', msg)
    return c.json({ error: msg }, 500)
  }
})

/**
 * GET /v1/channels/:channelId/members
 *
 * List all members of a channel with their status.
 * Used by the UI for @mention autocomplete and member presence indicators.
 */
messages.get('/v1/channels/:channelId/members', async (c) => {
  const channelId = c.req.param('channelId')

  try {
    const { getSupabase } = await import('../lib/supabase.js')
    const sb = getSupabase()

    const { data: cmRows, error: cmError } = await sb
      .from('channel_members')
      .select('member_id')
      .eq('channel_id', channelId)

    if (cmError) {
      return c.json({ error: cmError.message }, 500)
    }

    if (!cmRows || cmRows.length === 0) {
      return c.json({ members: [] })
    }

    const memberIds = cmRows.map((r) => r.member_id)

    const { data: members, error: mError } = await sb
      .from('members')
      .select('id, display_name, status, instance_id, user_id, rank, color')
      .in('id', memberIds)

    if (mError) {
      return c.json({ error: mError.message }, 500)
    }

    const result = (members ?? []).map((m) => ({
      id: m.id,
      display_name: m.display_name,
      status: m.status,
      is_agent: m.instance_id != null,
      is_human: m.user_id != null,
      rank: m.rank,
      color: m.color,
    }))

    return c.json({ members: result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[members] GET failed:', msg)
    return c.json({ error: msg }, 500)
  }
})

export { messages }
