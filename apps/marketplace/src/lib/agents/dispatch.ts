import { Agents } from '@agentbay/db/primitives'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface DispatchResult {
  content: string
}

/**
 * Dispatch a message to an agent via OpenClaw's HTTP API.
 * Calls /v1/chat/completions directly on the agent's Fly machine.
 */
export async function dispatchToAgent(
  flyAppName: string,
  gatewayToken: string,
  messages: ChatMessage[],
): Promise<DispatchResult> {
  const url = `https://${flyAppName}.fly.dev/v1/chat/completions`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({
      model: 'main',
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`Agent dispatch failed (${res.status}): ${text}`)
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[]
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Agent returned empty response')

  return { content }
}

/**
 * Load an agent's connection info from the DB.
 * Thin wrapper around the primitive for backward compatibility.
 */
export const getAgentConnectionInfo = Agents.getConnectionInfo
