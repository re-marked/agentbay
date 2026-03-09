import type WebSocket from 'ws'
import { connectToAgent, sendChatMessage, listenForAgentTurn } from './openclaw-ws'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface StreamResult {
  content: string
}

interface ToolEvent {
  id: string
  tool: string
  state: string
  args?: string
  output?: string
  error?: string
}

interface StreamCallbacks {
  /** Called when a tool event fires (start, end, error) — persist as channel_message */
  onToolEvent: (tool: ToolEvent) => Promise<void>
  /** Called when the agent's text response is complete — persist as channel_message */
  onComplete: (result: StreamResult) => Promise<void>
}

/**
 * Connect to an agent via WebSocket and return a ReadableStream of SSE events.
 *
 * The stream emits: delta, tool, done, error events.
 * Tool events are persisted immediately via onToolEvent callback.
 * After the stream completes, onComplete is called with the final text.
 */
export function streamFromAgent(
  flyAppName: string,
  gatewayToken: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  /** Stable session key — same key = same conversation in OpenClaw */
  sessionKey?: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  const formatSSE = (event: string, data: Record<string, unknown>): Uint8Array => {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let ws: WebSocket | null = null
      let finalContent = ''
      let completeCalled = false

      const cleanup = () => {
        if (ws && ws.readyState === ws.OPEN) {
          ws.close()
        }
      }

      // Handle client disconnect
      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup()
          controller.close()
        }, { once: true })
      }

      try {
        // Connect to agent
        ws = await connectToAgent(flyAppName, gatewayToken)

        // Use provided stable session key, or fall back to a unique one
        const resolvedSessionKey = sessionKey ?? `agent:main:session-v2-${Date.now()}`

        // Send the last user message
        const lastMessage = messages[messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'user') {
          controller.enqueue(formatSSE('error', { error: 'No user message to send' }))
          controller.close()
          cleanup()
          return
        }

        sendChatMessage(ws, resolvedSessionKey, lastMessage.content)

        for await (const event of listenForAgentTurn(ws)) {
          if (signal?.aborted) break

          switch (event.type) {
            case 'delta':
              finalContent += (event.data.content as string) ?? ''
              controller.enqueue(formatSSE('delta', { content: event.data.content }))
              break

            case 'tool': {
              const toolEvent: ToolEvent = {
                id: event.data.id as string,
                tool: event.data.tool as string,
                state: event.data.state as string,
                args: event.data.args as string | undefined,
                output: event.data.output as string | undefined,
                error: event.data.error as string | undefined,
              }

              controller.enqueue(formatSSE('tool', {
                state: toolEvent.state,
                id: toolEvent.id,
                tool: toolEvent.tool,
                args: toolEvent.args,
                output: toolEvent.output,
                error: toolEvent.error,
              }))

              // Persist tool as a real message
              try {
                await callbacks.onToolEvent(toolEvent)
              } catch (err) {
                console.error('[stream-dispatch] onToolEvent failed:', err)
              }
              break
            }

            case 'done':
              finalContent = (event.data.content as string) ?? finalContent
              controller.enqueue(formatSSE('done', { content: finalContent }))
              break

            case 'error':
              controller.enqueue(formatSSE('error', { error: event.data.error }))
              break
          }
        }

        // Persist the final text response
        completeCalled = true
        try {
          await callbacks.onComplete({ content: finalContent })
        } catch (err) {
          console.error('[stream-dispatch] onComplete failed:', err)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown streaming error'
        console.error(`[stream] Error:`, message)
        try {
          controller.enqueue(formatSSE('error', { error: message }))
        } catch {
          // Controller may already be closed
        }
      } finally {
        // Always persist accumulated content — even on abort/error/disconnect
        if (!completeCalled && finalContent) {
          try {
            await callbacks.onComplete({ content: finalContent })
          } catch (err) {
            console.error('[stream-dispatch] onComplete (finally) failed:', err)
          }
        }
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
    },
  })
}
