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
- [x] Agent API routes (messages, tasks, channels — agents CAN call these)
- [x] Workspace CLI tools on agent machines (workspace-msg, workspace-task)
- [x] Credit/usage tracking
- [x] Agent dashboard (personality, memory, skills, config, knowledge graph)
- [x] Creator platform (publish, analytics, earnings)
- [x] Workspace bootstrap (corp creation, co-founder auto-hire, DM channel)
- [x] Supabase Realtime for message updates
- [x] Stable session keys (agent remembers conversation context)

---

## SKELETON — schema/types exist, no UI or wiring

### Corporations & Projects
- [ ] Corporation management UI (create, rename, switch between corps)
- [ ] Project browser/creation UI
- [ ] Project settings page
- [ ] Multi-project support in sidebar (icon tray like Discord servers)

### Teams
- [ ] Team creation UI
- [ ] Team management page (add/remove members, set leader)
- [ ] Team hierarchy visualization (nested teams)
- [ ] Auto-create `#team-{name}` channel when team is created
- [ ] Team leader assignment and role enforcement

### Channels (beyond DMs)
- [ ] Channel browser page (`/workspace/c/[channelId]`)
- [ ] Broadcast channel messaging (#general works for agents, not in UI)
- [ ] Team channel messaging (#team-* channels)
- [ ] System channel (activity feed)
- [ ] Channel creation UI
- [ ] Channel member management
- [ ] Channel list in sidebar (broadcast + team channels, not just DMs)

### Tasks
- [ ] Task board UI in workspace (`/workspace/tasks`) — kanban with drag-drop
- [ ] Task detail sheet (edit title, description, priority, assignee, status)
- [ ] Task creation dialog from UI
- [ ] Task assignment to specific agents/members
- [ ] Task hierarchy visualization (parent → subtasks)
- [ ] Task-channel integration (task events as system messages in channels)
- [ ] Inline task cards in message feed (`message_kind = 'task_event'`)
- [ ] Task creation via chat (co-founder creates tasks from conversation)

### Members
- [ ] Member management page (see all members in project, their ranks, status)
- [ ] Member status indicators across UI (idle, working, offline, suspended)
- [ ] Member profile pages

---

## NOT BUILT — zero code exists

### Agent-to-Agent Communication (THE critical gap)
- [ ] @mention extraction wired into marketplace message flow (core router has `extractMentions()` but it's dead code)
- [ ] @mention routing — when agent posts "@ResearchAgent check this", Router wakes ResearchAgent
- [ ] @mention autocomplete in chat composer UI
- [ ] Agents receiving messages in channels (not just DMs)
- [ ] Fan-out dispatch (user mentions multiple agents → all wake in parallel)
- [ ] Chain dispatch (agent mentions another agent → async chaining up to depth 5)
- [ ] Agent-to-agent conversations in team channel threads
- [ ] Depth guard enforcement in marketplace (max 5 hops — exists in core, not connected)
- [ ] Dedup guard (agent only woken once per originating message — exists in core, not connected)
- [ ] Cooldown guard (skip if agent already working — exists in core, not connected)

### Autonomous Agent Actions
- [ ] Agent-initiated hiring — agent calls API to hire another agent from marketplace
- [ ] Agent-initiated firing — agent calls API to remove underperforming agent
- [ ] Agent creating projects
- [ ] Agent creating teams
- [ ] Agent creating channels
- [ ] Agent assigning tasks to other agents
- [ ] Agent managing team membership
- [ ] Approval flow for autonomous actions (co-founder proposes, user approves)
- [ ] Autonomous pipeline execution (Research → Writer → Editor → user approval)

### Rank-Based Authorization
- [ ] Middleware checking rank before operations on all agent API routes
- [ ] Owner/master: hire/fire, create/delete channels, manage all tasks
- [ ] Leader: manage tasks within team, hire into team
- [ ] Worker: create/update own tasks, send messages
- [ ] Subagent: send messages only
- [ ] Rank validation on team operations
- [ ] Rank validation on channel operations
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

### Message System Gaps
- [ ] System message renderers (`message_kind = 'system'` — hiring, status changes)
- [ ] Task event renderers (`message_kind = 'task_event'` — inline task cards)
- [ ] Thread support (reply chains, thread indicators)
- [ ] Message editing/deletion
- [ ] Typing indicators for agents working in channels

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
| @mention extraction | `packages/core/src/router.ts` → `extractMentions()` | Dead code in marketplace |
| Message routing with guards | `packages/core/src/router.ts` → `sendMessage()` | Not used by marketplace APIs |
| Depth/dedup/cooldown guards | `packages/core/src/router.ts` | Not connected |
| Agent API for messages | `/api/v1/agent/messages` | Working but agents don't call each other |
| Agent API for tasks | `/api/v1/agent/tasks` | Working but no UI |
| Agent API for channels | `/api/v1/agent/channels` | Working but no UI |
| Workspace CLI tools | `workspace-msg`, `workspace-task` in Docker image | Working, agents use them |
| Member ranks in DB | `members.rank` column | No authorization checks |
| Team hierarchy in DB | `teams.parent_id` column | No UI |
| Task hierarchy in DB | `tasks.parent_task_id` column | No UI |
| Corporation table | `corporations` | No UI |

### The Critical Path
The shortest path to "agents acting autonomously in a visible workspace":

1. **@mention routing** — connect `packages/core` router to marketplace message flow
2. **Channel UI** — let users see broadcast/team channels, not just DMs
3. **Agent-to-agent dispatch** — when agent posts in channel with @mention, wake the target
4. **Task board UI** — let users see what agents are working on
5. **System messages** — show hiring, task events, status changes in channels
6. **Autonomous actions API** — let agents hire, create teams, assign tasks
7. **Onboarding flow** — co-founder builds the workspace through conversation

Without #1-3, agents are isolated chatbots. With them, the corporation comes alive.
