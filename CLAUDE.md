# AgentBay — Codebase Guide

Your Personal Corporation — a self-growing organization of AI agents that work FOR you.
User = CEO, Personal AI = Co-founder. Not a chatbot platform. A company you own.

## #1 Priority: Read STATUS.md

**`STATUS.md`** is the honest gap analysis between the vision and what's actually built.
Read it before starting ANY new work. It has checkboxes for every missing feature.
Cross items off as they ship. The critical path is at the bottom of that file.

## Vision & Source of Truth

**`apps/docs/`** is the authoritative design spec (Obsidian vault, gitignored, local only).
Read it before building anything new. It contains:
- `vision/` — what AgentBay is, the hierarchy, agenticity, radical transparency
- `primitives/` — Members, Channels, Messages, Tasks, Teams, Externals
- `architecture/` — how things connect, swap surfaces, data flow
- `flows/` — onboarding, hiring, heartbeat, messaging
- `building-plan/` — layered implementation plan
- `screens/` — UI specs for every screen
- `concepts/` — BRAIN framework, heartbeat, autonomy, personality

When in doubt about a design decision, check `apps/docs/` first.

## Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui
- **Backend**: Supabase (Postgres + Auth + Realtime + Edge Functions)
- **Agent runtime**: OpenClaw in Firecracker microVMs on Fly.io Machines
- **Background jobs**: Trigger.dev v3 (provision, health-check, billing)
- **Payments**: Stripe (subscriptions + Connect Express for creator payouts)
- **Package manager**: pnpm (monorepo with Turborepo)

## Monorepo Structure

```
apps/
  marketplace/        # Next.js 15 app — main product (Vercel)
  cli/                # Open-source local CLI — same core, local adapters
  sse-gateway/        # Legacy SSE proxy on Fly.io (v1 only, do not modify)
  docs/               # Obsidian vault — vision & architecture (gitignored)
packages/
  core/               # Shared types, interfaces, router logic
  db/                 # Supabase client, types, auth middleware
  fly/                # Typed Fly Machines API client
  ui/                 # Shared shadcn components
  config/             # Shared ESLint, TypeScript, Prettier config
supabase/
  functions/          # Edge Functions (webhooks)
trigger/              # Trigger.dev task definitions
docker/
  agent-base/         # Base OpenClaw Docker image
```

## packages/core — The Shared Foundation

`packages/core` contains adapter-agnostic code shared by both CLI and marketplace:

- **Types**: Member, Channel, Message, Task, Team, Project, AgentConfig, AgentProcess
- **Interfaces**: Store, AgentManager, Events — three swap surfaces
- **Router**: `sendMessage()` — message pipeline with DM auto-routing, @mention routing, depth guard, dedup, cooldown

Both apps import from `@agentbay/core` and provide their own adapter implementations:

| Surface | CLI (local) | Cloud (marketplace) |
|---------|-------------|---------------------|
| **Store** | SQLite via `node:sqlite` | Supabase Postgres |
| **AgentManager** | Local OpenClaw child processes | Fly.io Machines API |
| **Events** | Node EventEmitter | Supabase Realtime |

When building new features, put adapter-agnostic logic in `packages/core`.
Put adapter-specific code in the respective app's `adapters/` directory.

## apps/cli — Open Source Local Mode

Working CLI that runs a personal corporation locally:
- `agentbay init <name>` — create corp, spawn co-founder from `~/.openclaw`
- `agentbay chat [project-id]` — resume chatting
- `agentbay status` — show corps, members, channels, tasks
- Auto-attaches to existing OpenClaw gateway (reads auth token from `~/.openclaw/openclaw.json`)
- Data stored at `~/.agentbay/agentbay.db` (SQLite)

## apps/sse-gateway — Legacy (DO NOT MODIFY)

v1 WebSocket-to-SSE bridge for the current production chat. Still deployed at `agentbay-sse-gateway.fly.dev`.
Will be decommissioned when the new workspace chat is built. Do not invest time here.

## Commands

```bash
pnpm dev              # Run all apps in dev mode
pnpm dev --filter marketplace   # Run marketplace only
pnpm build            # Build all
pnpm lint             # Lint all
pnpm type-check       # Type-check all
```

## marketplace app

**Entry**: `apps/marketplace/src/`

### Route Groups

| Group | Routes | Auth |
|-------|--------|------|
| `(public)` | `/`, `/discover`, `/agents/[id]`, `/login` | None |
| `(workspace)` | `/workspace/*`, `/settings/*`, `/usage` | Required → `/login` |
| `(platform)` | `/platform/*` | Required (creator role) → `/platform/login` |

### Styling

Global design tokens live in `src/app/globals.css`. Change these to restyle the whole app:

```css
--radius: 1rem;          /* border radius scale */
--primary: ...           /* brand color */
```

shadcn components auto-derive from these variables. Never hardcode values — change the token.

## Auth Flow

1. User clicks "Continue with Google" → `signInWithGoogle()` server action
2. Supabase redirects to Google → callback hits `/auth/callback`
3. `exchangeCodeForSession()` sets cookie → redirect to `/workspace/home`
4. `middleware.ts` refreshes session on every request
5. On first sign-up: `handle_new_user` Postgres trigger creates `users` row + 100 free credits

## Database

