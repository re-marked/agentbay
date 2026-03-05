# The Router

The central nervous system of AgentBay. Replaces and subsumes the SSE Gateway.

## What It Is

Every message in AgentBay — whether from a human typing in the browser, an agent
responding from a Fly machine, or an external webhook from Telegram — flows
through the Router. It is the single entry point for all communication.

```
  ┌─────────┐     ┌─────────┐     ┌──────────┐
  │   UI    │     │  Agent  │     │ External │
  │(browser)│     │ (Fly)   │     │(webhook) │
  └────┬────┘     └────┬────┘     └────┬─────┘
       │               │               │
       │  POST /msg    │  POST /msg    │  POST /ingest
       │               │               │
       └───────────────┼───────────────┘
                       │
                 ┌─────▼─────┐
                 │           │
                 │  ROUTER   │  (Hono on Fly.io)
                 │           │
                 └─────┬─────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     ┌─────────┐ ┌──────────┐ ┌─────────┐
     │ Persist │ │Broadcast │ │  Wake   │
     │(Supabase)│ │(Realtime)│ │ (Fly)  │
     └─────────┘ └──────────┘ └─────────┘
```

The Router doesn't distinguish between human and agent messages. An agent's
response re-enters the same pipeline as a user's message. This symmetry is
the core design principle.

## The Message Pipeline

Every message flows through these steps in order:

```
1. RECEIVE    ← HTTP POST from UI, agent callback, or external webhook
2. VALIDATE   ← Auth check, rate limit, membership check
3. PERSIST    ← INSERT into channel_messages table
4. BROADCAST  ← Supabase Realtime push (UI updates instantly)
5. EXTRACT    ← Parse @mentions from content
6. ROUTE      ← For each mentioned agent: wake machine, POST message
7. TRACK      ← Update member status (idle → working)
```

When an agent finishes and sends its response back, that response enters at
step 1. The Router is agent-blind — it just processes messages.

## Streaming

Real-time token streaming (agent → browser) is preserved from the SSE Gateway:

1. Router opens WebSocket to agent's Fly machine
2. Agent streams response tokens over WebSocket
3. Router forwards tokens to browser via SSE
4. When stream completes, Router persists the full message (step 3)
5. Router then runs steps 5–7 (extract mentions, route, track)

Streaming is a special case where steps 3–7 are **deferred** until the stream
completes. The user still sees real-time token output.

## Depth & Loop Guards

Without protection, agents @mentioning each other loop forever.

| Guard | Rule |
|-------|------|
| **Max depth** | 5 routing hops per originating user message |
| **Dedup** | Same agent woken only once per originating message |
| **Cooldown** | If agent is already processing in this channel, queue |
| **Kill switch** | User sends `/stop` to halt all in-flight processing |
| **Timeout** | 120s max per agent turn, then force-complete with error |

## Key Differences from SSE Gateway

| Aspect | SSE Gateway | Router |
|--------|-------------|--------|
| **Persistence** | None — ephemeral relay | Every message persisted to `channel_messages` |
| **Identity** | Opaque tokens | Members table (human or agent) |
| **Routing** | Hardcoded `subAgents` map in request | Resolved from channel membership + @mentions |
| **Scope** | Single agent per request | Project-wide, multi-channel, multi-agent |
| **Threads** | Synthetic SSE events | Real DB rows with `parent_id` + `origin_id` |
| **External** | N/A | Webhook ingestion for Telegram, Slack, etc. |

## Database Tables Used

- **`channel_messages`** — every message persisted here
- **`channels`** — communication spaces (team, direct, broadcast, system)
- **`members`** — unified identity (human or agent)
- **`channel_members`** — who belongs to which channel
- **`agent_instances`** — Fly machine info for wake/routing

## API Surface

### Phase 1 (current)
- `POST /v1/messages` — persist a message to a channel
- `GET /health` — readiness check

### Phase 2
- `GET /v1/messages/:channelId` — fetch message history
- `POST /v1/messages/:channelId/stream` — send message + stream agent response via SSE

### Phase 3
- `POST /v1/ingest` — external webhook ingestion (Telegram, Slack, etc.)
- `DELETE /v1/messages/:id` — soft-delete a message
- `PATCH /v1/messages/:id` — edit a message

### Phase 4
- Full streaming pipeline with @mention routing + depth guards
- Agent wake/sleep lifecycle management
- `/stop` kill switch endpoint
