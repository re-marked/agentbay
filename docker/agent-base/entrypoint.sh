#!/bin/sh
# AgentBay agent entrypoint
# Seed config + workspace on first boot only; always refresh auth-profiles from env

mkdir -p /data/workspace /data/memory /data/sessions

# ── 1. Seed openclaw.json on first boot only (never overwrite user edits)
if [ ! -f /data/openclaw.json ]; then
  echo "[entrypoint] First boot — seeding openclaw.json"
  cp /opt/openclaw-defaults/openclaw.json /data/openclaw.json

  # Apply provisioner overrides (model, sandbox, etc.) on first boot
  if [ -n "$AGENT_OPENCLAW_OVERRIDES" ]; then
    node -e "\
      const fs = require('fs');\
      const base = JSON.parse(fs.readFileSync('/data/openclaw.json'));\
      const over = JSON.parse(process.env.AGENT_OPENCLAW_OVERRIDES);\
      function merge(a, b) {\
        for (const k in b) {\
          if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {\
            a[k] = merge(a[k] || {}, b[k]);\
          } else { a[k] = b[k]; }\
        } return a;\
      }\
      fs.writeFileSync('/data/openclaw.json', JSON.stringify(merge(base, over), null, 2));\
    "
  fi
else
  echo "[entrypoint] Existing openclaw.json found — preserving user config"
fi

# ── 1b. Strip/fix problematic keys in OpenClaw v2026.2.25
#   - tools.elevated.autoApprove: deprecated, crashes newer versions
#   - tools.elevated.enabled: must be false — gateway can't handle approval requests
#   - agents.defaults.elevatedDefault: remove to avoid elevated mode
#   - agents.defaults.subagents: causes gateway init hang, corrupts volume state
if [ -f /data/openclaw.json ]; then
  node -e "\
    const fs = require('fs');\
    const cfg = JSON.parse(fs.readFileSync('/data/openclaw.json', 'utf8'));\
    let changed = false;\
    if (cfg.tools?.elevated?.autoApprove !== undefined) {\
      delete cfg.tools.elevated.autoApprove;\
      changed = true;\
    }\
    if (cfg.tools?.elevated?.enabled === true) {\
      cfg.tools.elevated.enabled = false;\
      changed = true;\
    }\
    if (cfg.agents?.defaults?.elevatedDefault !== undefined) {\
      delete cfg.agents.defaults.elevatedDefault;\
      changed = true;\
    }\
    if (cfg.agents?.defaults?.subagents !== undefined) {\
      delete cfg.agents.defaults.subagents;\
      changed = true;\
    }\
    if (changed) {\
      fs.writeFileSync('/data/openclaw.json', JSON.stringify(cfg, null, 2));\
      console.log('[entrypoint] Fixed problematic config keys in openclaw.json');\
    }\
  "
fi

# ── 1c. Migrate deprecated model names on existing volumes
if [ -f /data/openclaw.json ] && grep -q '"gemini-2.0-flash"' /data/openclaw.json; then
  sed -i 's/gemini-2.0-flash/gemini-2.5-flash/g' /data/openclaw.json
  echo "[entrypoint] Migrated model from gemini-2.0-flash → gemini-2.5-flash"
fi

# ── 1d. Always ensure Routeway provider is registered (on every boot so existing volumes get it)
# Also migrates model to routeway/minimax-m2.5 when machine has only Routeway key.
if [ -f /data/openclaw.json ] && [ -n "$ROUTEWAY_API_KEY" ]; then
  export ROUTEWAY_MODEL="${PLATFORM_ROUTEWAY_DEFAULT_MODEL:-routeway/minimax-m2.5}"
  node -e "\
    const fs = require('fs');\
    const cfg = JSON.parse(fs.readFileSync('/data/openclaw.json', 'utf8'));\
    let changed = false;\
    \
    cfg.models = cfg.models || {};\
    cfg.models.mode = 'merge';\
    cfg.models.providers = cfg.models.providers || {};\
    if (!cfg.models.providers.routeway) {\
      cfg.models.providers.routeway = {\
        baseUrl: 'https://api.routeway.ai/v1',\
        apiKey: '\${ROUTEWAY_API_KEY}',\
        api: 'openai-completions',\
        models: [{ id: 'minimax-m2.5', name: 'MiniMax M2.5' }]\
      };\
      changed = true;\
      console.log('[entrypoint] Registered routeway provider in openclaw.json');\
    }\
    \
    const noByok = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY;\
    const current = cfg.agents?.defaults?.model?.primary ?? '';\
    if (noByok && current !== process.env.ROUTEWAY_MODEL) {\
      cfg.agents = cfg.agents || {};\
      cfg.agents.defaults = cfg.agents.defaults || {};\
      cfg.agents.defaults.model = cfg.agents.defaults.model || {};\
      cfg.agents.defaults.model.primary = process.env.ROUTEWAY_MODEL;\
      changed = true;\
      console.log('[entrypoint] Routeway-only: set model to', process.env.ROUTEWAY_MODEL);\
    }\
    \
    if (changed) fs.writeFileSync('/data/openclaw.json', JSON.stringify(cfg, null, 2));\
  "
