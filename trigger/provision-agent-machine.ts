import { task, logger } from '@trigger.dev/sdk/v3'
import { createServiceClient } from '@agentbay/db'
import { Agents } from '@agentbay/db/primitives'
import { FlyClient } from '@agentbay/fly'
import { AGENT_ROLES } from './agent-roles'
import { PERSONAL_AI_ROLE } from './personal-ai-role'
import { generateTeamLeaderRole } from './team-leader-role'

// Hardcoded — do NOT use env var, Trigger.dev cloud env gets stale.
// Bump this when you push a new image. Never use :latest (Fly doesn't pull fresh).
const BASE_IMAGE = 'registry.fly.io/agentbay-agent-base:v2026.3.17-dev'
const FLY_ORG = process.env.FLY_ORG_SLUG ?? 'personal'
const FLY_REGION = process.env.FLY_REGION ?? 'ord'

export interface ProvisionPayload {
  userId: string
  agentId: string
  instanceId: string
  role?: string
  projectId?: string    // Workspace context
  memberId?: string     // Agent's member ID
  isCoFounder?: boolean // Triggers Personal AI role
  isTeamLeader?: boolean // Triggers team leader role
  teamId?: string       // Team UUID (for app naming)
  teamName?: string     // Team name (for identity)
  teamDescription?: string | null // Team purpose (for WHOAMI.md)
}

/**
 * Allocate a shared IPv4 and dedicated IPv6 for a Fly app.
 * Uses the Fly GraphQL API (Machines REST API doesn't support IP allocation).
 * Requires FLY_GRAPHQL_TOKEN (org-level token) or falls back to FLY_API_TOKEN.
 */
async function allocatePublicIPs(appName: string): Promise<void> {
  const token = process.env.FLY_GRAPHQL_TOKEN ?? process.env.FLY_API_TOKEN
  if (!token) return

  const mutation = `
    mutation($appId: ID!, $type: IPAddressType!) {
      allocateIpAddress(input: { appId: $appId, type: $type }) {
        ipAddress { id address type }
      }
    }
  `

  for (const type of ['shared_v4', 'v6']) {
    try {
      const res = await fetch('https://api.fly.io/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation, variables: { appId: appName, type } }),
      })
      const json = await res.json() as { errors?: { message: string }[] }
      if (json.errors?.length) {
        logger.warn(`IP allocation warning for ${type}`, { errors: json.errors.map(e => e.message) })
      } else {
        logger.info(`Allocated ${type} for ${appName}`)
      }
    } catch (err) {
      logger.warn(`Failed to allocate ${type} for ${appName}`, { error: String(err) })
    }
  }
}

/** Deep-merge two config objects (b overrides a) */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const result = { ...a }
  for (const key in b) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) && a[key] && typeof a[key] === 'object') {
      result[key] = deepMerge(a[key] as Record<string, unknown>, b[key] as Record<string, unknown>)
    } else {
      result[key] = b[key]
    }
  }
  return result
}

