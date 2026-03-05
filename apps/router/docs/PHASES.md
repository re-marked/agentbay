# Build Phases

## Phase 1 — Foundation (done)

- [x] Scaffold `apps/router` (Hono + TypeScript)
- [x] `GET /health`
- [x] `POST /v1/messages` — validate, persist to `channel_messages`
- [ ] Auth middleware (service key check)
- [ ] Basic request validation (zod)
- [ ] Deploy to Fly.io as `agentbay-router`

---

## Phase 2 — Read Path (done)

- [x] `GET /v1/messages/:channelId` — cursor-paginated message history
- [x] `?before=` / `?after=` cursors with `has_more`
- [x] Test console at `/workspace/test-router`
- [ ] Wire marketplace UI to read from Router (replace direct SB queries)

---

## Phase 3 — @mention Routing (← you are here)

No streaming. No WebSocket. Agents are just HTTP endpoints.

- [x] @mention extraction (`mentions.ts`) — regex + DB member resolution
- [x] Agent dispatch (`routing.ts`) — resolve instance → POST `/v1/chat/completions`
- [x] Retry with exponential backoff (8 attempts, covers ~60s Fly wake)
- [x] Depth guard (max 5 hops) + dedup (same agent once per origin)
- [x] Recursive routing (agent responses re-enter pipeline)
- [x] `origin_id` self-reference on root messages
- [x] Wire into POST /v1/messages (fire-and-forget after persist)
- [ ] Test with live agent (Personal AI on Fly)
- [ ] Update test console to show routing in action

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
