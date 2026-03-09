'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DiscordMessageList, type DiscordMessage } from './discord-message-list'
import type { ToolUse } from './tool-use-block'
import { DiscordChatInput } from './discord-chat-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useGatewayReady } from '@/hooks/use-gateway-ready'

interface DiscordChatPanelProps {
  agentInstanceId: string
  agentName?: string
  agentCategory?: string
  agentIconUrl?: string | null
  agentStatus?: string
  /** Skip heartbeat check (for test/mock modes) */
  skipHeartbeat?: boolean
}

export function DiscordChatPanel({ agentInstanceId, agentName = 'Agent', agentCategory, agentIconUrl, agentStatus, skipHeartbeat }: DiscordChatPanelProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<DiscordMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const [showSleepingAlert, setShowSleepingAlert] = useState(agentStatus === 'suspended' || agentStatus === 'stopped')
  const [waking, setWaking] = useState(false)

  // Gateway readiness — don't send messages or show typing until the agent is responsive
  const { ready: gatewayReady, checking: gatewayChecking } = useGatewayReady({
    instanceId: agentInstanceId,
    skip: skipHeartbeat,
  })

  // Queue for non-blocking sends
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/chat/history?agentInstanceId=${agentInstanceId}`)
        if (res.ok) {
          const data = await res.json()
          type RawThread = {
            id: string
            participants: string[]
            messages: { agent: string; content: string }[]
            complete: boolean
          }
          type RawToolUse = {
            id: string
            tool: string
            args?: string
            output?: string
            status: 'running' | 'done' | 'error'
          }
          type RawToolUseJson = RawThread & { tools?: RawToolUse[] }
          setMessages(
            data.messages.map((m: { id: string; role: string; content: string; created_at?: string; tool_use?: RawToolUseJson | null }) => {
              const tu = m.tool_use as RawToolUseJson | null
              // Thread data: present if tool_use has participants (backward compat)
              const hasThread = tu && tu.participants && tu.participants.length > 0
              // Tool uses: present if tool_use has tools array
              const rawTools = tu?.tools ?? []
              return {
                id: m.id,
                role: m.role === 'assistant' ? 'master' : 'user',
                content: m.content,
                timestamp: m.created_at ? new Date(m.created_at) : new Date(),
                thread: hasThread
                  ? {
                      id: String(tu!.id),
                      participants: tu!.participants ?? [],
                      messages: (tu!.messages ?? []).map((tm) => ({
                        agent: tm.agent,
                        content: tm.content,
                        timestamp: m.created_at ? new Date(m.created_at) : new Date(),
                      })),
                      complete: true,
                    }
                  : undefined,
                toolUses: rawTools.length > 0 ? rawTools : undefined,
              }
            }),
          )
        }
      } catch {
        // Failed to load history — start with empty messages
      } finally {
        setIsLoading(false)
      }
    }
    loadHistory()
  }, [agentInstanceId])

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return
    // Don't start processing until the gateway is confirmed ready
    if (!gatewayReady) return

    processingRef.current = true
    setIsTyping(true)

    const message = queueRef.current.shift()!
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000)

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ agentInstanceId, message }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        const isFreeLimitReached = err.error === 'FREE_LIMIT_REACHED'
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'master',
            content: isFreeLimitReached
              ? `__FREE_LIMIT__`
              : `Something went wrong: ${err.error ?? err.errorMessage ?? err.message ?? 'Connection failed'}`,
            timestamp: new Date(),
          },
        ])
        processingRef.current = false
        setIsTyping(queueRef.current.length > 0)
        if (queueRef.current.length > 0) processQueue()
        return
      }

      // Read SSE — stream text live token-by-token, each tool as its own block
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let currentEvent = ''
      let contentBuffer = ''
      let turnCount = 0
      let streamDone = false
      // Track the current streaming text message (live token-by-token)
      let streamingMsgId = ''
      // Track the current tool message (per-tool, not shared)
      let currentToolMsgId = ''
      // Whether any content was rendered this turn (for done fallback)
      let turnHadOutput = false
      // Persist across turns — so multi-turn responses update ONE message
      let responseMsgId = ''

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (streamDone) break

          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim())

              if (currentEvent === 'delta' && data.content !== undefined) {
                contentBuffer += data.content
                if (!streamingMsgId) {
                  if (!responseMsgId) {
                    // First delta of the entire response — create message
                    responseMsgId = `master-${Date.now()}-${turnCount}-stream-${Math.random().toString(36).slice(2, 6)}`
                    streamingMsgId = responseMsgId
                    turnHadOutput = true
                    const id = streamingMsgId
                    const snapshot = contentBuffer
                    setMessages((prev) => [
                      ...prev,
                      {
                        id,
                        role: 'master',
                        content: snapshot,
                        timestamp: new Date(),
                      },
                    ])
                  } else {
                    // Subsequent turn — reuse the same message (OpenClaw sends accumulated text)
                    streamingMsgId = responseMsgId
                    turnHadOutput = true
                    const id = responseMsgId
                    const snapshot = contentBuffer
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === id
                          ? { ...m, content: snapshot }
                          : m,
                      ),
                    )
                  }
                } else {
                  // Subsequent delta within same turn — update
                  const id = streamingMsgId
                  const snapshot = contentBuffer
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === id
                        ? { ...m, content: snapshot }
                        : m,
                    ),
                  )
                }
              } else if (currentEvent === 'text_block') {
                // Gateway flushed text before a tool call — finalize the streaming message
                if (streamingMsgId) {
                  const finalContent = contentBuffer || data.content || ''
                  if (finalContent) {
                    const id = streamingMsgId
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === id
                          ? { ...m, content: finalContent }
                          : m,
                      ),
                    )
                  }
                } else if (data.content) {
                  // No streaming message yet (deltas didn't fire) — create one
                  turnHadOutput = true
                  const blockId = `master-${Date.now()}-${turnCount}-blk-${Math.random().toString(36).slice(2, 6)}`
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: blockId,
                      role: 'master',
                      content: data.content,
                      timestamp: new Date(),
                    },
                  ])
                }
                contentBuffer = ''
                streamingMsgId = ''
              } else if (currentEvent === 'tool') {
                // Tool use event — each tool gets its own message
                const toolPayload = data.data ?? data
                const toolId = toolPayload.id ?? toolPayload.toolCallId ?? `tool-${Date.now()}`
                const toolName = toolPayload.tool ?? toolPayload.name ?? 'unknown'
                const state = data.state ?? toolPayload.state ?? toolPayload.phase ?? ''

                // Extract args — OpenClaw may use args, arguments, or input
                const rawArgs = toolPayload.args ?? toolPayload.arguments ?? toolPayload.input
                let args = ''
                if (rawArgs) {
                  if (typeof rawArgs === 'string') {
                    args = rawArgs
                  } else if (rawArgs.command) {
                    args = rawArgs.command
                  } else if (rawArgs.path || rawArgs.file) {
                    args = rawArgs.path ?? rawArgs.file
                  } else if (rawArgs.query) {
                    args = rawArgs.query
                  } else {
                    args = JSON.stringify(rawArgs)
                  }
                }

                if (state === 'start' || state === 'running' || !state) {
                  // Finalize any current streaming text message first
                  if (streamingMsgId) {
                    if (contentBuffer) {
                      const id = streamingMsgId
                      const finalContent = contentBuffer
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === id
                            ? { ...m, content: finalContent }
                            : m,
                        ),
                      )
                    }
                    contentBuffer = ''
                    streamingMsgId = ''
                  }

                  // Create a NEW tool message for THIS specific tool
                  turnHadOutput = true
                  currentToolMsgId = `master-tool-${Date.now()}-${turnCount}-${toolId}`
                  const newTool: ToolUse = {
                    id: toolId,
                    tool: toolName,
                    args: args || undefined,
                    status: 'running',
                  }
                  const msgId = currentToolMsgId
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: msgId,
                      role: 'master',
                      content: '',
                      timestamp: new Date(),
                      toolUses: [newTool],
                    },
                  ])
                } else if (state === 'end' || state === 'done' || state === 'completed') {
                  const output = toolPayload.output ?? toolPayload.result ?? ''
                  const outputStr = typeof output === 'string' ? output : JSON.stringify(output)
                  // Update the tool message containing this tool ID
                  setMessages((prev) =>
                    prev.map((m) => {
                      const tu = m.toolUses
                      if (!tu) return m
                      const idx = tu.findIndex((t) => t.id === toolId)
                      if (idx === -1) return m
                      const updated = [...tu]
                      updated[idx] = { ...updated[idx], status: 'done', output: outputStr }
                      return { ...m, toolUses: updated }
                    }),
                  )
                  currentToolMsgId = ''
                } else if (state === 'error') {
                  setMessages((prev) =>
                    prev.map((m) => {
                      const tu = m.toolUses
                      if (!tu) return m
                      const idx = tu.findIndex((t) => t.id === toolId)
                      if (idx === -1) return m
                      const updated = [...tu]
                      updated[idx] = { ...updated[idx], status: 'error', output: toolPayload.error ?? 'Tool error' }
                      return { ...m, toolUses: updated }
                    }),
                  )
                  currentToolMsgId = ''
                }
              } else if (currentEvent === 'done') {
                // Turn complete — finalize any remaining streaming message
                if (streamingMsgId && contentBuffer) {
                  const id = streamingMsgId
                  const finalContent = contentBuffer
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === id
                        ? { ...m, content: finalContent }
                        : m,
                    ),
                  )
                } else if (!turnHadOutput && data.content) {
                  // Fallback: no deltas/tools rendered — gateway sent content only in done
                  if (responseMsgId) {
                    // Update existing response message
                    const id = responseMsgId
                    const content = data.content
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === id ? { ...m, content } : m,
                      ),
                    )
                  } else {
                    responseMsgId = `master-${Date.now()}-${turnCount}`
                    const id = responseMsgId
                    setMessages((prev) => [
                      ...prev,
                      {
                        id,
                        role: 'master',
                        content: data.content,
                        timestamp: new Date(),
                      },
                    ])
                  }
                }
                contentBuffer = ''
                streamingMsgId = ''
                currentToolMsgId = ''
                turnHadOutput = false
                turnCount++
              } else if (currentEvent === 'thread_start') {
                // Attach thread to the last master message (immutable)
                setMessages((prev) => {
                  let lastIdx = -1
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === 'master') { lastIdx = i; break }
                  }
                  if (lastIdx === -1) return prev
                  return prev.map((m, i) =>
                    i === lastIdx
                      ? {
                          ...m,
                          thread: {
                            id: data.threadId,
                            participants: [data.from, data.to],
                            messages: [
                              { agent: data.from, content: data.message, timestamp: new Date() },
                            ],
                            complete: false,
                          },
                        }
                      : m,
                  )
                })
              } else if (currentEvent === 'thread_message') {
                // Add message to active thread (immutable to avoid StrictMode double-push)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.thread?.id === data.threadId
                      ? {
                          ...m,
                          thread: {
                            ...m.thread!,
                            messages: [
                              ...m.thread!.messages,
                              { agent: data.agent, content: data.content, timestamp: new Date() },
                            ],
                          },
                        }
                      : m,
                  ),
                )
              } else if (currentEvent === 'thread_end') {
                // Mark thread complete (immutable)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.thread?.id === data.threadId
                      ? { ...m, thread: { ...m.thread!, complete: true } }
                      : m,
                  ),
                )
              } else if (currentEvent === 'end') {
                // Entire run finished
                streamDone = true
                break
              } else if (currentEvent === 'error' || data.error) {
                // Extract a human-readable message — OpenClaw uses `errorMessage`, not `error`
                let errText: unknown = data.error ?? data.errorMessage ?? data.message ?? 'Unknown error'
                if (typeof errText === 'object' && errText !== null) {
                  errText = (errText as Record<string, unknown>).errorMessage
                    ?? (errText as Record<string, unknown>).message
                    ?? 'Unknown error'
                }
                if (typeof errText === 'string' && errText.startsWith('{')) {
                  try { const p = JSON.parse(errText); errText = p.errorMessage ?? p.message ?? errText } catch { /* use as-is */ }
                }
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `error-${Date.now()}`,
                    role: 'master',
                    content: `Something went wrong: ${errText}`,
                    timestamp: new Date(),
                  },
                ])
                streamDone = true
                break
              }
            } catch {
              // Not valid JSON, skip
            }
            currentEvent = ''
          }
        }
      }

      // If stream ended without a done event — finalize any remaining content
      if (streamingMsgId && contentBuffer) {
        const id = streamingMsgId
        const finalContent = contentBuffer
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, content: finalContent }
              : m,
          ),
        )
      } else if (contentBuffer) {
        // Content buffer has data but no streaming message — update or create
        if (responseMsgId) {
          const id = responseMsgId
          const finalContent = contentBuffer
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, content: finalContent } : m,
            ),
          )
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `master-${Date.now()}-final`,
              role: 'master',
              content: contentBuffer,
              timestamp: new Date(),
            },
          ])
        }
      }

      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    } catch (err) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      const timedOut = err instanceof DOMException && err.name === 'AbortError'
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'master',
          content: timedOut ? 'Request timed out. Please try again.' : 'Connection failed. Please try again.',
          timestamp: new Date(),
        },
      ])
    }

    processingRef.current = false

    // Process next in queue, or clear typing indicator
    if (queueRef.current.length > 0) {
      processQueue()
    } else {
      setIsTyping(false)
    }
  }, [agentInstanceId, gatewayReady])

  // When gateway becomes ready, flush any queued messages
  useEffect(() => {
    if (gatewayReady && queueRef.current.length > 0 && !processingRef.current) {
      processQueue()
    }
  }, [gatewayReady, processQueue])

  const handleSend = useCallback(
    (text: string) => {
      // Add user message immediately
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          content: text,
          timestamp: new Date(),
        },
      ])

      // Queue and process
      queueRef.current.push(text)
      processQueue()
    },
    [processQueue],
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <DiscordMessageList messages={messages} agentName={agentName} agentCategory={agentCategory} agentIconUrl={agentIconUrl} agentInstanceId={agentInstanceId} />

      {/* Typing / connecting indicator */}
      {isTyping && (
        <div className="px-4 py-1">
          <span className="text-muted-foreground text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="flex gap-0.5">
                <span className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full [animation-delay:0ms]" />
                <span className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full [animation-delay:150ms]" />
                <span className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full [animation-delay:300ms]" />
              </span>
              <span className="font-semibold text-primary">{agentName}</span> is typing…
            </span>
          </span>
        </div>
      )}
      {!isTyping && gatewayChecking && messages.some((m) => m.role === 'user') && (
        <div className="px-4 py-1">
          <span className="text-muted-foreground text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="border-muted-foreground/60 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
              Connecting to <span className="font-semibold text-primary">{agentName}</span>…
            </span>
          </span>
        </div>
      )}

      <DiscordChatInput
        onSend={handleSend}
        disabled={isTyping || messages.some((m) => m.content === '__FREE_LIMIT__')}
        disabledPlaceholder={messages.some((m) => m.content === '__FREE_LIMIT__') ? 'Add an API key to continue chatting…' : undefined}
      />

      {/* Sleeping/stopped agent alert */}
      <AlertDialog open={showSleepingAlert} onOpenChange={setShowSleepingAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {waking
                ? 'Starting up...'
                : agentStatus === 'stopped' ? 'Agent is shut down' : 'Agent is sleeping'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {waking
                ? 'Your agent is booting up. This usually takes a few seconds.'
                : agentStatus === 'stopped'
                  ? 'This agent was shut down. Start it up to begin chatting — this may take a moment.'
                  : 'This agent was suspended after 30 minutes of inactivity. Wake it up to start chatting.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!waking && (
              <AlertDialogCancel onClick={() => router.push('/workspace/home')}>
                Go Back
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              disabled={waking}
              onClick={async (e) => {
                if (waking) { e.preventDefault(); return }
                e.preventDefault()
                setWaking(true)
                try {
                  await fetch('/api/agent/wake', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agentInstanceId }),
                  })
                  // Poll until running, then dismiss
                  for (let i = 0; i < 30; i++) {
                    await new Promise((r) => setTimeout(r, 2000))
                    const res = await fetch(`/api/agent/status?instanceId=${agentInstanceId}`)
                    if (res.ok) {
                      const data = await res.json()
                      if (data.status === 'running') {
                        setShowSleepingAlert(false)
                        setWaking(false)
                        router.refresh()
                        return
                      }
                    }
                  }
                  // Timed out — redirect to agent home
                  setWaking(false)
                  router.push(`/workspace/agent/${agentInstanceId}`)
                } catch {
                  setWaking(false)
                  router.push(`/workspace/agent/${agentInstanceId}`)
                }
              }}
            >
              {waking ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Starting up...
                </span>
                
              ) : (
                agentStatus === 'stopped' ? 'Start Up' : 'Wake Up'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