fi

# ── 2. Seed workspace files — full copy on first boot, missing-files-only on subsequent boots
if [ -z "$(ls -A /data/workspace 2>/dev/null)" ]; then
  cp -r /opt/openclaw-defaults/workspace/. /data/workspace/ 2>/dev/null || true
else
  # Copy any new default files that don't yet exist on the volume (won't overwrite user edits)
  for src in /opt/openclaw-defaults/workspace/*; do
    fname="$(basename "$src")"
    dest="/data/workspace/$fname"
    if [ ! -e "$dest" ]; then
      cp -r "$src" "$dest" 2>/dev/null || true
      echo "[entrypoint] Added new workspace file: $fname"
    fi
  done
fi

# ── 3. Role overrides (sub-agents + co-founder) — only on first boot
if [ -n "$AGENT_SOUL_MD" ] && [ ! -f /data/.initialized ]; then
  printf '%s' "$AGENT_SOUL_MD" > /data/workspace/SOUL.md
fi
if [ -n "$AGENT_YAML" ] && [ ! -f /data/.initialized ]; then
  printf '%s' "$AGENT_YAML" > /data/workspace/AGENT.yaml
fi
if [ -n "$AGENT_WHOAMI_MD" ] && [ ! -f /data/.initialized ]; then
  printf '%s' "$AGENT_WHOAMI_MD" > /data/workspace/WHOAMI.md
fi
if [ -n "$AGENT_WHEREAMI_MD" ] && [ ! -f /data/.initialized ]; then
  printf '%s' "$AGENT_WHEREAMI_MD" > /data/workspace/WHEREAMI.md
fi

# ── 3b. Inject workspace tools reference into AGENTS.md (once, idempotent)
# OpenClaw auto-loads AGENTS.md as system instructions. Without this, agents
# won't know about workspace-msg / workspace-task CLI tools.
if [ -n "$ROUTER_URL" ]; then
  # Create AGENTS.md if it doesn't exist yet (OpenClaw creates it on first run, but we need it now)
  [ -f /data/workspace/AGENTS.md ] || touch /data/workspace/AGENTS.md
  if ! grep -q "Workspace Tools" /data/workspace/AGENTS.md; then
    cat >> /data/workspace/AGENTS.md <<'TOOLS_EOF'

## Workspace Tools

You have CLI tools for interacting with the workspace. Use them proactively.

Read these on every session: WHOAMI.md, WHEREAMI.md, WORKSPACE-TOOLS.md

Quick reference:
- workspace-msg channels - list your channels
- workspace-msg send CHANNEL_ID "message" - send a message
- workspace-msg read CHANNEL_ID - read channel history
- workspace-task create "title" --description "..." - create a task
- workspace-task list - list tasks
- workspace-task update TASK_ID --status in_progress - update a task
TOOLS_EOF
    echo "[entrypoint] Injected workspace tools reference into AGENTS.md"
  fi
fi

# ── 4. Normalize Google key name for OpenClaw compatibility
if [ -n "$GOOGLE_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
  export GEMINI_API_KEY="$GOOGLE_API_KEY"
fi

# ── 5. Write auth-profiles.json from env vars (always refresh — keys may change)
# OpenClaw does NOT read API keys from env vars — it reads them from
# /data/agents/main/agent/auth-profiles.json. We must generate this file
# from the env vars that the provisioning task passes to the machine.
# Format: version 1, provider:name keys, 'key' field (not 'apiKey').
# Breaking change in OpenClaw 2026.2.19 (Issue #21448).
AUTH_DIR="/data/agents/main/agent"
AUTH_FILE="$AUTH_DIR/auth-profiles.json"
mkdir -p "$AUTH_DIR"

node -e "\
  const fs = require('fs');\
  const profiles = {};\
  if (process.env.GEMINI_API_KEY) profiles['google:default'] = { type: 'api_key', provider: 'google', key: process.env.GEMINI_API_KEY };\
  if (process.env.ANTHROPIC_API_KEY) profiles['anthropic:default'] = { type: 'api_key', provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY };\
  if (process.env.OPENAI_API_KEY) profiles['openai:default'] = { type: 'api_key', provider: 'openai', key: process.env.OPENAI_API_KEY };\
  if (process.env.ROUTEWAY_API_KEY) {\
    profiles['openai:routeway'] = { type: 'api_key', provider: 'openai', key: process.env.ROUTEWAY_API_KEY, baseUrl: 'https://api.routeway.ai/v1' };\
  }\
  if (Object.keys(profiles).length > 0) {\
    fs.writeFileSync('$AUTH_FILE', JSON.stringify({ version: 1, profiles }, null, 2));\
    console.log('auth-profiles.json written with providers:', Object.keys(profiles).join(', '));\
  } else {\
    console.warn('WARNING: No API keys found in env vars — auth-profiles.json not written');\
  }\
"

# Mark first boot complete
touch /data/.initialized

exec "$@"
