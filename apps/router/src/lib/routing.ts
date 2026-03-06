import { getSupabase } from './supabase.js'
import { getChannelAgentMembers, extractMentions } from './mentions.js'
import { setMemberStatus, isMemberWorking } from './tracking.js'
import type { MessageRow } from './types.js'

const MAX_DEPTH = 5
const AGENT_TIMEOUT_MS = 120_000
const RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000]
const MAX_RETRIES = RETRY_DELAYS_MS.length

interface AgentInstanceInfo {
  flyAppName: string
  gatewayToken: string | null
}

interface DispatchTarget {
  memberId: string
  displayName: string
  instanceId: string
  message: string
}

// ─── Instance Resolution ────────────────────────────────────────────────────

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

// ─── Agent HTTP Dispatch ────────────────────────────────────────────────────

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

// ─── Dedup Helpers ──────────────────────────────────────────────────────────

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

// ─── DM Auto-Routing ────────────────────────────────────────────────────────

/**
 * In DM channels (kind='direct'), every message from the user should
 * wake the agent automatically — no @mention needed.
 *
 * Returns the agent member to dispatch to, or null if:
 * - Channel is not a DM
 * - The other member is not an agent
 * - The sender IS the agent (don't wake yourself)
 */
async function getDMTarget(
  channelId: string,
  senderId: string,
): Promise<DispatchTarget | null> {
  const sb = getSupabase()

  // Check if this is a direct channel
  const { data: channel, error: chErr } = await sb
    .from('channels')
    .select('kind')
    .eq('id', channelId)
    .single()

  if (chErr || !channel || channel.kind !== 'direct') return null

  // Get the other member in this DM
  const { data: members, error: mErr } = await sb
    .from('channel_members')
    .select('member_id')
    .eq('channel_id', channelId)
    .neq('member_id', senderId)

  if (mErr || !members || members.length === 0) return null

  const otherMemberId = members[0].member_id

  // Check if the other member is an agent
  const { data: member, error: memErr } = await sb
    .from('members')
    .select('id, display_name, instance_id')
    .eq('id', otherMemberId)
    .not('instance_id', 'is', null)
    .single()

  if (memErr || !member || !member.instance_id) return null

  return {
    memberId: member.id,
    displayName: member.display_name,
    instanceId: member.instance_id,
    message: '', // Will be set by caller
  }
}

// ─── Persist Agent Response ─────────────────────────────────────────────────

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

// ─── Core Dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch a message to a single agent: resolve instance, check cooldown,
 * set status to working, query agent, persist response, set status to idle.
 *
 * Returns the agent's response message row (for recursive routing), or null on skip/failure.
 */
async function dispatchToAgent(
  target: DispatchTarget,
  channelId: string,
  parentMessageId: string,
  originId: string,
  depth: number,
): Promise<MessageRow | null> {
  // Cooldown: skip if agent is already working
  if (await isMemberWorking(target.memberId)) {
    console.info(`[routing] ${target.displayName} is already working, skipping (cooldown)`)
    return null
  }

  const instance = await resolveAgentInstance(target.instanceId)
  if (!instance) {
    console.warn(`[routing] No running/suspended instance for ${target.displayName}, skipping`)
    return null
  }

  console.info(`[routing] Dispatching to ${target.displayName} → ${instance.flyAppName}`)

  // TRACK: mark agent as working
  await setMemberStatus(target.memberId, 'working')

  try {
    const response = await queryAgent(
      instance.flyAppName,
      instance.gatewayToken,
      target.message,
    )

    const agentMessage = await persistAgentResponse(
      channelId,
      target.memberId,
      response,
      parentMessageId,
      originId,
      depth,
    )

    console.info(
      `[routing] ${target.displayName} responded (${response.length} chars), depth=${agentMessage.depth}`,
    )

    return agentMessage
  } finally {
    // TRACK: always reset to idle, even on error
    await setMemberStatus(target.memberId, 'idle')
  }
}

// ─── Main Routing Function ──────────────────────────────────────────────────

/**
 * Main routing function. Called asynchronously after message persist.
 *
 * Two routing modes:
 *
 * 1. DM auto-routing: In direct channels, every user message automatically
 *    wakes the agent. No @mention needed — it's a 1:1 conversation.
 *
 * 2. @mention routing: In team/broadcast channels, extract @mentions from
 *    content, resolve against channel members, dispatch to each agent.
 *
 * Both modes support:
 * - Depth guard (max 5 hops)
 * - Dedup (same agent once per origin chain)
 * - Cooldown (skip if agent is already working)
 * - Status tracking (idle → working → idle)
 * - Recursive routing (agent responses re-enter pipeline)
 */
export async function routeMessage(message: MessageRow): Promise<void> {
  if (message.depth >= MAX_DEPTH) {
    console.info(
      `[routing] Max depth (${MAX_DEPTH}) reached for origin ${message.origin_id}, stopping`,
    )
    return
  }

  const originId = message.origin_id ?? message.id

  // ── Mode 1: DM auto-routing ──────────────────────────────────────────────
  const dmTarget = await getDMTarget(message.channel_id, message.sender_id)

  if (dmTarget) {
    // In DMs, the message IS for the agent — send the full content
    dmTarget.message = message.content

    // Dedup: check if this agent was already dispatched in this chain
    const alreadyMentioned = await getAlreadyMentionedMembers(originId)
    if (alreadyMentioned.has(dmTarget.memberId)) return

    // Record the mention on the trigger message
    const sb = getSupabase()
    await sb
      .from('channel_messages')
      .update({ mentions: [dmTarget.memberId] })
      .eq('id', message.id)

    console.info(`[routing] DM auto-route to ${dmTarget.displayName}, depth=${message.depth}`)

    const agentMessage = await dispatchToAgent(
      dmTarget,
      message.channel_id,
      message.id,
      originId,
      message.depth + 1,
    )

    // Recursive: agent response might contain @mentions for other agents
    if (agentMessage) {
      await routeMessage(agentMessage)
    }
    return
  }

  // ── Mode 2: @mention routing ─────────────────────────────────────────────
  const agentMembers = await getChannelAgentMembers(message.channel_id)
  if (agentMembers.length === 0) return

  const mentions = extractMentions(message.content, agentMembers)
  if (mentions.length === 0) return

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

    const target: DispatchTarget = {
      memberId: member.memberId,
      displayName: member.displayName,
      instanceId: member.instanceId,
      message: mention.message,
    }

    try {
      const agentMessage = await dispatchToAgent(
        target,
        message.channel_id,
        message.id,
        originId,
        message.depth + 1,
      )

      // Recursive: check if agent's response contains @mentions
      if (agentMessage) {
        await routeMessage(agentMessage)
      }
    } catch (err) {
      console.error(`[routing] Error routing to ${mention.displayName}:`, err)
    }
  }
}
