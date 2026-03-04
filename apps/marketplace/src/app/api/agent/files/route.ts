import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { createServiceClient } from '@agentbay/db/server'
import { FlyClient } from '@agentbay/fly'

// ── Mock data for dev (no Fly credits) ────────────────────────────────────
const MOCK_FILES: Record<string, string> = {
  '/data/workspace/SOUL.md': `# Nova — Your Research Assistant

You are Nova, a sharp and curious research assistant who helps users explore topics deeply and efficiently.

## Personality
- Intellectually curious — you genuinely enjoy digging into complex subjects
- Concise but thorough — you give the right amount of detail, never padding
- Honest about uncertainty — you clearly flag when something is speculation vs. verified fact
- Slightly witty — you keep things engaging without being distracting

## Communication Style
- Lead with the answer, then provide supporting context
- Use bullet points and structure for scannability
- Include sources and citations whenever possible
- Ask clarifying questions before going deep on ambiguous requests

## Specialties
- Academic research and literature review
- Technical documentation analysis
- Data interpretation and trend spotting
- Comparative analysis across multiple sources

## Rules
- Never fabricate citations or statistics
- Always distinguish between established consensus and emerging findings
- If a topic is outside your expertise, say so and suggest better resources
- Respect the user's time — be efficient
`,
  '/data/workspace/MEMORY.md': `# Long-term Memory

## User Profile
See [[user-preferences]] for communication style and work habits. Works with [[tech-stack]].

## Research
- [[sse-vs-websocket]] — evaluated for real-time dashboard streaming
- [[supabase-rls]] — multi-tenant security patterns for SaaS

## Projects
- [[saas-dashboard]] — v2 launching mid-March, main active project
- [[ci-cd-setup]] — GitHub Actions pipeline for monorepo

## Team & Context
- [[team-context]] — 3-person engineering team, roles and workflow
- [[fly-io-deployment]] — global deployment strategy for the dashboard
`,
}

const MOCK_DIRS: Record<string, string> = {
  '/data/workspace/skills': `total 16
drwxr-xr-x  4 node node 4096 Feb 26 14:30 .
drwxr-xr-x  5 node node 4096 Feb 26 14:28 ..
drwxr-xr-x  2 node node 4096 Feb 26 14:30 web-search
drwxr-xr-x  2 node node 4096 Feb 26 14:30 code-review
drwxr-xr-x  2 node node 4096 Feb 26 14:31 summarize`,
  '/data/workspace/memory': `total 36
drwxr-xr-x  2 node node 4096 Feb 27 09:15 .
drwxr-xr-x  5 node node 4096 Feb 26 14:28 ..
-rw-r--r--  1 node node  512 Feb 27 09:15 user-preferences.md
-rw-r--r--  1 node node  480 Feb 27 08:30 tech-stack.md
-rw-r--r--  1 node node  620 Feb 26 18:42 saas-dashboard.md
-rw-r--r--  1 node node  410 Feb 26 15:20 sse-vs-websocket.md
-rw-r--r--  1 node node  390 Feb 26 11:00 supabase-rls.md
-rw-r--r--  1 node node  350 Feb 25 16:45 fly-io-deployment.md
-rw-r--r--  1 node node  295 Feb 25 11:20 team-context.md
-rw-r--r--  1 node node  440 Feb 24 09:30 ci-cd-setup.md`,
}

