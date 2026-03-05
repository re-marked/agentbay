import { getSupabase } from './supabase.js'
import { getChannelAgentMembers, extractMentions } from './mentions.js'
import type { MessageRow } from './types.js'

const MAX_DEPTH = 5
const AGENT_TIMEOUT_MS = 120_000
const RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000]
const MAX_RETRIES = RETRY_DELAYS_MS.length

interface AgentInstanceInfo {
  flyAppName: string
  gatewayToken: string | null
}

/** Resolve a member's agent_instance to get Fly app name and auth token. */
async function resolveAgentInstance(instanceId: string): Promise<AgentInstanceInfo | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('agent_instances')
    .select('fly_app_name, gateway_token, status')
    .eq('id', instanceId)
    .single()

  if (error || !data) return null
  if (data.status !== 'running' && data.status !== 'suspended') return null

  return {
    flyAppName: data.fly_app_name,
    gatewayToken: data.gateway_token,
  }
}

/**
 * POST to an agent's /v1/chat/completions endpoint with retry.
 *
 * Fly autostart triggers on incoming HTTP traffic, so the first request
 * wakes the machine. Retries with exponential backoff cover the ~50-60s
 * OpenClaw startup window.
 *
 * Never throws — returns error string on failure.
 */
async function queryAgent(
  flyApp: string,
  token: string | null,
  message: string,
): Promise<string> {
  const url = `https://${flyApp}.fly.dev/v1/chat/completions`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt]
      await new Promise((r) => setTimeout(r, delay))
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }],
        }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      })

      if (res.status === 502 || res.status === 503) {
        console.warn(
          `[routing] ${flyApp} returned ${res.status}, retrying (${attempt + 1}/${MAX_RETRIES})`,
        )
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return `[Error: ${flyApp} returned HTTP ${res.status}: ${body.slice(0, 200)}]`
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      return data.choices?.[0]?.message?.content ?? '[Error: empty response from agent]'
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      if (attempt === MAX_RETRIES - 1) {
        return `[Error: failed to reach ${flyApp} after ${MAX_RETRIES} attempts: ${msg}]`
      }
      console.warn(`[routing] Attempt ${attempt + 1} to ${flyApp} failed: ${msg}`)
    }
  }

  return `[Error: failed to reach ${flyApp}]`
}

/**
 * Get member UUIDs already mentioned in this message chain.
 * Used for deduplication — same agent is only woken once per origin.
 */
async function getAlreadyMentionedMembers(originId: string): Promise<Set<string>> {
  const sb = getSupabase()
  const { data } = await sb
    .from('channel_messages')
    .select('mentions')
    .eq('origin_id', originId)

  const ids = new Set<string>()
  for (const row of data ?? []) {
    for (const id of (row.mentions as string[]) ?? []) {
      ids.add(id)
    }
  }
  return ids
}

/**
 * Persist an agent's response as a new channel_message.
 */
async function persistAgentResponse(
  channelId: string,
  senderId: string,
  content: string,
  parentId: string,
  originId: string,
  depth: number,
): Promise<MessageRow> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('channel_messages')
    .insert({
      channel_id: channelId,
      sender_id: senderId,
      content,
      message_kind: 'text',
      mentions: [],
      parent_id: parentId,
      origin_id: originId,
      depth,
      metadata: {},
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to persist agent response: ${error.message}`)
  return data as MessageRow
}

/**
 * Main routing function. Called asynchronously after message persist.
 *
 * 1. Check depth guard
 * 2. Get agent members in channel
 * 3. Extract @mentions from content
 * 4. Dedup against already-mentioned agents for this origin
 * 5. For each new mention: resolve instance → query agent → persist response
 * 6. Agent responses re-enter routing (recursive — handles agent-to-agent @mentions)
 */
export async function routeMessage(message: MessageRow): Promise<void> {
  if (message.depth >= MAX_DEPTH) {
    console.info(
      `[routing] Max depth (${MAX_DEPTH}) reached for origin ${message.origin_id}, stopping`,
    )
    return
  }

  const agentMembers = await getChannelAgentMembers(message.channel_id)
  if (agentMembers.length === 0) return

  const mentions = extractMentions(message.content, agentMembers)
  if (mentions.length === 0) return

  // origin_id: if this is a root message, it references itself (set in pipeline.ts)
  const originId = message.origin_id ?? message.id

  // Dedup: skip agents already mentioned in this chain
  const alreadyMentioned = await getAlreadyMentionedMembers(originId)
  const newMentions = mentions.filter((m) => !alreadyMentioned.has(m.memberId))
  if (newMentions.length === 0) return

  // Write the mentioned member IDs onto the trigger message
  const mentionIds = newMentions.map((m) => m.memberId)
  const sb = getSupabase()
  await sb
    .from('channel_messages')
    .update({ mentions: mentionIds })
    .eq('id', message.id)

  console.info(
    `[routing] ${newMentions.length} mention(s) at depth=${message.depth}, origin=${originId}`,
  )

  // Process each mention sequentially (safe for depth tracking)
  for (const mention of newMentions) {
    const member = agentMembers.find((m) => m.memberId === mention.memberId)
    if (!member) continue

    try {
      const instance = await resolveAgentInstance(member.instanceId)
      if (!instance) {
        console.warn(
          `[routing] No running/suspended instance for ${mention.displayName}, skipping`,
        )
        continue
      }

      console.info(
        `[routing] Dispatching to ${mention.displayName} → ${instance.flyAppName}`,
      )

      const response = await queryAgent(
        instance.flyAppName,
        instance.gatewayToken,
        mention.message,
      )

      const agentMessage = await persistAgentResponse(
        message.channel_id,
        mention.memberId,
        response,
        message.id,
        originId,
        message.depth + 1,
      )

      console.info(
        `[routing] ${mention.displayName} responded (${response.length} chars), depth=${agentMessage.depth}`,
      )

      // Recursive: check if agent's response contains @mentions
      await routeMessage(agentMessage)
    } catch (err) {
      console.error(`[routing] Error routing to ${mention.displayName}:`, err)
    }
  }
}
