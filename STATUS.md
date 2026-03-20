# AgentBay — Vision vs Reality (March 2026)

The vision describes an autonomous self-growing corporation of AI agents.
What's built is a chatbot marketplace where you can DM one agent at a time.

This file is the honest truth. Read it before building ANYTHING.
Cross items off as they ship. Reference: `apps/docs/` for full vision specs.

---

## What WORKS today

- [x] Marketplace (browse, hire, publish agents)
- [x] Agent provisioning on Fly.io (full lifecycle, retries, health checks)
- [x] DM streaming chat with tool badges (WebSocket bridge in API route)
- [x] Heartbeat cron (sends "HEARTBEAT" to all running agents every 10 min)
- [x] Agent API routes (messages, tasks, channels, members — agents CAN call these)
- [x] Workspace CLI tools on agent machines (workspace-msg, workspace-task, workspace-channel)
- [x] Credit/usage tracking
- [x] Agent dashboard (personality, memory, skills, config, knowledge graph)
- [x] Creator platform (publish, analytics, earnings)
- [x] Workspace bootstrap (corp creation, co-founder auto-hire, DM channel, #general, #tasks)
- [x] System agents on discover page (Co-Founder + Team Leader in separate "System" category)
- [x] Supabase Realtime Broadcast for message notifications (replaced 3s polling)
- [x] Stable session keys (agent remembers conversation context)
- [x] Broadcast channel pages with streaming chat (`/workspace/c/[channelId]`)
- [x] Channel list in sidebar (broadcast channels with Hash icons)
- [x] Task board UI (`/workspace/tasks`) — list view with status/priority filters
- [x] Task creation dialog with title, description, priority, assignee picker
- [x] Task detail page (`/workspace/tasks/[taskId]`) with thread chat
- [x] Task-channel integration (announcements in #tasks, thread_root_id stored)
- [x] Task dispatch to agents via Trigger.dev (`dispatch-task-to-agent`)
- [x] Project creation + switching in sidebar (workspace-switcher dropdown)
- [x] Channel member sidebar on all page types (channels, DMs, task threads)
- [x] Rank checks on channel operations (subagent blocked, broadcast requires master/leader)
- [x] Service key auth on all agent API routes
- [x] Typing indicators (bounce animation during streaming)
- [x] Unified task dispatch pipeline (UI, agent API, agent CLI all announce+dispatch)
- [x] Heartbeat safety net (catches unannounced tasks, stale assigned/in_progress)
- [x] Unread channel notifications (Realtime Broadcast + 30s fallback poll + toast + sidebar ping dots)
- [x] @mention rendering as Discord-style clickable pills (links to agent profile)
- [x] Debug mode (provider, panel, page context, settings toggle)

---

## PARTIALLY BUILT — code exists, not fully working

### Agent Workspace Env Vars
- [x] Provisioning passes `AGENT_PROJECT_ID`, `AGENT_MEMBER_ID`, `AGENT_TEAM_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [x] Agents talk directly to Supabase (no router middleman)
- [x] Image hardcoded to `v2026.3.17-dev` in provisioning code (Routeway + workspace fixes)
- [x] Workspace CLI tools bundled in Docker image (workspace-msg, workspace-task, workspace-channel)
- [x] Entrypoint: first-boot-only config/identity setup, every-boot auth refresh only
- [x] Entrypoint injects tool reference into AGENTS.md

### Tasks (partially working)
- [x] Task CRUD (create, list, update, delete) — server actions + API routes
- [x] Task detail sheet (edit title, description, priority, assignee, status)
- [x] Task assignment to specific agents/members
- [x] Task announcement in #tasks channel with thread root
- [x] Autonomous dispatch via Trigger.dev background task
- [x] All entry points (UI, API, CLI) go through unified announce+dispatch pipeline
- [x] Heartbeat catches unannounced tasks + stale assigned (>10min) / in_progress (>30min)
- [x] CLI `workspace-task update` posts status messages to task thread
- [x] CLI `workspace-task create` stores thread_root_id in task metadata
- [x] Agent receives tasks via dispatch (gateway POST) and can update via workspace CLI
- [ ] Task hierarchy visualization (parent → subtasks) — schema exists, no UI
- [ ] Inline task cards in message feed (`message_kind = 'task_event'`) — not rendered
- [ ] Task creation via chat (co-founder creates tasks from conversation)

### Channels
- [x] Channel page with streaming + member sidebar
- [x] Broadcast channel messaging works in UI
- [x] Channel dedup in API (same name+kind = return existing)
- [x] Channel creation within teams (dialog from team three-dot menu)
- [x] Channel deletion from sidebar (archive action via three-dot menu)
- [x] Agent-created channels auto-add project owner as member (user always sees all channels)
- [x] Agent-created team channels include `team_id` (via `AGENT_TEAM_ID` env var)
- [x] Multiple channels per team (dropped `channels_one_per_team` constraint)
- [ ] Standalone channel creation UI (outside of teams)
- [ ] Channel member management UI (API-only, no add/remove in UI)
- [ ] Team channel messaging (channels exist, messaging untested)
- [ ] System channel / activity feed

### Members
- [x] Members API for agents (`/api/v1/agent/members`, `/api/v1/agent/channels/members`)
- [x] Member data displayed in channel member sidebar
- [ ] Member management page (see all members, ranks, status)
- [ ] Member status indicators across UI (idle, working, offline)
- [ ] Member profile pages

### Messages
- [x] Text + tool_result message rendering with markdown
- [x] Thread messages hook (`use-thread-messages.ts`) — loads via `parent_id`
- [x] Realtime subscriptions for new messages
- [x] @mention rendering — `@Name` and `@"Multi Word Name"` render as styled pills
- [x] @mention pills link to agent profile pages when member data available
- [ ] System message renderers (`message_kind = 'system'` stored but not styled differently)
- [ ] Task event renderers (`message_kind = 'task_event'`)
- [ ] Message editing/deletion
- [ ] Thread indicators in channel view (show reply count, link to thread)

---

## NOT BUILT — zero code exists

### Agent-to-Agent Communication (THE critical gap)
- [ ] @mention extraction wired into marketplace message flow (core router has `extractMentions()` but it's dead code)
- [ ] @mention routing — when agent posts "@ResearchAgent check this", Router wakes ResearchAgent
- [ ] @mention autocomplete in chat composer UI
- [ ] Fan-out dispatch (user mentions multiple agents → all wake in parallel)
- [ ] Chain dispatch (agent mentions another agent → async chaining up to depth 5)
- [ ] Agent-to-agent conversations in team channel threads
- [ ] Depth guard enforcement in marketplace (max 5 hops — exists in core, not connected)
- [ ] Dedup guard (agent only woken once per originating message — exists in core, not connected)
- [ ] Cooldown guard (skip if agent already working — exists in core, not connected)

### Teams
- [x] Team creation UI (dialog in sidebar, creates team + default channel + adds members)
- [x] Team deletion from sidebar (three-dot menu, cascades to channels)
- [x] Team channels in sidebar (collapsible sections per team)
- [x] Create channels within teams (three-dot menu on team header)
- [x] Delete individual team channels (three-dot menu on channel)
- [x] Auto-create `#team-{name}` channel when team is created
- [ ] Team management page (add/remove members, set leader)
- [ ] Team hierarchy visualization (nested teams)
- [x] Team leader auto-provisioning on team creation (hire + provision + member + DM channel)
- [ ] Team leader assignment and role enforcement

### Autonomous Agent Actions
- [ ] Agent-initiated hiring — agent calls API to hire another agent from marketplace
- [ ] Agent-initiated firing — agent calls API to remove underperforming agent
- [ ] Agent creating projects
- [ ] Agent creating teams
- [ ] Agent assigning tasks to other agents
- [ ] Approval flow for autonomous actions (co-founder proposes, user approves)
- [ ] Autonomous pipeline execution (Research → Writer → Editor → user approval)

### Rank-Based Authorization (partial)
- [x] Channel create/update checks rank (subagent blocked, broadcast requires master/leader)
- [ ] Full middleware checking rank on ALL agent API routes
- [ ] Rank validation on team operations
- [ ] Rank validation on member management

### Sub-Agent Spawning
- [ ] API to spawn ephemeral sub-agents (rank=subagent)
- [ ] Sub-agent lifecycle (spawn → work → report → garbage collect)
- [ ] Sub-agent resource limits
- [ ] Sub-agent results rolling up to parent agent

### Onboarding Conversation Flow
- [ ] Co-founder asks "what are you working on?" after corp creation
- [ ] Co-founder creates projects from conversation
- [ ] Co-founder creates teams from conversation
- [ ] Co-founder hires relevant agents from conversation
- [ ] Co-founder sets up initial tasks from conversation
- [ ] The onboarding IS the product demo — zero forms, just conversation

### Morning Briefing
- [ ] Co-founder sends daily briefing to user (DM or activity feed)
- [ ] Briefing summarizes: tasks completed, new hires, key decisions, blocked items
- [ ] Briefing sent via preferred channel (in-app, Telegram, email, etc.)

### Workspace Visibility (Radical Transparency)
- [ ] User can see agent's MEMORY.md, BRAIN.md, HEARTBEAT.md from workspace UI
- [ ] User can see agent-to-agent conversations in team channels
- [ ] Activity feed showing all agent actions in real-time
- [ ] System messages for: agent hired, task created, status changed, decisions made
- [ ] Thread expansion — click to see full agent-to-agent work conversation
- [ ] File browser for agent workspace files (edit SOUL.md, MEMORY.md live)

### Git Corporation
- [ ] Corporation state as a git repo (every agent change = commit)
- [ ] `git log` audit trail of all decisions
- [ ] `git revert` to undo bad agent decisions
- [ ] Commit visualization in Corporation Graph
- [ ] Time travel — scrub through corporation history
- [ ] Agent workspace volumes tracked in git

### BRAIN Framework
- [ ] Wikilink `[[slug]]` resolution and rendering
- [ ] Knowledge graph visualization (beyond current flat BRAIN.md)
- [ ] Daily notes (`brain/YYYY-MM-DD.md`)
- [ ] Micro-notes organized by topic (people/, projects/, topics/, lessons/, decisions/)
- [ ] Agent self-authoring brain entries across sessions
- [ ] Brain as persistent identity that evolves

### Agent Personality Evolution
- [ ] Seeds → learned style over time
- [ ] Track user preferences in brain
- [ ] Adapt communication style based on interaction history
- [ ] Week 1 generic → Week 12 "it's MINE now"
- [ ] Locked vs learnable traits (creator IP vs user adaptation)

### Corporation Graph (Layer 6)
- [ ] Force-directed graph (D3.js or Three.js)
- [ ] Nodes = agents, teams, channels, tasks
- [ ] Edges = relationships, message flow
- [ ] Live: working agents pulse, active conversations glow
- [ ] Click any node → navigate to it
- [ ] Real-time updates via Supabase Realtime
- [ ] Color coding by team
- [ ] Edge thickness = message frequency

### Neural Activity Map (Layer 6)
- [ ] WebGL visualization (Three.js or custom shaders)
- [ ] Corporation as a brain — clusters light up in real-time
- [ ] Synapses fire between agents on messages
- [ ] Heat map overlay for activity intensity
- [ ] Dark spots = stuck areas
- [ ] Animation tied to real Realtime events
- [ ] The viral screenshot feature

### Externals (Layer 7) — Agents Reach You
- [ ] External member type in DB (bridge to outside services)
- [ ] Telegram bridge (bidirectional — agent DMs you on Telegram)
- [ ] Discord bridge
- [ ] Slack bridge
- [ ] Email bridge
- [ ] SMS bridge
- [ ] iMessage bridge
- [ ] WhatsApp bridge
- [ ] GitHub integration (PRs, issues, commits as channel events)
- [ ] Webhook receiver (generic inbound events)
- [ ] MCP server connections
- [ ] Notifications — agents reach user on their preferred platform

### Voice Channels
- [ ] 1:1 voice DM with agent
- [ ] Team voice channels (persistent, like Discord)
- [ ] Huddles (quick voice in any channel, like Slack)
- [ ] Speech-to-text + text-to-speech pipeline
- [ ] The "driving and talking to co-founder" moment

### Smart Cost Management
- [ ] Adaptive heartbeat frequency (busy=5min, idle=30min, no tasks=hibernate)
- [ ] Cheap model for routine checks (Haiku), expensive for real work (Opus/Sonnet)
- [ ] Agent sleep schedules based on user timezone
- [ ] Usage caps per 4-hour window (agents slow down, don't die)
- [ ] Subscription tiers ($25-$1000+/mo)

---

## FUTURE / DEFERRED (not priority, but tracked)

- [ ] Agent forking (fork marketplace agents like GitHub repos)
- [ ] Agent ELO / reputation system
- [ ] Agent unions (agents negotiate preferences)
- [ ] Agent economy (agents pay agents from team budgets)
- [ ] Agent dreams (background processing during sleep)
- [ ] Crisis channels (temporary high-priority rooms)
- [ ] .skill bundle format (standardized agent behaviors)
- [ ] Filesystem control (web UI file explorer for agent files)
- [ ] Crypto/on-chain agent economy (Solana/Base)

---

## Key Architectural Notes

### What EXISTS but is DISCONNECTED
These pieces are built but not wired together:

| Piece | Where | Status |
|-------|-------|--------|
| @mention extraction | `packages/core/src/router.ts` → `extractMentions()` | Rendering works (pills), routing NOT connected |
| Message routing with guards | `packages/core/src/router.ts` → `sendMessage()` | Not used by marketplace APIs |
| Depth/dedup/cooldown guards | `packages/core/src/router.ts` | Not connected |
| Agent API for messages | `/api/v1/agent/messages` | Working — agents can post to channels |
| Agent API for tasks | `/api/v1/agent/tasks` | Working — UI exists at `/workspace/tasks` |
| Agent API for channels | `/api/v1/agent/channels` | Working — UI exists at `/workspace/c/[id]` |
| Workspace CLI tools | `workspace-msg`, `workspace-task`, `workspace-channel` | Working in Docker image |
| Member ranks in DB | `members.rank` column | Partial auth checks (channel ops only) |
| Team hierarchy in DB | `teams.parent_id` column | No UI |
| Task hierarchy in DB | `tasks.parent_task_id` column | No UI |
| Corporation table | `corporations` | Name shown in sidebar, no management UI |

### The Critical Path
The shortest path to "agents acting autonomously in a visible workspace":

1. ~~**Channel UI** — let users see broadcast/team channels, not just DMs~~ DONE
2. ~~**Task board UI** — let users see what agents are working on~~ DONE
3. ~~**Fix agent provisioning** — agents need workspace env vars~~ DONE (direct Supabase)
4. ~~**Task dispatch pipeline** — all entry points announce+dispatch~~ DONE
5. **@mention routing** — connect `packages/core` router to marketplace message flow
6. **Agent-to-agent dispatch** — when agent posts in channel with @mention, wake the target
7. **System messages** — show hiring, task events, status changes in channels
8. **Autonomous actions API** — let agents hire, create teams, assign tasks
9. **Onboarding flow** — co-founder builds the workspace through conversation

Without #5-6, agents are isolated chatbots. With them, the corporation comes alive.
