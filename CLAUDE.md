# AgentBay — Codebase Guide

App Store-style marketplace for OpenClaw AI agents. Users hire assistants; creators publish and earn.
(Rebranded from OpenAgents to AgentBay — may revert later)

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
  router/             # Hono app — central message pipeline (replaces SSE Gateway)
  sse-gateway/        # Hono app — SSE proxy on Fly.io (legacy, being replaced by Router)
  docs/               # Architecture documentation
packages/
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

### Key Files

```
src/
  app/
    layout.tsx                    # Root layout (fonts, providers, theme)
    globals.css                   # Tailwind v4 + shadcn CSS vars (edit --radius etc here)
    icon.tsx                      # Favicon (auto-generated from Sierpinski logo)
    (public)/layout.tsx           # Public layout — uses PublicSiteHeader
    (workspace)/layout.tsx        # Workspace layout — auth guard
    (platform)/layout.tsx         # Platform layout — auth guard
    auth/callback/route.ts        # OAuth callback handler
  components/
    ui/                           # shadcn components (don't edit manually)
    public-site-header.tsx        # Nav with search bar (/ shortcut)
    sierpinski-logo.tsx           # SVG logo
    providers.tsx                 # Theme provider
  lib/
    auth/
      actions.ts                  # signInWithGoogle, signInWithGitHub, signOut
      get-user.ts                 # getUser() — server-side
    trigger.ts                    # triggerProvision, triggerDestroy helpers
    utils.ts                      # cn() helper
  middleware.ts                   # Supabase session refresh on every request
```

### Styling

Global design tokens live in `src/app/globals.css`. Change these to restyle the whole app:

```css
--radius: 1rem;          /* border radius scale */
--primary: ...           /* brand color */
```

shadcn components auto-derive from these variables. Never hardcode `rounded-lg` values in one-off components — change the token.

## Auth Flow

1. User clicks "Continue with Google" → `signInWithGoogle()` server action
2. Supabase redirects to Google → callback hits `/auth/callback`
3. `exchangeCodeForSession()` sets cookie → redirect to `/workspace/home`
4. `middleware.ts` refreshes session on every request
5. Layout files double-check auth and redirect if unauthenticated
6. On first sign-up: `handle_new_user` Postgres trigger creates `users` row + 100 free credits

## Database

Schema in Supabase. Key tables:

| Table | Purpose |
|-------|---------|
| `users` | User profiles (mirrors auth.users) |
| `agents` | Marketplace listings |
| `agent_instances` | User ↔ Agent pair + Fly.io machine info |
| `sessions` | Chat sessions |
| `messages` | Message history |
| `credit_balances` | User credits (subscription + topup) |
| `credit_transactions` | Credit ledger |
| `usage_events` | Token/compute usage per session |
| `creator_earnings` | Per-session earnings for creators |
| `relay_connections` | Telegram/Slack/Discord/WhatsApp links |

RLS is enabled on all tables. Service role (used by Trigger.dev) bypasses RLS.

## Agent Lifecycle

```
User hires → agent_instances INSERT (status=provisioning)
  → Supabase DB webhook → Edge Function: on-purchase-created
  → Trigger.dev: provision-agent-machine
  → Fly.io: create App + Volume + Machine
  → Machine starts OpenClaw on port 18789
  → agent_instances UPDATE (status=running)
  → User redirected to chat
```

Suspend/resume is handled automatically by Fly.io (`autostop: suspend`). ~200-500ms resume.

## OpenClaw API Key Storage

**CRITICAL**: OpenClaw does NOT read API keys from environment variables. It reads them from `auth-profiles.json` on the volume:

```
/data/agents/main/agent/auth-profiles.json
```

This file must exist on the agent's volume for the agent to call any LLM provider. Format:

```json
{
  "profiles": {
    "google": { "type": "api-key", "apiKey": "<GEMINI_API_KEY>" },
    "anthropic": { "type": "api-key", "apiKey": "<ANTHROPIC_API_KEY>" },
    "openai": { "type": "api-key", "apiKey": "<OPENAI_API_KEY>" }
  }
}
```

The provisioning task (`trigger/provision-agent-machine.ts`) passes API keys as env vars (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). The Docker entrypoint (`docker/agent-base/entrypoint.sh`) must convert these env vars into `auth-profiles.json` at boot so OpenClaw can find them.

If a machine has a fresh volume with no `auth-profiles.json`, the agent will silently fail — it logs "No API key found for provider" but does NOT send an error over WebSocket, causing the gateway to hang.

## Trigger.dev Tasks

