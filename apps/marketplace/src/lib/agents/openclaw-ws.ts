import WebSocket from 'ws'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentEvent {
  type: 'delta' | 'tool' | 'done' | 'error'
  data: Record<string, unknown>
}

interface ToolInfo {
  id: string
  tool: string
  args?: string
  output?: string
  state: 'start' | 'end' | 'error'
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Open a WebSocket to an OpenClaw agent and complete the v3 handshake.
 * Returns a connected, authenticated WebSocket ready for chat.send.
 *
 * Protocol: TCP open -> wait for connect.challenge -> send connect -> wait for hello-ok.
 */
export async function connectToAgent(
  flyAppName: string,
  gatewayToken: string,
  timeoutMs = 30_000,
): Promise<WebSocket> {
  const wsUrl = `wss://${flyAppName}.fly.dev/`

  const ws = new WebSocket(wsUrl, {
    origin: `https://${flyAppName}.fly.dev`,
  })

  // Step 0: Wait for TCP connection
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners()
      ws.on('error', () => {})
      ws.terminate()
      reject(new Error('WebSocket connection timeout'))
    }, timeoutMs)

    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    ws.on('open', () => {
      clearTimeout(timer)
      resolve()
    })
  })

  // Step 1: Wait for connect.challenge
  const challengeMsg = await waitForMessage(ws, 10_000)
  const challenge = JSON.parse(challengeMsg)

  if (challenge.type !== 'event' || challenge.event !== 'connect.challenge') {
    ws.close()
    throw new Error(`Expected connect.challenge, got: ${challengeMsg.slice(0, 200)}`)
  }

  // Step 2: Send connect request with tool-events capability
  ws.send(
    JSON.stringify({
      type: 'req',
      id: generateId(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',
          version: '1.0.0',
          platform: 'node',
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.admin'],
        caps: ['tool-events'],
        auth: { token: gatewayToken },
      },
    }),
  )

  // Step 3: Wait for hello-ok
  const helloMsg = await waitForMessage(ws, 10_000)
  const hello = JSON.parse(helloMsg)

  if (hello.type === 'res' && hello.ok === false) {
    ws.close()
    throw new Error(`Connect rejected: ${JSON.stringify(hello.error)}`)
  }

  return ws
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * Send a chat message on the WebSocket.
 */
export function sendChatMessage(
  ws: WebSocket,
  sessionKey: string,
  message: string,
  idempotencyKey?: string,
): void {
  ws.send(
    JSON.stringify({
      type: 'req',
      id: generateId(),
      method: 'chat.send',
      params: {
        sessionKey,
        message,
        idempotencyKey: idempotencyKey ?? generateId(),
      },
    }),
  )
}

// ---------------------------------------------------------------------------
// Event stream
// ---------------------------------------------------------------------------

/**
 * Async generator that yields normalized events from one agent turn.
 *
 * Yields: delta (text), tool (start/end/error), done, error.
 * Returns after one complete turn (lifecycle end + chat final).
 */
