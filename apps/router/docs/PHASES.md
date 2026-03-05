# Build Phases

## Phase 1 — Foundation (← you are here)

Scaffold the app, prove messages flow in and persist.

- [x] Scaffold `apps/router` (Hono + TypeScript)
- [x] `GET /health`
- [x] `POST /v1/messages` — validate, persist to `channel_messages`
- [ ] Auth middleware (service key check)
- [ ] Basic request validation (zod)
- [ ] Deploy to Fly.io as `agentbay-router`

**Done when:** You can `curl POST /v1/messages` with a channel_id + sender_id +
content and see the row in Supabase.

---

## Phase 2 — Read Path + History

Enable the UI to fetch messages from the Router instead of querying Supabase
directly.

- [ ] `GET /v1/messages/:channelId` — paginated message history
- [ ] `GET /v1/messages/:channelId?after=:messageId` — long-poll / cursor
- [ ] Wire marketplace UI to read from Router (replace direct SB queries)

**Done when:** Chat UI loads message history from the Router.

---

## Phase 3 — Streaming Bridge

Port the SSE Gateway's WebSocket→SSE bridge into the Router. This is the
critical path — it's what makes chat feel real-time.

- [ ] `POST /v1/messages/:channelId/stream` — send user message + open SSE
- [ ] WebSocket connection to agent Fly machine (OpenClaw v3 handshake)
- [ ] Token-by-token SSE forwarding (delta events)
- [ ] On stream complete: persist full message, run extract/route steps
- [ ] Heartbeat/keepalive on SSE connection
- [ ] Abort handling (client disconnect kills agent turn)

**Done when:** User types a message, sees streaming response, message is
persisted — all through the Router, not the SSE Gateway.

---

## Phase 4 — @mention Routing

The multi-agent orchestration layer. When an agent mentions another agent,
the Router wakes the target and forwards the message.

- [ ] Extract @mentions from completed agent messages
- [ ] Resolve mention → member → agent_instance → Fly machine
- [ ] Wake target machine (Fly start API)
- [ ] POST message to target agent
- [ ] Depth tracking (`origin_id` + `depth` on channel_messages)
- [ ] Dedup guard (same agent only once per origin)
- [ ] Timeout guard (120s per agent turn)
- [ ] Cooldown guard (don't double-send if agent is mid-turn)

**Done when:** Agent A @mentions Agent B, Agent B wakes up, responds, and
the response appears in the channel — all tracked with depth.

---

## Phase 5 — External Ingestion

Webhook endpoints for external services to push messages into channels.

- [ ] `POST /v1/ingest` — generic webhook receiver
- [ ] Telegram adapter (parse Update → channel_message)
- [ ] Slack adapter (parse Event API → channel_message)
- [ ] Discord adapter (parse Gateway event → channel_message)
- [ ] Map external users → members via `externals` table
- [ ] Bidirectional: agent responses routed back out to external service

**Done when:** A Telegram message appears in the AgentBay channel, an agent
responds, and the response is sent back to Telegram.

---

## Phase 6 — Kill Switch + Admin

User control over agent behavior.

- [ ] `POST /v1/channels/:id/stop` — halt all in-flight agent processing
- [ ] `DELETE /v1/messages/:id` — soft-delete
- [ ] `PATCH /v1/messages/:id` — edit message content
- [ ] Rate limiting per member per channel
- [ ] Admin dashboard metrics (messages/sec, active agents, error rates)

**Done when:** User can `/stop` a runaway agent chain.

---

## Phase 7 — Sunset SSE Gateway

- [ ] Migrate all marketplace traffic from SSE Gateway → Router
- [ ] Feature-flag rollout (10% → 50% → 100%)
- [ ] Remove `apps/sse-gateway/`
- [ ] Update Fly.io DNS / app routing
- [ ] Update CLAUDE.md documentation

**Done when:** SSE Gateway is deleted and all traffic flows through the Router.
