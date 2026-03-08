import type WebSocket from 'ws'
import { connectToAgent, sendChatMessage, listenForAgentTurn } from './openclaw-ws'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface StreamResult {
  content: string
  tools: Array<{ id: string; tool: string; args?: string; output?: string; status: string }>
}

/**
 * Connect to an agent via WebSocket and return a ReadableStream of SSE events.
 *
 * The stream emits: delta, tool, done, error events.
 * After the stream completes, `onComplete` is called with the accumulated result.
 */
export function streamFromAgent(
  flyAppName: string,
  gatewayToken: string,
  messages: ChatMessage[],
  onComplete: (result: StreamResult) => Promise<void>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  const formatSSE = (event: string, data: Record<string, unknown>): Uint8Array => {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let ws: WebSocket | null = null

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

        // Generate a unique session key for this conversation
        const sessionKey = `agent:main:session-v2-${Date.now()}`

        // Send the last user message
        const lastMessage = messages[messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'user') {
          controller.enqueue(formatSSE('error', { error: 'No user message to send' }))
          controller.close()
          cleanup()
          return
        }

        sendChatMessage(ws, sessionKey, lastMessage.content)

        // Listen for the agent's turn and stream events
        let finalContent = ''
        let finalTools: StreamResult['tools'] = []

        for await (const event of listenForAgentTurn(ws)) {
          if (signal?.aborted) break

          switch (event.type) {
            case 'delta':
              controller.enqueue(formatSSE('delta', { content: event.data.content }))
              break

            case 'tool':
              controller.enqueue(formatSSE('tool', {
                state: event.data.state,
                id: event.data.id,
                tool: event.data.tool,
                args: event.data.args,
                output: event.data.output,
                error: event.data.error,
              }))
              break

            case 'done':
              finalContent = (event.data.content as string) ?? ''
              finalTools = (event.data.tools as StreamResult['tools']) ?? []
              controller.enqueue(formatSSE('done', {
                content: finalContent,
                tools: finalTools,
              }))
              break

            case 'error':
              controller.enqueue(formatSSE('error', { error: event.data.error }))
              break
          }
        }

        // Persist the result after streaming completes
        try {
          await onComplete({ content: finalContent, tools: finalTools })
        } catch (err) {
          console.error('[stream-dispatch] onComplete failed:', err)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown streaming error'
        try {
          controller.enqueue(formatSSE('error', { error: message }))
        } catch {
          // Controller may already be closed
        }
      } finally {
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