| File | ID | Trigger |
|------|----|---------|
| `provision-agent-machine.ts` | `provision-agent-machine` | Manual / webhook |
| `destroy-agent-machine.ts` | `destroy-agent-machine` | Manual |
| `health-check-machines.ts` | `health-check-machines` | Cron every 5 min |
| `shutdown-idle-machines.ts` | `shutdown-idle-machines` | Cron every hour |

Deploy tasks: `npx trigger.dev@latest deploy`

## Fly.io Client

`packages/fly` — typed wrapper around Fly Machines API.

```typescript
import { FlyClient } from '@agentbay/fly'
const fly = new FlyClient() // reads FLY_API_TOKEN from env
await fly.createMachine(appName, { region, config })
await fly.waitForMachineState(appName, machineId, 'started')
```

## SSE Gateway

`apps/sse-gateway/` — thin Hono app deployed on Fly.io.

- Receives POST `/v1/stream` from Vercel with `x-machine-id` header
- Uses `fly-replay` to route to correct agent machine
- Proxies SSE response back to Vercel
- Vercel can't reach Fly.io 6PN directly — this bridges the gap

## Environment Variables

Copy `apps/marketplace/.env.local.example` → `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FLY_API_TOKEN=          # From fly.io → Tokens
FLY_ORG_SLUG=personal
FLY_REGION=iad
TRIGGER_SECRET_KEY=     # From trigger.dev → API Keys
SSE_GATEWAY_URL=        # Your deployed sse-gateway Fly app URL
SSE_GATEWAY_SECRET=     # Random string, set on both sides
NEXT_PUBLIC_APP_URL=http://localhost:3000
```


## Operational Tasks

You have full access to run infrastructure commands directly — never ask the user to do these manually:

- **SQL migrations**: Run via `npx supabase` CLI or the Supabase Management API
- **Docker**: Build and push images (`docker build`, `docker push`, `fly auth docker`)
- **Fly.io**: Deploy apps, manage machines (`fly deploy`, `fly machine list`, etc.)
- **Trigger.dev**: Deploy tasks (`npx trigger.dev@latest deploy`)
- **Type generation**: Regenerate DB types after schema changes (`npx supabase gen types`)

## Key Conventions

- **Use Agent with an A for AgentBay's agents, and agent with an a for any other agent.**
- **Server Components by default**: use `'use client'` only when needed (interactivity, hooks)
- **Service client for admin ops**: use `createServiceClient()` from `@agentbay/db/server` in Trigger.dev tasks — bypasses RLS
- **Regular client for user ops**: use `createClient()` from `@agentbay/db/server` in route handlers/Server Components
- **shadcn components**: go in `src/components/ui/` — don't edit these manually
- **Branching strategy (v2 development)**:
  - `main` = stable production (AgentBay v1). Do NOT push directly.
  - `dev` = v2 integration branch. All new workspace platform work lands here.
  - `feature/*` = short-lived feature branches, always branched off `dev`.
  - Flow: `feature/xyz` → PR into `dev` (rebase merge) → delete feature branch.
  - When AgentBay v2 is ready: merge `dev` into `main` via PR.
- **When working on a new feature**: create a git branch named `feature/feature-name` off `dev` and commit & push changes on that branch
- **When feature is ready**: merge the branch into `dev` via rebase with a proper documented PR and delete the feature branch
- **Prioritize committing more frequently (IMPORTANT)**: Commit often, with small, focused changes, multiple commits per each prompt. This makes it easier to review and merge changes.
- **Always add co-authors**: Include both authors (me and Claude) in every commit. Make sure to include the email address of each author. My email is psyhik17@gmail.com and my Github username is re-marked.

## Worktrees for Parallel Sessions

When the user wants you to work on a feature in parallel with other Claude Code sessions, use a git worktree. This gives you an isolated copy of the repo on your own branch so you don't interfere with other sessions.

### How to set up a worktree

```bash
# Create a worktree branched off dev
git worktree add .claude/worktrees/feature-xyz -b feature/xyz dev

# Install dependencies in the worktree
cd .claude/worktrees/feature-xyz && pnpm install
```

Then do all your work inside `.claude/worktrees/feature-xyz/`. Commit and push to `feature/xyz` as normal.

### When you're done

```bash
# Push your branch
git push -u origin feature/xyz

# Create a PR to merge feature/xyz → dev via rebase
gh pr create --base dev --title "feat: xyz" --body "..."

# Go back to repo root and remove the worktree
cd /path/to/agentbay
git worktree remove .claude/worktrees/feature-xyz
```

### Rules you must follow

- Always branch worktrees off `dev`, never off `main`
- Never have two worktrees on the same branch
- Never push to a branch that another session is using
- Always remove the worktree after the PR is merged — run `git worktree prune` to clean up stale refs
- If the user says `/worktree`, use the built-in Claude Code worktree command instead of manual setup

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