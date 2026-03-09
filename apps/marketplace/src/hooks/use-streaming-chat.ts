'use client'

import { useCallback, useRef, useState } from 'react'
import type { ToolUse } from '@/components/tool-use-block'

interface StreamDoneResult {
  content: string
  tools: ToolUse[]
}

interface UseStreamingChatOptions {
  channelId: string
  /** When set, scopes messages to a thread under this root message */
  threadId?: string
  /** When set, uses task-scoped session for the agent */
  taskId?: string
  /** Called when the agent turn completes — use to inject an optimistic message before Realtime arrives */
  onDone?: (result: StreamDoneResult) => void
}

export function useStreamingChat({ channelId, threadId, taskId, onDone }: UseStreamingChatOptions) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingTools, setStreamingTools] = useState<ToolUse[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Ref mirror of streamingTools so processEvent (stable callback) can read current value
  const toolsRef = useRef<ToolUse[]>([])

  const sendStreamingMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return
      setIsStreaming(true)
      setStreamError(null)
      setStreamingContent('')
      setStreamingTools([])
      toolsRef.current = []

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const res = await fetch('/api/v1/messages/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, content: content.trim(), threadId, taskId }),
          signal: abortController.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }

        if (!res.body) {
          throw new Error('No response body')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // Keep incomplete last line

          let currentEvent = ''
          let currentData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7)
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6)
            } else if (line === '' && currentEvent && currentData) {
              // End of event — process it
              processEvent(currentEvent, currentData)
              currentEvent = ''
              currentData = ''
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled — not an error
        } else {
          setStreamError(err instanceof Error ? err.message : 'Streaming failed')
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [channelId, isStreaming],
  )

  const processEvent = useCallback((event: string, dataStr: string) => {
    try {
      const data = JSON.parse(dataStr)

      switch (event) {
        case 'delta':
          setStreamingContent(prev => prev + (data.content ?? ''))
          break

        case 'tool': {
          const toolId = data.id as string
          const state = data.state as string

          if (state === 'start') {
            const newTool: ToolUse = {
              id: toolId,
              tool: data.tool ?? 'unknown',
              args: data.args,
              status: 'running',
            }
            setStreamingTools(prev => {
              const next = [...prev, newTool]
              toolsRef.current = next
              return next
            })
          } else if (state === 'end') {
            setStreamingTools(prev => {
              const next = prev.map(t =>
                t.id === toolId
                  ? { ...t, status: 'done' as const, output: data.output }
                  : t,
              )
              toolsRef.current = next
              return next
            })
          } else if (state === 'error') {
            setStreamingTools(prev => {
              const next = prev.map(t =>
                t.id === toolId
                  ? { ...t, status: 'error' as const, output: data.error }
                  : t,
              )
              toolsRef.current = next
              return next
            })
          }
          break
        }

        case 'done':
          // Notify caller so it can inject optimistic messages before we clear
          onDoneRef.current?.({ content: data.content ?? '', tools: toolsRef.current })
          setStreamingContent('')
          setStreamingTools([])
          toolsRef.current = []
          break

        case 'error':
          setStreamError(data.error ?? 'Unknown error')
          break
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    sendStreamingMessage,
    streamingContent,
    streamingTools,
    isStreaming,
    streamError,
    cancelStream,
  }
}
