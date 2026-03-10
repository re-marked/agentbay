# Deep Tech Researcher Memory

## Project Context
This is OpenAgents (formerly FreeClaw) — a Next.js 15 monorepo (pnpm) marketplace for OpenClaw agents,
triggered by the OpenAI acqui-hire of Peter Steinberger (Feb 15, 2026).

## Key Research Files
- `openclaw-research.md` — Full OpenClaw technical deep-dive (2026-02-18)
- `openclaw-docker-gateway.md` — Docker images, gateway CLI flags, config, workspace files, skills (2026-02-20)
- `skill-format.md` — Complete SKILL.md format spec, ClawHub details (2026-02-18)
- `infrastructure-research.md` — Trigger.dev v3, Polar.sh, Supabase Realtime, Vercel, Fly.io
- `agent-marketplace-landscape.md` — Marketplace landscape, protocols, infrastructure (2026-02-18)
- `standards-and-protocols.md` — AIOS, Agent-OS, A2A, MCP, ACP, SKILL.md standard, AgentKit (2026-02-19)

## Critical Facts
- OpenClaw: Clawdbot (Nov 2025) → Moltbot (Jan 27) → OpenClaw (Jan 30, 2026)
- Steinberger joined OpenAI Feb 15, 2026; OpenClaw → Foundation (OpenAI sponsors, MIT stays)
- Foundation board: NOT YET FORMED as of Feb 17, 2026
- ClawHub: 5,705 skills as of Feb 7, 2026; 15K+ daily installs; NO built-in payments
- Snyk ToxicSkills (Feb 2026): 13.4% of skills have critical issues; 36.8% have any flaw
- Skills security: no code signing, 1-week-old GitHub account to publish

## Key Standards (2026-02-19)
- SKILL.md = Anthropic open standard (Dec 2025); adopted by OpenAI Codex CLI and ChatGPT
- agentskills.io = spec repo (Apache 2.0); SkillsMP = largest aggregator (200K+ skills)
- A2A + ACP merged under Linux Foundation (late 2025); /.well-known/agent-card.json
- MCP: 97M+ monthly SDK downloads; donated to AAIF (Linux Foundation, Dec 2025)
- AIOS (agiresearch) = academic "agent OS" kernel — NOT an industry standard

## OpenAI Strategy (2026)
- Frontier: enterprise agent platform (launched Feb 5, 2026); HP, Intuit, Oracle, etc.
- AgentKit: visual canvas + Connector Registry (MCP-based) + ChatKit
- Agentic Commerce Protocol (ACP): with Stripe; 4% fee; Instant Checkout live Feb 16
- GPT Store: ~$0.03/conversation; most creators earn <$500/month; discovery is broken

## Marketplace Intel
- SkillsMP: 200K+ SKILL.md skills, aggregates GitHub repos; no creator payments
- ClawHub: fastest growing but security nightmare; no monetization built in
- SkillHub.club: competing ClawHub-style marketplace
- Market norm: 15-30% platform take; 70-85% to creators

## Monetization Research (2026-02-19)
See `monetization-research.md` for full details. Key findings:
- Polar.sh PROHIBITS marketplace revenue sharing — cannot use for creator payouts
- Architecture: Polar.sh for USER billing; Stripe Connect Express for CREATOR payouts
- Apify is the best reference: 80/20 split, creator gets 80% MINUS platform compute costs
- GPT Store: engagement-based ~$0.03/conv, most creators earn <$100/quarter — broken model
- Fly.io GPUs: DEPRECATED July 31, 2026 — do not build GPU dependency on Fly.io
- Fly.io compute: shared-cpu-1x 256MB = ~$0.0027/hr; agent session ~$0.0025 total cost
- Credit system: 100 credits = $1 recommended; free tier 7-day expiry; paid tiers monthly
- Recommended split: 80% creator / 20% platform, AFTER deducting compute at cost

## OpenClaw Reliability Research (2026-03-09)
See `openclaw-reliability.md` for full details. Key findings:
- Model failover: 2-stage — auth profile rotation (exponential backoff 1m→5m→25m→1hr) then model fallback
- Fallback config: `agents.defaults.model: { primary: "google/gemini-2.5-flash", fallbacks: ["routeway/gpt-5-mini", "openrouter/..."] }`
- auth-profiles.json: `{ version: 1, profiles: { "google:default": { type: "api_key", provider: "google", key: "..." } } }` — `key` NOT `apiKey` (changed in 2026.2.19)
- Multiple profiles per provider → round-robin rotation with session stickiness
- Routeway: 60+ models, 15+ providers, OpenAI-compatible aggregator, no published SLA, 100% uptime last 30 days
- OpenRouter: same aggregator model but with explicit cross-provider failover; natively supported in OpenClaw as `openrouter/` prefix
- Fly restart policy: use `always` not `on-failure` for agent machines (catches clean exits)
- Stale sessions on volume: after model change, old sessions cache old model — clear sessions.json in entrypoint on model change
- LiteLLM as platform gateway: 4 vCPU / 8GB min; too heavy per-agent but good as shared platform service

## OpenClaw Docker Gateway (2026-02-20)
See `openclaw-docker-gateway.md` for full details. Key facts:
- Official image: `ghcr.io/openclaw/openclaw:2026.2.19` (GHCR only, no Docker Hub)
- Multi-arch: amd64 + arm64; also `main` tag for bleeding edge
- Default port: 18789 (WebSocket + HTTP multiplexed on same port)
- CRITICAL: must use `--bind lan` in Docker (default loopback = proxy cannot reach it)
- HTTP APIs: POST /v1/chat/completions and POST /v1/responses (both disabled by default, enable in config)
- Start command: `node openclaw.mjs gateway --bind lan --port 18789 --allow-unconfigured`
- State dir: OPENCLAW_STATE_DIR (default /home/node/.openclaw); workspace inside it
- Auth: OPENCLAW_GATEWAY_TOKEN env var required for non-loopback; bearer token for HTTP
- Workspace files: SOUL.md (personality), AGENTS.md (rules), MEMORY.md (facts) all in workspace/
- Set `agents.defaults.skipBootstrap: true` to avoid interactive Q&A in Docker
- 2GB RAM minimum for production (OOM at 512MB/1GB under load)
- Runs as node user (uid 1000) — chown -R 1000:1000 host state directories
