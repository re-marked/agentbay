import { createClient, createServiceClient } from '@agentbay/db/server'
import { NextResponse } from 'next/server'
import type { Tables } from '@agentbay/db'
import { estimateTokens, estimateApiCost } from '@/lib/usage/token-estimator'
import { streamFromAgent } from '@/lib/agents/stream-dispatch'

export const runtime = 'nodejs'
export const maxDuration = 300

type AgentInstance = Pick<
  Tables<'agent_instances'>,
  'id' | 'fly_app_name' | 'status' | 'user_id' | 'agent_id' | 'gateway_token'
>

export async function POST(request: Request) {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { agentInstanceId: string; message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { agentInstanceId, message } = body
  if (!agentInstanceId || !message) {
    return NextResponse.json({ error: 'Missing agentInstanceId or message' }, { status: 400 })
  }

  // 3. Load agent instance — verify ownership and running status
  const { data: instanceData, error: instanceError } = await supabase
    .from('agent_instances')
    .select('id, fly_app_name, status, user_id, agent_id, gateway_token')
    .eq('id', agentInstanceId)
    .single()

  const instance = instanceData as AgentInstance | null

  if (instanceError || !instance) {
    return NextResponse.json({ error: 'Agent instance not found' }, { status: 404 })
  }

  if (instance.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (instance.status !== 'running' && instance.status !== 'suspended') {
    return NextResponse.json(
      { error: `Agent is ${instance.status}, not available` },
      { status: 409 },
    )
  }

  if (!instance.fly_app_name) {
    return NextResponse.json({ error: 'Agent has no Fly app configured' }, { status: 500 })
  }

  const agentToken = instance.gateway_token
  if (!agentToken) {
    return NextResponse.json({ error: 'Agent has no gateway token configured' }, { status: 500 })
  }

  // 3b. Free tier hard limit — 10 messages total for users with no BYOK keys
  const FREE_MESSAGE_LIMIT = 10
  {
    const service = createServiceClient()
    const { count: keyCount } = await service
      .from('user_api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((keyCount ?? 0) === 0) {
      // User has no own keys — count their total sent messages across all sessions
      const { data: sessionIds } = await service
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)

      const ids = (sessionIds ?? []).map((s: { id: string }) => s.id)
      if (ids.length > 0) {
        const { count: msgCount } = await service
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('session_id', ids)
          .eq('role', 'user')

        if ((msgCount ?? 0) >= FREE_MESSAGE_LIMIT) {
          return NextResponse.json(
            { error: 'FREE_LIMIT_REACHED', message: `You've used all ${FREE_MESSAGE_LIMIT} free messages. Add an API key in Settings to keep chatting.` },
            { status: 402 },
          )
        }
      }
    }
  }

  // 4. Find or create session for this user + instance
  const { data: existingSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('instance_id', agentInstanceId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  let sessionId: string

  if (existingSession) {
    sessionId = (existingSession as { id: string }).id
  } else {
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        instance_id: agentInstanceId,
        relay: 'web',
      })
      .select('id')
      .single()

    if (sessionError || !newSession) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }
    sessionId = (newSession as { id: string }).id
  }

  // 5. Insert user message
  await supabase.from('messages').insert({
    session_id: sessionId,
    role: 'user',
    content: message,
  })

  // 6. Build session key for OpenClaw native sessions.
  const sessionKey = `agent:main:session-${sessionId}`

  const streamStartTime = Date.now()

  // Accumulate content for DB persistence
  const assistantMessages: string[] = []

  // Tool use tracking — keyed by turn index
  type ToolUseData = {
    id: string
    tool: string
    args?: string
    output?: string
    status: 'running' | 'done' | 'error'
  }
  const toolsByTurnIndex = new Map<number, ToolUseData[]>()

  // Thread tracking — keyed by turn index
  type ThreadData = {
    id: string
    participants: string[]
    messages: { agent: string; content: string }[]
    complete: boolean
  }
  const threadsByTurnIndex = new Map<number, ThreadData>()

  let usageRecorded = false

  /** Save assistant messages + record usage event. Safe to call multiple times. */
  async function recordUsage() {
    if (usageRecorded) return
    usageRecorded = true

    if (assistantMessages.length === 0) return

    const { data: savedMessages } = await supabase
      .from('messages')
      .insert(
        assistantMessages.map((content, idx) => {
          const thread = threadsByTurnIndex.get(idx) ?? null
          const tools = toolsByTurnIndex.get(idx) ?? null
          let toolUseJson: Record<string, unknown> | null = null
          if (thread || (tools && tools.length > 0)) {
            toolUseJson = {}
            if (thread) Object.assign(toolUseJson, thread)
            if (tools && tools.length > 0) toolUseJson.tools = tools
          }
          return {
            session_id: sessionId,
            role: 'assistant' as const,
            content,
            tool_use: (toolUseJson ?? null) as never,
          }
        }),
      )
      .select('id')

    const inputTokens = estimateTokens(message)
    const outputTokens = assistantMessages.reduce(
      (sum, msg) => sum + estimateTokens(msg),
      0,
    )
    const computeSeconds = Math.round((Date.now() - streamStartTime) / 1000 * 100) / 100
    const costUsd = estimateApiCost(inputTokens, outputTokens)

    const serviceClient = createServiceClient()
    await serviceClient.rpc('record_usage_event', {
      p_session_id: sessionId,
      p_user_id: user!.id,
      p_instance_id: agentInstanceId,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_compute_seconds: computeSeconds,
      p_credits_consumed: 0,
      p_cost_usd: costUsd,
    })

    if (savedMessages && savedMessages.length > 0) {
      for (let i = 0; i < savedMessages.length; i++) {
        const msgTokens = estimateTokens(assistantMessages[i])
        await supabase
          .from('messages')
          .update({ tokens_used: msgTokens })
          .eq('id', (savedMessages[i] as { id: string }).id)
      }
    }
  }

  // 7. Stream directly from agent via WebSocket (v2 — no SSE gateway)
  const stream = streamFromAgent(
    instance.fly_app_name,
    agentToken,
    [{ role: 'user', content: message }],
    {
      async onToolEvent(tool) {
        // Accumulate tool data for DB persistence (same as before)
        const turnIdx = assistantMessages.length
        if (!toolsByTurnIndex.has(turnIdx)) {
          toolsByTurnIndex.set(turnIdx, [])
        }
        const turnTools = toolsByTurnIndex.get(turnIdx)!

        if (tool.state === 'start' || tool.state === 'running') {
          turnTools.push({
            id: tool.id,
            tool: tool.tool,
            args: tool.args,
            status: 'running',
          })
        } else if (tool.state === 'end' || tool.state === 'done') {
          const existing = turnTools.find(t => t.id === tool.id)
          if (existing) {
            existing.status = 'done'
            existing.output = tool.output
          } else {
            turnTools.push({ id: tool.id, tool: tool.tool, args: tool.args, output: tool.output, status: 'done' })
          }
        } else if (tool.state === 'error') {
          const existing = turnTools.find(t => t.id === tool.id)
          if (existing) {
            existing.status = 'error'
            existing.output = tool.error
          }
        }
      },

      async onComplete(result) {
        if (result.content) {
          assistantMessages.push(result.content)
        }
        await recordUsage()
      },
    },
    request.signal,
    sessionKey,
  )

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
