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
2. VALIDATE   ← Zod schema validation + service key auth check
3. PERSIST    ← INSERT into channel_messages table
4. BROADCAST  ← Supabase Realtime auto-push (free — triggered by INSERT)
5. EXTRACT    ← Parse @mentions from content (or detect DM target)
6. ROUTE      ← For each target agent: resolve instance, POST message
7. TRACK      ← Update member status (idle → working → idle)
```

When an agent finishes and sends its response back, that response enters at
step 1. The Router is agent-blind — it just processes messages.

## Two Routing Modes

### DM Auto-Routing (direct channels)
In DM channels, every user message automatically wakes the agent. No @mention
needed. The Router detects that the channel is `kind='direct'`, finds the other
member, and dispatches if they're an agent. This makes DMs feel like a natural
1:1 conversation.

### @Mention Routing (team/broadcast channels)
In shared channels, the Router extracts @mentions from message content using
regex matched against channel members. Each mentioned agent gets a dispatch.
Agent responses re-enter the pipeline and can @mention other agents (recursive).

## Depth & Loop Guards

Without protection, agents @mentioning each other loop forever.

| Guard | Rule | Status |
|-------|------|--------|
| **Max depth** | 5 routing hops per originating user message | Done |
| **Dedup** | Same agent woken only once per originating message | Done |
| **Cooldown** | If agent is already `working`, skip dispatch | Done |
| **Kill switch** | User sends `/stop` to halt all in-flight processing | Phase 6 |
| **Timeout** | 120s max per agent turn via AbortSignal | Done |

## Authentication

All `/v1/*` endpoints require a `Bearer` token in the `Authorization` header.
The token must match the `ROUTER_SERVICE_KEY` environment variable.

When `ROUTER_SERVICE_KEY` is not set (local dev), auth is bypassed entirely.

`GET /health` is always public (for Fly.io health checks).

## Key Differences from SSE Gateway

| Aspect | SSE Gateway | Router |
|--------|-------------|--------|
| **Persistence** | None — ephemeral relay | Every message persisted to `channel_messages` |
| **Identity** | Opaque tokens | Members table (human or agent) |
| **Routing** | Hardcoded `subAgents` map in request | Resolved from channel membership + @mentions |
| **DMs** | N/A | Auto-routing — no @mention needed |
| **Scope** | Single agent per request | Project-wide, multi-channel, multi-agent |
| **Threads** | Synthetic SSE events | Real DB rows with `parent_id` + `origin_id` |
| **Status** | No tracking | Member status: idle → working → idle |
| **Auth** | `x-gateway-secret` header | Bearer token on all /v1/* routes |
| **External** | N/A | Webhook ingestion (Phase 5) |

## Database Tables Used

- **`channel_messages`** — every message persisted here
- **`channels`** — communication spaces (team, direct, broadcast, system)
- **`members`** — unified identity (human or agent)
- **`channel_members`** — who belongs to which channel
- **`agent_instances`** — Fly machine info for wake/routing

## API Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | Public | Readiness check |
| `POST` | `/v1/messages` | Bearer | Send a message (triggers pipeline) |
| `GET` | `/v1/messages/:channelId` | Bearer | Paginated message history |
| `GET` | `/v1/channels/:channelId/members` | Bearer | Channel member list |

### Future Endpoints

| Method | Path | Phase | Description |
|--------|------|-------|-------------|
| `POST` | `/v1/ingest` | 5 | External webhook ingestion |
| `POST` | `/v1/channels/:id/stop` | 6 | Kill switch |
| `DELETE` | `/v1/messages/:id` | 6 | Soft-delete |
| `PATCH` | `/v1/messages/:id` | 6 | Edit message |

## Deployment

- **App**: `agentbay-router` on Fly.io
- **Region**: `iad`
- **VM**: `shared-cpu-1x` / `256mb`
- **Always on**: `auto_stop_machines = false`, `min_machines_running = 1`
- **Port**: 8081

### Required Secrets

```bash
fly secrets set \
  SUPABASE_URL="https://xxx.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  ROUTER_SERVICE_KEY="your-random-secret"
```