export const provisionAgentMachine = task({
  id: 'provision-agent-machine',
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
  },

  // Only mark as error after ALL retries are exhausted
  onFailure: async ({ payload, error }) => {
    logger.error('Provisioning failed permanently (all retries exhausted)', {
      instanceId: payload.instanceId,
      error: error instanceof Error ? error.message : String(error),
    })
    await Agents.updateInstance(payload.instanceId, { status: 'error' })
  },

  run: async (payload: ProvisionPayload) => {
    const { userId, agentId, instanceId, role: roleId, isCoFounder, isTeamLeader, teamId, teamName, teamDescription, projectId, memberId } = payload
    const fly = new FlyClient()

    try {
      // ── 1. Load agent definition ─────────────────────────────────────────
      const agent = await Agents.findDefById(agentId)
      if (!agent) throw new Error(`Agent not found: ${agentId}`)

      // ── 1b. Load role definition if this is a sub-agent ──────────────────
      const role = roleId ? AGENT_ROLES[roleId] : undefined
      if (roleId && !role) throw new Error(`Unknown role: ${roleId}`)

      // ── 2. Load user's API keys (BYOK) and model preference ─────────────
      // These tables don't have primitives — they're only used by provision
      const db = createServiceClient()

      const { data: apiKeys } = await db
        .from('user_api_keys')
        .select('provider, api_key')
        .eq('user_id', userId)

      const { data: userRow } = await db
        .from('users')
        .select('default_model')
        .eq('id', userId)
        .single()

      // If user has explicitly set a default model, use it; otherwise Routeway is primary
      // (Google models are poor at agentic tool use — Routeway models are much better)
      const userDefaultModel = (userRow as { default_model: string } | null)?.default_model
      const defaultModel = userDefaultModel ?? 'routeway/claude-sonnet-4.6'

      const keyEnv: Record<string, string> = {}
      for (const row of apiKeys ?? []) {
        if (row.provider === 'anthropic') keyEnv.ANTHROPIC_API_KEY = row.api_key
        if (row.provider === 'openai') keyEnv.OPENAI_API_KEY = row.api_key
        // OpenClaw reads GEMINI_API_KEY, not GOOGLE_API_KEY
        if (row.provider === 'google') keyEnv.GEMINI_API_KEY = row.api_key
        // Routeway: OpenAI-compatible gateway — entrypoint writes it as openai:routeway profile with custom baseUrl
        if (row.provider === 'routeway') keyEnv.ROUTEWAY_API_KEY = row.api_key
      }

      // Always include platform Routeway key — it's the primary provider for agentic usage.
      // User's own Routeway key takes precedence if they have one.
      if (!keyEnv.ROUTEWAY_API_KEY) {
        const platformRouteKey = process.env.PLATFORM_ROUTEWAY_API_KEY
        if (platformRouteKey) {
          keyEnv.ROUTEWAY_API_KEY = platformRouteKey
          logger.info('Using platform Routeway key (user has no personal Routeway key)')
        }
      }

      // If no keys at all (not even platform Routeway), fail
      if (Object.keys(keyEnv).length === 0) {
        throw new Error('No API keys configured. Add at least one key in Settings.')
      }

      const image = (agent as any).docker_image ?? BASE_IMAGE
      // Co-founder gets special name, team leaders by team ID, sub-agents by role, master agents by slug
      const appName = isCoFounder
        ? `ab-cofounder-${userId.slice(0, 8)}`
        : isTeamLeader && teamId
          ? `ab-tl-${teamId.slice(0, 8)}`
          : role
            ? `ab-${role.id}-${userId.slice(0, 8)}`
            : `ab-${agent.slug}-${userId.slice(0, 8)}`
      const gatewayToken = crypto.randomUUID()

      logger.info('Provisioning agent machine', { appName, userId, agentId })

      // ── 3. Upsert Fly app + allocate public IPs ──────────────────────────
      const app = await fly.upsertApp(appName, FLY_ORG)
      await allocatePublicIPs(appName)
      logger.info('Fly app ready with IPs', { appName: app.name })

      // ── 4. Clean up orphaned machines and volumes ──────────────────────────
      const existingMachines = await fly.listMachines(appName)
      for (const m of existingMachines) {
        try {
          await fly.deleteMachine(appName, m.id, true)
          logger.info('Destroyed orphaned machine', { machineId: m.id, state: m.state })
        } catch (err) {
          logger.warn('Failed to destroy orphaned machine', { machineId: m.id, error: String(err) })
        }
      }

      const existingVolumes = await fly.listVolumes(appName)
      for (const v of existingVolumes) {
        if (!v.attached_machine_id) {
          try {
            await fly.deleteVolume(appName, v.id)
            logger.info('Deleted orphaned volume', { volumeId: v.id, zone: v.zone })
          } catch (err) {
            logger.warn('Failed to delete orphaned volume', { volumeId: v.id, error: String(err) })
          }
        }
      }

      const volume = await fly.createVolume(appName, {
        name: 'agent_data',
        region: FLY_REGION,
        size_gb: 1,
        encrypted: true,
      })
      logger.info('Volume created', { volumeId: volume.id })

      // ── 5. Create machine ─────────────────────────────────────────────────
      const teamLeaderRole = isTeamLeader && teamName
        ? generateTeamLeaderRole(teamName, teamDescription ?? null)
        : null

      const roleEnv: Record<string, string> = {}
      if (isCoFounder) {
        roleEnv.AGENT_SOUL_MD = PERSONAL_AI_ROLE.soul
        roleEnv.AGENT_WHOAMI_MD = PERSONAL_AI_ROLE.whoami
        roleEnv.AGENT_WHEREAMI_MD = PERSONAL_AI_ROLE.whereami
        roleEnv.AGENT_YAML = PERSONAL_AI_ROLE.agentYaml
      } else if (teamLeaderRole) {
        roleEnv.AGENT_SOUL_MD = teamLeaderRole.soul
        roleEnv.AGENT_WHOAMI_MD = teamLeaderRole.whoami
        roleEnv.AGENT_WHEREAMI_MD = teamLeaderRole.whereami
        roleEnv.AGENT_YAML = teamLeaderRole.agentYaml
      } else if (role) {
        roleEnv.AGENT_SOUL_MD = role.soul
        roleEnv.AGENT_YAML = role.agentYaml
      }

      // Workspace context — all agents get Supabase direct access + identity
      if (projectId) roleEnv.AGENT_PROJECT_ID = projectId
      if (memberId) roleEnv.AGENT_MEMBER_ID = memberId
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) roleEnv.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) roleEnv.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

      const modelOverrides = {
        agents: { defaults: { model: { primary: defaultModel }, sandbox: { mode: 'off' } } },
      }

      const roleOcOverrides = (isCoFounder
        ? PERSONAL_AI_ROLE.openclawOverrides
        : teamLeaderRole
          ? teamLeaderRole.openclawOverrides
          : role?.openclawOverrides ?? {}) as Record<string, unknown>
      const finalOverrides = deepMerge(roleOcOverrides, modelOverrides as unknown as Record<string, unknown>)

      const machine = await fly.createMachine(appName, {
        region: FLY_REGION,
        config: {
          image,
          env: {
            OPENCLAW_STATE_DIR: '/data',
            OPENCLAW_GATEWAY_TOKEN: gatewayToken,
            NODE_OPTIONS: '--max-old-space-size=1536',
            NODE_ENV: 'production',
            AGENT_OPENCLAW_OVERRIDES: JSON.stringify(finalOverrides),
            ...keyEnv,
            ...roleEnv,
          },
          mounts: [{ volume: volume.id, path: '/data' }],
          services: [
            {
              protocol: 'tcp',
              internal_port: 18789,
              ports: [
                { port: 443, handlers: ['tls', 'http'] },
                { port: 80, handlers: ['http'] },
              ],
              autostop: 'off',
              autostart: true,
              min_machines_running: 1,
              checks: [
                {
                  type: 'http',
                  port: 18789,
                  path: '/healthz',
                  method: 'GET',
                  interval: '30s',
                  timeout: '5s',
                  grace_period: '90s',
                },
              ],
            },
          ],
          guest: {
            cpu_kind: 'shared',
            cpus: 2,
            memory_mb: Math.max((agent as any).fly_machine_memory_mb ?? 2048, 2048),
          },
          restart: { policy: 'always', max_retries: 5 },
        },
      })

      logger.info('Machine created', { machineId: machine.id })

      // ── 6. Wait for machine to start ─────────────────────────────────────
      await fly.waitForMachineState(appName, machine.id, 'started', 60)
      logger.info('Machine started', { machineId: machine.id })

      // ── 6b. Wait for health check to pass ──────────────────────────────
      const healthUrl = `https://${appName}.fly.dev/healthz`
      const healthTimeout = 120_000
      const healthInterval = 5_000
      const healthStart = Date.now()

      while (Date.now() - healthStart < healthTimeout) {
        try {
          const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) })
          if (res.ok) {
            logger.info('Health check passed', { appName })
            break
          }
        } catch {
          // Not ready yet
        }
        await new Promise((r) => setTimeout(r, healthInterval))
      }

      if (Date.now() - healthStart >= healthTimeout) {
        logger.warn('Health check did not pass within timeout, marking running anyway', { appName })
      }

      // ── 7. Store machine info + gateway token in DB ──────────────────────
      await Agents.updateInstance(instanceId, {
        fly_app_name: appName,
        fly_machine_id: machine.id,
        fly_volume_id: volume.id,
        gateway_token: gatewayToken,
        region: FLY_REGION,
        status: 'running',
      })

      logger.info('Instance record updated', { instanceId })

      return {
        machineId: machine.id,
        appName,
        volumeId: volume.id,
        region: FLY_REGION,
      }
    } catch (err) {
      logger.error('Provisioning attempt failed (will retry)', {
        instanceId,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err // rethrow so Trigger.dev retries
    }
  },
})