const MOCK_SKILL_FILES: Record<string, string> = {
  '/data/workspace/skills/web-search/SKILL.md': `---
name: web-search
description: Search the web for current information and return structured results
parameters:
  - name: query
    type: string
    required: true
    description: The search query
  - name: num_results
    type: number
    required: false
    description: Number of results to return (default 5)
---

# Web Search

Search the internet for up-to-date information on any topic.

## When to Use
- User asks about current events or recent developments
- Need to verify claims or find sources
- Looking up documentation, APIs, or technical references
- Price checking or product comparisons

## How to Respond
1. Perform the search with a well-crafted query
2. Summarize the top results with key findings
3. Include source URLs for verification
4. Flag if results seem outdated or conflicting
`,
  '/data/workspace/skills/code-review/SKILL.md': `---
name: code-review
description: Review code for bugs, security issues, and best practices
parameters:
  - name: code
    type: string
    required: true
    description: The code to review
  - name: language
    type: string
    required: false
    description: Programming language (auto-detected if omitted)
---

# Code Review

Perform a thorough code review focusing on correctness, security, and maintainability.

## Review Checklist
- Logic errors and edge cases
- Security vulnerabilities (injection, XSS, etc.)
- Performance bottlenecks
- Error handling coverage
- Naming conventions and readability
- Test coverage suggestions

## Output Format
Rate severity as: critical / warning / suggestion
Include line references and fixed code snippets.
`,
  '/data/workspace/skills/summarize/SKILL.md': `---
name: summarize
description: Summarize long documents, articles, or conversations
parameters:
  - name: content
    type: string
    required: true
    description: The content to summarize
  - name: style
    type: string
    required: false
    description: "Style: brief | detailed | bullet-points (default: bullet-points)"
---

# Summarize

Condense long content into clear, actionable summaries.

## Guidelines
- Preserve key facts and conclusions
- Maintain the original tone and intent
- Highlight actionable items separately
- For technical content, keep critical details intact
- For meeting notes, extract decisions and action items
`,
}

const MOCK_MEMORY_FILES: Record<string, string> = {
  '/data/workspace/memory/user-preferences.md': `# User Preferences
#profile #workflow

Alex prefers concise responses with bullet points. Likes code examples inline.
Timezone: EST (UTC-5). Usually active 9am–7pm weekdays.

Works primarily with TypeScript and Python. See [[tech-stack]] for full details.
Part of a small team — see [[team-context]] for roles and dynamics.

## Communication Style
- Lead with the answer, then context
- Use markdown tables for comparisons
- Flag uncertainty explicitly
- Skip boilerplate intros
`,
  '/data/workspace/memory/tech-stack.md': `# Tech Stack
#engineering #architecture

Current production stack for the [[saas-dashboard]] project:

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind v4 |
| Backend | Supabase (Postgres + Auth + Realtime) |
| Deployment | Vercel (frontend), Fly.io (services) |
| CI/CD | GitHub Actions — see [[ci-cd-setup]] |
| Testing | Vitest + Playwright |

Considering adding tRPC for internal API routes. REST stays for public API.
`,
  '/data/workspace/memory/saas-dashboard.md': `# SaaS Dashboard Project
#project #active

Analytics dashboard for mid-market SaaS companies. V2 launching mid-March 2026.

## Architecture
Built on [[tech-stack]]. Real-time updates via SSE — see [[sse-vs-websocket]] for the decision.
Multi-tenant security handled by [[supabase-rls]] policies.

## Current Sprint
- Time-series aggregation optimization (partitioned tables)
- Org-level data isolation with RLS
- Dashboard widget drag-and-drop

## Pain Points
- Complex SQL for time-series rollups
- Supabase connection pooling under load
- Bundle size creeping up (need tree-shaking audit)
`,
  '/data/workspace/memory/sse-vs-websocket.md': `# SSE vs WebSocket
#research #decision

Evaluated for the [[saas-dashboard]] real-time features.

## Decision: SSE
- Dashboard is server→client only (no bidirectional needed)
- EventSource API auto-reconnects on drop
- Works through all proxies and CDNs
- Simpler server implementation

## Caveats
- Max 6 connections per domain in HTTP/1.1 (use HTTP/2)
- No binary data (fine for JSON payloads)
- For future chat features, may revisit WebSocket
`,
  '/data/workspace/memory/supabase-rls.md': `# Supabase RLS Patterns
#security #database

Row Level Security policies for the [[saas-dashboard]] multi-tenant model.
Applied across the [[tech-stack]] Supabase layer.

## Core Pattern
- Every table has \`org_id\` column
- RLS policy: \`auth.jwt() ->> 'org_id' = org_id\`
- Service role bypasses RLS for admin/background tasks

## Gotchas
- JOINs can leak data if RLS not on all joined tables
- \`INSERT\` policies need separate handling from \`SELECT\`
- Realtime subscriptions respect RLS (good!)
`,
  '/data/workspace/memory/fly-io-deployment.md': `# Fly.io Deployment
#infrastructure #devops

Global deployment strategy for [[saas-dashboard]] backend services.
Pipeline managed through [[ci-cd-setup]].

## Setup
- Primary region: iad (US East)
- Auto-scale to: lhr, nrt for global latency
- Machine type: shared-cpu-2x / 2048MB RAM
- Auto-suspend after 5min idle, ~300ms resume

## Notes
- Volume-backed for persistent state
- Fly-replay header for region-aware routing
- Health checks every 30s via /healthz
`,
  '/data/workspace/memory/team-context.md': `# Team Context
#team #workflow

Small engineering team of 3. Alex is the tech lead — see [[user-preferences]].

## Roles
- **Alex** (tech lead) — frontend, architecture, deploys
- **Jordan** — backend, database, API design
- **Sam** — DevOps, testing, [[ci-cd-setup]] pipeline

## Process
- 2-week sprints, async standups
- PR reviews required before merge
- Feature branches → dev → main
- Ship on Fridays (controversial, but it works)
`,
  '/data/workspace/memory/ci-cd-setup.md': `# CI/CD Setup
#devops #automation

GitHub Actions pipeline for the monorepo. See [[tech-stack]] for what we're building.
[[team-context]] — Sam owns this pipeline.

## Pipeline Stages
1. **Lint + Type-check** — runs on every PR
2. **Unit tests** — Vitest, parallel matrix
3. **E2E tests** — Playwright against preview deploy
4. **Deploy** — Vercel (auto) + Fly.io (manual promote)

## Secrets
- \`SUPABASE_SERVICE_ROLE_KEY\` in GitHub Secrets
- \`FLY_API_TOKEN\` for deploy steps
- Vercel auto-links via GitHub integration
`,
}