export async function* listenForAgentTurn(
  ws: WebSocket,
  timeoutMs = 300_000,
): AsyncGenerator<AgentEvent> {
  let deltaBuffer = ''
  let lifecycleEnded = false
  let doneSent = false
  let hadToolOutput = false
  let lastSeenPartsCount = 0
  let lifecycleGraceTimer: ReturnType<typeof setTimeout> | null = null
  const tools: ToolInfo[] = []

  // Create a message queue that the generator drains
  const queue: Array<AgentEvent | null> = [] // null = done signal
  let resolveWaiter: (() => void) | null = null

  const push = (event: AgentEvent | null) => {
    queue.push(event)
    if (resolveWaiter) {
      resolveWaiter()
      resolveWaiter = null
    }
  }

  const turnTimer = setTimeout(() => {
    push({ type: 'error', data: { error: 'Agent turn timed out' } })
    push(null)
  }, timeoutMs)

  let lastActivity = Date.now()
  const INACTIVITY_TIMEOUT_MS = 90_000

  const inactivityCheck = setInterval(() => {
    if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
      push({ type: 'error', data: { error: 'Agent stopped responding' } })
      push(null)
    }
  }, 5_000)

  const resetActivity = () => {
    lastActivity = Date.now()
  }

  const finalize = (content: string | null) => {
    clearTimeout(turnTimer)
    clearInterval(inactivityCheck)
    if (lifecycleGraceTimer) clearTimeout(lifecycleGraceTimer)
    ws.removeListener('message', onMessage)
    ws.removeListener('close', onClose)
    ws.removeListener('error', onError)

    if (!doneSent) {
      doneSent = true
      push({
        type: 'done',
        data: {
          content: content ?? deltaBuffer ?? '',
          tools: tools.map(t => ({ id: t.id, tool: t.tool, args: t.args, output: t.output, status: t.state === 'end' ? 'done' : t.state })),
        },
      })
    }
    push(null)
  }

  const onMessage = (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString())

      // Agent events — text deltas, tool calls, lifecycle
      if (msg.type === 'event' && msg.event === 'agent') {
        const payload = msg.payload

        if (payload?.stream === 'assistant') {
          const delta = payload.data?.delta ?? ''
          if (delta) {
            resetActivity()
            deltaBuffer += delta
            push({ type: 'delta', data: { content: delta } })
          }
        } else if (payload?.stream === 'tool') {
          resetActivity()
          hadToolOutput = true

          const td = payload.data ?? {}
          const phase = td.phase ?? ''
          const state =
            phase === 'start' || phase === 'running' ? 'start' as const
            : phase === 'end' || phase === 'complete' || phase === 'done' || phase === 'result' ? 'end' as const
            : phase === 'error' ? 'error' as const
            : 'start' as const

          const toolId = td.toolCallId ?? td.id ?? `tool-${Date.now()}`
          const toolName = td.name ?? td.tool ?? 'unknown'

          // Stringify args/output if they're objects — React can't render objects
          const rawArgs = td.args ?? td.arguments ?? td.input ?? undefined
          const rawOutput = td.result ?? td.output ?? undefined
          const stringify = (v: unknown): string | undefined =>
            v === undefined || v === null ? undefined
            : typeof v === 'string' ? v
            : JSON.stringify(v)

          const toolInfo: ToolInfo = {
            id: toolId,
            tool: toolName,
            args: stringify(rawArgs),
            output: stringify(rawOutput),
            state,
          }

          // Update or add to tools list
          const existing = tools.find(t => t.id === toolId)
          if (existing) {
            existing.state = state
            if (toolInfo.output) existing.output = toolInfo.output
          } else {
            tools.push(toolInfo)
          }

          push({
            type: 'tool',
            data: {
              state,
              id: toolId,
              tool: toolName,
              args: toolInfo.args,
              output: toolInfo.output,
              error: td.error ?? undefined,
            },
          })
        } else if (payload?.stream === 'lifecycle' && payload.data?.phase === 'end') {
          lifecycleEnded = true
          resetActivity()

          if (doneSent) {
            finalize(deltaBuffer || null)
            return
          }
          if (deltaBuffer || hadToolOutput) {
            finalize(deltaBuffer)
            return
          }
          // Don't error immediately — chat events or tool events may still arrive
          // after lifecycle end (race condition). Wait a grace period before giving up.
          // The chat 'final' event is the true completion signal, not lifecycle end.
          lifecycleGraceTimer = setTimeout(() => {
            if (doneSent) return // Chat event arrived in time
            if (deltaBuffer || hadToolOutput) {
              finalize(deltaBuffer)
              return
            }
            push({ type: 'error', data: { error: 'Agent finished without producing output' } })
            finalize(null)
          }, 10_000)
        }
      }

      // Chat events — turn completion
      if (msg.type === 'event' && msg.event === 'chat') {
        resetActivity()
        const payload = msg.payload
        const parts: Array<{ type: string; [key: string]: unknown }> = payload.message?.content ?? []

        // Scan for NEW non-text parts (tool calls, tool results) — same as SSE gateway.
        // This catches tools reported via chat content parts when the agent tool stream
        // doesn't fire (e.g., tool-events cap not negotiated).
        for (let i = lastSeenPartsCount; i < parts.length; i++) {
          const part = parts[i]
          if (part.type !== 'text') {
            hadToolOutput = true
          }
        }
        lastSeenPartsCount = parts.length

        const text = parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: string; text: string }).text)
          .join('')

        if (payload.state === 'final' || payload.state === 'done' || payload.state === 'completed') {
          const doneText = text || deltaBuffer
          doneSent = true
          push({
            type: 'done',
            data: {
              content: doneText,
              tools: tools.map(t => ({ id: t.id, tool: t.tool, args: t.args, output: t.output, status: t.state === 'end' ? 'done' : t.state })),
            },
          })

          if (lifecycleEnded) {
            finalize(doneText || null)
          }
        } else if (payload.state === 'error') {
          const errorDetail = payload.error ?? payload.errorMessage ?? 'Agent encountered an error'
          push({ type: 'error', data: { error: errorDetail } })
          finalize(null)
        }
      }

      // Response error (e.g. chat.send failed)
      if (msg.type === 'res' && msg.ok === false) {
        push({ type: 'error', data: { error: msg.error?.message ?? 'Request error' } })
        finalize(null)
      }
    } catch {
      // Ignore parse errors
    }
  }

  const onClose = () => {
    if (!doneSent) {
      push({ type: 'error', data: { error: 'Connection closed unexpectedly' } })
    }
    finalize(null)
  }

  const onError = (err: Error) => {
    push({ type: 'error', data: { error: err.message } })
    finalize(null)
  }

  ws.on('message', onMessage)
  ws.on('close', onClose)
  ws.on('error', onError)

  // Drain the queue as an async generator
  try {
    while (true) {
      if (queue.length > 0) {
        const event = queue.shift()!
        if (event === null) return // done signal
        yield event
      } else {
        // Wait for new events
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve
        })
      }
    }
  } finally {
    clearTimeout(turnTimer)
    clearInterval(inactivityCheck)
    if (lifecycleGraceTimer) clearTimeout(lifecycleGraceTimer)
    ws.removeListener('message', onMessage)
    ws.removeListener('close', onClose)
    ws.removeListener('error', onError)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function waitForMessage(ws: WebSocket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for WS message (${timeoutMs}ms)`))
    }, timeoutMs)

    const onMessage = (data: WebSocket.Data) => {
      clearTimeout(timer)
      ws.removeListener('message', onMessage)
      resolve(data.toString())
    }

    ws.on('message', onMessage)
  })
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}
