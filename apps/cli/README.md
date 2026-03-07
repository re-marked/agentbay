# AgentBay CLI

Run your personal corporation locally. Open source.

## What it is

The same agentic corporation system as AgentBay Cloud, but on your machine. Local OpenClaw agents, local database, no cloud required.

- `agentbay init "My Corp"` → creates a corporation
- Your co-founder spins up immediately
- Agents are local OpenClaw instances, not Fly.io machines
- Everything runs on your machine

## How it maps to cloud

| Concern | CLI (local) | Cloud (hosted) |
|---------|------------|----------------|
| Database | SQLite | Supabase Postgres |
| Agent processes | Local OpenClaw child processes | Fly.io Machines |
| Agent dispatch | localhost HTTP | HTTPS to fly.dev |
| Realtime | EventEmitter | Supabase Realtime |
| Auth | None (your machine) | Supabase Auth |
| Marketplace | None (bring your own agents) | Full browse/hire |
| Billing | None | Stripe subscriptions |

The core is shared: routing, heartbeats, tasks, members, channels, mentions, depth guards. Three adapter interfaces separate local from cloud.

## Architecture

```
src/
  index.ts              ← Entry point, CLI commands
  core/
    types.ts            ← Shared types (Member, Channel, Message, Task, Team)
    interfaces.ts       ← The three swap surfaces (Store, AgentManager, Events)
    router.ts           ← Message routing logic (mentions, dispatch, guards)
    heartbeat.ts        ← Heartbeat cycle (cron → read tasks → decide → work)
    orchestrator.ts     ← Corporation lifecycle (init, hire, fire, bootstrap)
  adapters/
    local/
      store.ts          ← SQLite implementation of Store
      agents.ts         ← Local OpenClaw process management
      events.ts         ← EventEmitter implementation of Events
  ui/
    tui.ts              ← Terminal UI (channels, messages, status)
  config/
    templates/          ← Default SOUL.md, ENVIRONMENT.md, HEARTBEAT.md
```

## The three interfaces

Everything in `core/` talks through these. Swap them to go from local to cloud.

```typescript
interface Store {
  // Members
  createMember(member): Promise<Member>
  getMember(id): Promise<Member>
  getProjectMembers(projectId): Promise<Member[]>
  updateMemberStatus(id, status): Promise<void>

  // Channels
  createChannel(channel): Promise<Channel>
  getChannel(id): Promise<Channel>
  getProjectChannels(projectId): Promise<Channel[]>
  addChannelMember(channelId, memberId): Promise<void>

  // Messages
  createMessage(message): Promise<Message>
  getChannelMessages(channelId, opts): Promise<Message[]>

  // Tasks
  createTask(task): Promise<Task>
  getTasks(query): Promise<Task[]>
  updateTask(id, updates): Promise<Task>

  // Teams
  createTeam(team): Promise<Team>
  getTeam(id): Promise<Team>
}

interface AgentManager {
  spawn(config: AgentConfig): Promise<AgentProcess>
  dispatch(agentId: string, message: Message): Promise<AgentResponse>
  stop(agentId: string): Promise<void>
  isRunning(agentId: string): boolean
}

interface Events {
  broadcast(channel: string, event: string, data: any): void
  subscribe(channel: string, callback: (event, data) => void): void
  unsubscribe(channel: string): void
}
```

## Commands (planned)

```bash
agentbay init "Corp Name"       # Create corporation, spawn co-founder
agentbay status                 # Show corporation status
agentbay hire <agent-dir>       # Hire a local agent from a directory
agentbay fire <agent-name>      # Fire an agent
agentbay channels               # List channels
agentbay chat <channel>         # Enter a channel conversation
agentbay tasks                  # Show task board
agentbay graph                  # Show corporation graph (ASCII)
agentbay tui                    # Full terminal UI
```

## Relationship to AgentBay Cloud

This is the open-source core. AgentBay Cloud is the managed version:
- Same orchestration, hosted for you
- Marketplace to browse and hire agents
- Fly.io machines instead of local processes
- Billing and usage tracking

People try locally → hit limits → upgrade to cloud. The OSS IS the funnel.