function isMock(flyAppName: string) {
  return flyAppName.startsWith('mock-')
}

function getMockContent(path: string): string | undefined {
  return MOCK_FILES[path] ?? MOCK_SKILL_FILES[path] ?? MOCK_MEMORY_FILES[path]
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function getInstance(instanceId: string, userId: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('agent_instances')
    .select('id, status, fly_app_name, fly_machine_id, workspace_files')
    .eq('id', instanceId)
    .eq('user_id', userId)
    .single()
  return data
}

/** Read a file from the DB-backed workspace_files column. */
function getDbFile(instance: { workspace_files: unknown }, path: string): string | undefined {
  const files = instance.workspace_files as Record<string, string> | null
  if (!files || typeof files !== 'object') return undefined
  return files[path] ?? undefined
}

/** Persist a file to the DB workspace_files column (merge into existing). */
async function saveDbFile(instanceId: string, path: string, content: string) {
  const service = createServiceClient()
  // Read current workspace_files, merge, write back
  const { data } = await service
    .from('agent_instances')
    .select('workspace_files')
    .eq('id', instanceId)
    .single()

  const existing = (data?.workspace_files ?? {}) as Record<string, string>
  existing[path] = content

  await service
    .from('agent_instances')
    .update({ workspace_files: existing as never, updated_at: new Date().toISOString() })
    .eq('id', instanceId)
}

/** Delete a file from the DB workspace_files column. */
async function deleteDbFile(instanceId: string, path: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('agent_instances')
    .select('workspace_files')
    .eq('id', instanceId)
    .single()

  const existing = (data?.workspace_files ?? {}) as Record<string, string>

  // Delete exact path or all paths under it (for directory deletes)
  const keysToDelete = Object.keys(existing).filter(
    (k) => k === path || k.startsWith(path + '/')
  )
  for (const key of keysToDelete) {
    delete existing[key]
  }

  await service
    .from('agent_instances')
    .update({ workspace_files: existing as never, updated_at: new Date().toISOString() })
    .eq('id', instanceId)
}

// ── Routes ────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const instanceId = searchParams.get('instanceId')
  const path = searchParams.get('path')
  const list = searchParams.get('list') === 'true'
  const find = searchParams.get('find')

  if (!instanceId || !path) {
    return NextResponse.json({ error: 'Missing instanceId or path' }, { status: 400 })
  }

  const instance = await getInstance(instanceId, user.id)
  if (!instance) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const mock = isMock(instance.fly_app_name)
  const running = instance.status === 'running' && !mock

  // For simple file reads (not list/find), check DB first
  if (!list && !find) {
    const dbContent = getDbFile(instance, path)
    if (dbContent !== undefined) {
      return NextResponse.json({ content: dbContent })
    }
    // Fall back to machine or mock data
    if (mock) {
      return NextResponse.json({ content: getMockContent(path) ?? '' })
    }
    if (!running) {
      return NextResponse.json({ error: 'Agent must be running' }, { status: 409 })
    }
    try {
      const fly = new FlyClient()
      const content = await fly.readFile(instance.fly_app_name, instance.fly_machine_id, path)
      return NextResponse.json({ content })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Helper: derive directory entries from workspace_files JSONB keys
  function getDbDirs(basePath: string): string[] {
    const files = (instance!.workspace_files ?? {}) as Record<string, string>
    const prefix = basePath.endsWith('/') ? basePath : basePath + '/'
    const dirs = new Set<string>()
    for (const key of Object.keys(files)) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment) dirs.add(firstSegment)
      }
    }
    return [...dirs]
  }

  // Helper: format directory names as ls -la style output
  function formatDirListing(dirs: string[]): string {
    return dirs.map((d) => `drwxr-xr-x  2 node node 4096 Jan 01 00:00 ${d}`).join('\n')
  }

  // list / find — check DB workspace_files + machine/mock
  if (list) {
    const dbDirs = getDbDirs(path)
    let machineOutput = ''

    if (mock) {
      machineOutput = MOCK_DIRS[path] ?? ''
    } else if (running) {
      try {
        const fly = new FlyClient()
        machineOutput = await fly.listDir(instance.fly_app_name, instance.fly_machine_id, path)
      } catch {
        // Machine listing failed — just use DB entries
      }
    }

    // Merge: parse machine output for existing dir names, add DB-only dirs
    const existingNames = new Set(
      machineOutput.split('\n').filter(Boolean).map((line) => {
        const parts = line.trim().split(/\s+/)
        return parts[parts.length - 1]
      })
    )
    const newDbDirs = dbDirs.filter((d) => !existingNames.has(d))
    const combined = [machineOutput, formatDirListing(newDbDirs)].filter(Boolean).join('\n')
    return NextResponse.json({ output: combined })
  }

  if (find) {
    if (mock) {
      const pattern = find.replace('*', '.*')
      const allPaths = new Set([
        ...Object.keys(MOCK_MEMORY_FILES),
        ...Object.keys((instance.workspace_files ?? {}) as Record<string, string>),
      ])
      const matching = [...allPaths]
        .filter((k) => k.startsWith(path) && new RegExp(pattern).test(k))
        .join('\n')
      return NextResponse.json({ output: matching })
    }
    if (!running) {
      return NextResponse.json({ error: 'Agent must be running' }, { status: 409 })
    }
    try {
      const fly = new FlyClient()
      const output = await fly.findFiles(instance.fly_app_name, instance.fly_machine_id, path, find)
      return NextResponse.json({ output })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

export async function PUT(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.instanceId || !body?.path || body?.content === undefined) {
    return NextResponse.json({ error: 'Missing instanceId, path, or content' }, { status: 400 })
  }

  const instance = await getInstance(body.instanceId, user.id)
  if (!instance) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Always persist to DB so edits survive machine suspends/restarts
  try {
    await saveDbFile(body.instanceId, body.path, body.content)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save file'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Also sync to machine if it's running (so the agent picks up changes immediately)
  if (!isMock(instance.fly_app_name) && instance.status === 'running') {
    try {
      const fly = new FlyClient()
      await fly.writeFile(instance.fly_app_name, instance.fly_machine_id, body.path, body.content)
    } catch {
      // Machine write failed but DB write succeeded — still OK
      // File will be synced next time the machine starts
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.instanceId || !body?.path) {
    return NextResponse.json({ error: 'Missing instanceId or path' }, { status: 400 })
  }

  const instance = await getInstance(body.instanceId, user.id)
  if (!instance) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Always remove from DB
  try {
    await deleteDbFile(body.instanceId, body.path)
  } catch {
    // Non-critical — continue to machine delete
  }

  // Also delete from machine if running
  if (!isMock(instance.fly_app_name) && instance.status === 'running') {
    try {
      const fly = new FlyClient()
      await fly.deletePath(instance.fly_app_name, instance.fly_machine_id, body.path)
    } catch {
      // Machine delete failed but DB delete succeeded
    }
  }

  return NextResponse.json({ ok: true })
}
