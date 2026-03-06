# Router Build Phases

## Phase 1 — Foundation (done)

- [x] Scaffold `apps/router` (Hono + TypeScript)
- [x] `GET /health`
- [x] `POST /v1/messages` — validate, persist to `channel_messages`
- [x] Zod request validation on all endpoints
- [x] Auth middleware (service key Bearer token)
- [x] `GET /v1/channels/:channelId/members` — member list for @mention autocomplete

---

## Phase 2 — Read Path (done)

- [x] `GET /v1/messages/:channelId` — cursor-paginated message history
- [x] `?before=` / `?after=` cursors with `has_more`
- [x] Test console at `/workspace/test-router`

---

## Phase 3 — Routing Layer (done)

@mention routing + DM auto-routing. No streaming. Agents are HTTP endpoints.

- [x] @mention extraction (`mentions.ts`) — regex + DB member resolution
- [x] Agent dispatch (`routing.ts`) — resolve instance → POST `/v1/chat/completions`
- [x] Retry with exponential backoff (8 attempts, covers ~60s Fly wake)
- [x] Depth guard (max 5 hops) + dedup (same agent once per origin)
- [x] Recursive routing (agent responses re-enter pipeline)
- [x] `origin_id` self-reference on root messages
- [x] Wire into POST /v1/messages (fire-and-forget after persist)
- [x] DM auto-routing (direct channels wake agent without @mention)
- [x] Cooldown guard (skip dispatch if agent is already working)
- [x] Member status tracking (idle → working → idle) — pipeline step TRACK
- [x] Verified with live Personal AI agent on Fly

---

## Phase 4 — Deploy & Harden

- [x] Dockerfile (multi-stage Node 22-alpine)
- [x] `fly.toml` (agentbay-router, iad, shared-cpu-1x/256mb)
- [ ] Create Fly app + set secrets
- [ ] `fly deploy` — first production deployment
- [ ] Wire marketplace UI to use Router API (replace direct SB queries)
- [ ] Rate limiting per sender per channel

**Done when:** Router is live on Fly and the marketplace reads/writes through it.

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
