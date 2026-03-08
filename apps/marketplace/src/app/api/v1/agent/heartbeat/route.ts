import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@agentbay/db/server'

/**
 * POST /api/v1/agent/heartbeat — Called by Trigger.dev cron to wake an agent.
 * Body: { instanceId: string }
 * Auth: ROUTER_SERVICE_KEY (same as agent auth)
 *
 * Sends "HEARTBEAT" as a user message to the agent's OpenClaw gateway,
 * which triggers the agent to read HEARTBEAT.md and act on pending work.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  if (token !== process.env.ROUTER_SERVICE_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { instanceId } = await req.json()
  if (!instanceId) {
    return NextResponse.json({ error: 'instanceId required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: instance } = await db
    .from('agent_instances')
    .select('fly_app_name, gateway_token, status')
    .eq('id', instanceId)
    .single()

  if (!instance || instance.status !== 'running') {
    return NextResponse.json({ error: 'Instance not running' }, { status: 404 })
  }

  // Send HEARTBEAT via OpenClaw chat completions API
  const gatewayUrl = `https://${instance.fly_app_name}.fly.dev`
  try {
    const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instance.gateway_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'default',
        messages: [{ role: 'user', content: 'HEARTBEAT' }],
      }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'no body')
      return NextResponse.json(
        { error: `Agent responded ${res.status}`, detail: text },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach agent', detail: String(err) },
      { status: 502 }
    )
  }
}