Schema in Supabase. Two systems coexist during migration:

**Legacy (v1 — powers current UI):**

| Table | Purpose |
|-------|---------|
| `agent_instances` | User ↔ Agent pair + Fly.io machine info |
| `sessions` | Chat sessions |
| `messages` | Message history |

**Workspace (v2 — being built):**

| Table | Purpose |
|-------|---------|
| `members` | Agent/user identity within a project (rank, status, type) |
| `channels` | Communication channels (broadcast, team, direct, system) |
| `channel_messages` | Messages in channels |
| `tasks` | Work items with status, priority, assignment |
| `teams` | Organizational units within projects |

RLS is enabled on all tables. Service role (used by Trigger.dev) bypasses RLS.

## OpenClaw API Key Storage

**CRITICAL**: OpenClaw reads API keys from `auth-profiles.json`, NOT env vars:

```
/data/agents/main/agent/auth-profiles.json
```

The provisioning task passes API keys as env vars. The Docker entrypoint converts them to `auth-profiles.json`. Missing file = silent failure.

## Trigger.dev Tasks

| File | ID | Trigger |
|------|----|---------|
| `provision-agent-machine.ts` | `provision-agent-machine` | Manual / webhook |
| `destroy-agent-machine.ts` | `destroy-agent-machine` | Manual |
| `health-check-machines.ts` | `health-check-machines` | Cron every 5 min |
| `shutdown-idle-machines.ts` | `shutdown-idle-machines` | Cron every hour |

## Operational Tasks

Run infrastructure commands directly — never ask the user to do these manually:

- **SQL migrations**: Run via `npx supabase` CLI or the Supabase Management API
- **Docker**: Build and push images (`docker build`, `docker push`, `fly auth docker`)
- **Fly.io**: Deploy apps, manage machines (`fly deploy`, `fly machine list`, etc.)
- **Trigger.dev**: Deploy tasks (`npx trigger.dev@latest deploy`)
- **Type generation**: Regenerate DB types after schema changes (`npx supabase gen types`)

## Key Conventions

- **Server Components by default**: use `'use client'` only when needed
- **Service client for admin ops**: `createServiceClient()` from `@agentbay/db/server`
- **Regular client for user ops**: `createClient()` from `@agentbay/db/server`
- **shadcn components**: go in `src/components/ui/` — don't edit these manually
- **Branching strategy**:
  - `main` = stable production. Do NOT push directly.
  - `dev` = v2 integration branch. All new work lands here.
  - `feature/*` = short-lived branches off `dev`.
  - Flow: `feature/xyz` → PR into `dev` (rebase merge) → delete feature branch.
- **Commit frequently**: Small focused commits, multiple per prompt.
- **Always add co-authors**: Include both in every commit:
  - `Co-Authored-By: Mark <psyhik17@gmail.com>`
  - `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Worktrees for Parallel Sessions

```bash
# Create a worktree branched off dev
git worktree add .claude/worktrees/feature-xyz -b feature/xyz dev
cd .claude/worktrees/feature-xyz && pnpm install
```

Rules: always branch off `dev`, never two worktrees on same branch, always remove after merge.

Guidelines:

<default_to_action>
By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing. Try to infer the user's intent about whether a tool call (e.g., file edit or read) is intended or not, and act accordingly.
</default_to_action>

<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. Prioritize calling tools simultaneously whenever the actions can be done in parallel rather than sequentially. For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time. Maximize use of parallel tool calls where possible to increase speed and efficiency. However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls.
</use_parallel_tool_calls>

<decide_approach>
When you're deciding how to approach a problem, choose an approach and commit to it. Avoid revisiting decisions unless you encounter new information that directly contradicts your reasoning. If you're weighing two approaches, pick one and see it through. You can always course-correct later if the chosen approach fails.
</decide_approach>

<reason_throughly>
After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action.
</reason_throughly>

<context_compaction>
Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Therefore, do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to memory before the context window refreshes. Always be as persistent and autonomous as possible and complete tasks fully, even if the end of your budget is approaching. Never artificially stop any task early regardless of the context remaining.
</context_compaction>

<balancing_autonomy_and_safety>
Consider the reversibility and potential impact of your actions. You are encouraged to take local, reversible actions like editing files or running tests, but for actions that are hard to reverse, affect shared systems, or could be destructive, ask the user before proceeding.

Examples of actions that warrant confirmation:
- Destructive operations: deleting files or branches, dropping database tables, rm -rf
- Hard to reverse operations: git push --force, git reset --hard, amending published commits
- Operations visible to others: pushing code, commenting on PRs/issues, sending messages, modifying shared infrastructure

When encountering obstacles, do not use destructive actions as a shortcut. For example, don't bypass safety checks (e.g. --no-verify) or discard unfamiliar files that may be in-progress work.
</balancing_autonomy_and_safety>

<sub_agents>
Use subagents when tasks can run in parallel, require isolated context, or involve independent workstreams that don't need to share state. For simple tasks, sequential operations, single-file edits, or tasks where you need to maintain context across steps, work directly rather than delegating.
</sub_agents>

<clean_up_temporary_files>
If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task. Do not leave any temporary files behind.
</clean_up_temporary_files>

<investigate_before_answering>
Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.
</investigate_before_answering>

<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight.

Focus on:
- Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
- Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
- Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
- Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
