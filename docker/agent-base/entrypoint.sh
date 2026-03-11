#!/bin/sh
# AgentBay agent entrypoint
# First boot: full config setup (openclaw.json, providers, models, workspace, identity)
# Every boot: refresh auth-profiles (keys may rotate), clear stale sessions, validate

mkdir -p /data/workspace /data/memory /data/sessions

# ═══════════════════════════════════════════════════════════════════════
# FIRST BOOT ONLY — runs once on agent hire/creation, never again
# ═══════════════════════════════════════════════════════════════════════
if [ ! -f /data/.initialized ]; then
  echo "[entrypoint] First boot — full setup"

  # ── 1. Seed openclaw.json ─────────────────────────────────────────
  if [ ! -f /data/openclaw.json ]; then
    cp /opt/openclaw-defaults/openclaw.json /data/openclaw.json
    echo "[entrypoint] Seeded openclaw.json"
  fi

  # ── 2. Apply provisioner overrides (model, sandbox, etc.) ─────────
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

  # ── 3. Strip problematic config keys ──────────────────────────────
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
      console.log('[entrypoint] Fixed problematic config keys');\
    }\
  "

  # ── 4. Migrate deprecated model names ─────────────────────────────
  if grep -q '"gemini-2.0-flash"' /data/openclaw.json; then
    sed -i 's/gemini-2.0-flash/gemini-2.5-flash/g' /data/openclaw.json
    echo "[entrypoint] Migrated model gemini-2.0-flash → gemini-2.5-flash"
  fi

  # ── 5. Register Routeway provider + set default model ─────────────
  if [ -n "$ROUTEWAY_API_KEY" ]; then
    export ROUTEWAY_MODEL="${PLATFORM_ROUTEWAY_DEFAULT_MODEL:-routeway/claude-sonnet-4.6}"
    node -e "\
      const fs = require('fs');\
      const cfg = JSON.parse(fs.readFileSync('/data/openclaw.json', 'utf8'));\
      \
      cfg.models = cfg.models || {};\
      cfg.models.mode = 'merge';\
      cfg.models.providers = cfg.models.providers || {};\
      \
      /* Remove stale openai override if it points to Routeway (migration from earlier bug) */\
      if (cfg.models.providers.openai?.baseUrl?.includes('routeway')) {\
        delete cfg.models.providers.openai;\
        console.log('[entrypoint] Removed stale openai provider override');\
      }\
      \
      /* Register routeway custom provider with openai-completions API */\
      cfg.models.providers.routeway = {\
        baseUrl: 'https://api.routeway.ai/v1',\
        apiKey: '\${ROUTEWAY_API_KEY}',\
        api: 'openai-completions',\
        models: [\
          { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },\
          { id: 'gpt-5', name: 'GPT-5' },\
          { id: 'gpt-5-mini', name: 'GPT-5 Mini' },\
          { id: 'gpt-5.1', name: 'GPT-5.1' },\
          { id: 'minimax-m2.5', name: 'MiniMax M2.5' }\
        ]\
      };\
      \
      /* Migrate model refs from openai/ to routeway/ */\
      const primary = cfg.agents?.defaults?.model?.primary ?? '';\
      if (primary.startsWith('openai/') && !primary.includes('gpt-4')) {\
        cfg.agents.defaults.model.primary = primary.replace('openai/', 'routeway/');\
        console.log('[entrypoint] Migrated model prefix openai/ -> routeway/');\
      }\
      \
      /* If no BYOK keys, ensure model is set to Routeway */\
      const noByok = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY;\
      const current = cfg.agents?.defaults?.model?.primary ?? '';\
      if (noByok && current !== process.env.ROUTEWAY_MODEL) {\
        cfg.agents = cfg.agents || {};\
        cfg.agents.defaults = cfg.agents.defaults || {};\
        cfg.agents.defaults.model = cfg.agents.defaults.model || {};\
        cfg.agents.defaults.model.primary = process.env.ROUTEWAY_MODEL;\
        console.log('[entrypoint] Set model to', process.env.ROUTEWAY_MODEL);\
      }\
      \
      fs.writeFileSync('/data/openclaw.json', JSON.stringify(cfg, null, 2));\
    "
  fi

  # ── 6. Configure model fallbacks ──────────────────────────────────
  node <<'FALLBACK_EOF'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('/data/openclaw.json', 'utf8'));
const primary = cfg.agents?.defaults?.model?.primary ?? '';
const fallbacks = [];

if (process.env.ROUTEWAY_API_KEY) {
  if (primary !== 'routeway/gpt-5.1') fallbacks.push('routeway/gpt-5.1');
  if (primary !== 'routeway/gpt-5-mini') fallbacks.push('routeway/gpt-5-mini');
}
if (process.env.GEMINI_API_KEY) {
  if (primary !== 'google/gemini-2.5-flash') fallbacks.push('google/gemini-2.5-flash');
}
if (process.env.OPENAI_API_KEY) {
  if (primary !== 'openai/gpt-4.1-mini') fallbacks.push('openai/gpt-4.1-mini');
}
if (process.env.ANTHROPIC_API_KEY) {
  if (primary !== 'anthropic/claude-sonnet-4-5') fallbacks.push('anthropic/claude-sonnet-4-5');
}

if (fallbacks.length > 0) {
  cfg.agents = cfg.agents || {};
  cfg.agents.defaults = cfg.agents.defaults || {};
  cfg.agents.defaults.model = cfg.agents.defaults.model || {};
  cfg.agents.defaults.model.fallbacks = fallbacks;
  fs.writeFileSync('/data/openclaw.json', JSON.stringify(cfg, null, 2));
  console.log('[entrypoint] Model fallbacks:', fallbacks.join(', '));
}
FALLBACK_EOF

  # ── 7. Seed workspace files ───────────────────────────────────────
  if [ -z "$(ls -A /data/workspace 2>/dev/null)" ]; then
    cp -r /opt/openclaw-defaults/workspace/. /data/workspace/ 2>/dev/null || true
  fi

  # ── 8. Write agent identity (SOUL.md, WHOAMI.md, etc.) ────────────
  [ -n "$AGENT_SOUL_MD" ] && printf '%s' "$AGENT_SOUL_MD" > /data/workspace/SOUL.md
  [ -n "$AGENT_YAML" ] && printf '%s' "$AGENT_YAML" > /data/workspace/AGENT.yaml
  [ -n "$AGENT_WHOAMI_MD" ] && printf '%s' "$AGENT_WHOAMI_MD" > /data/workspace/WHOAMI.md
  [ -n "$AGENT_WHEREAMI_MD" ] && printf '%s' "$AGENT_WHEREAMI_MD" > /data/workspace/WHEREAMI.md

  # ── 9. Inject workspace tools reference into AGENTS.md ────────────
  if [ -n "$SUPABASE_URL" ]; then
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
- workspace-channel create "name" --kind team --members ID1,ID2 - create a channel
- workspace-channel archive CHANNEL_ID - archive a channel
- workspace-channel invite CHANNEL_ID MEMBER_ID - add someone to a channel
- workspace-channel kick CHANNEL_ID MEMBER_ID - remove someone
- workspace-channel members CHANNEL_ID - list channel members
- workspace-channel who - list all members in the project
TOOLS_EOF
      echo "[entrypoint] Injected workspace tools into AGENTS.md"
    fi
  fi

  # Mark first boot complete — everything above never runs again
  touch /data/.initialized
  echo "[entrypoint] First boot complete"

else
  echo "[entrypoint] Existing agent — preserving config and identity"
fi

# ═══════════════════════════════════════════════════════════════════════
# EVERY BOOT — only auth refresh, validation, and session cleanup
# ═══════════════════════════════════════════════════════════════════════

# ── A. Seed new workspace defaults that didn't exist before ─────────
# (e.g. new image adds WORKSPACE-TOOLS.md — copy it if agent doesn't have it)
if [ -d /opt/openclaw-defaults/workspace ]; then
  for src in /opt/openclaw-defaults/workspace/*; do
    fname="$(basename "$src")"
    dest="/data/workspace/$fname"
    if [ ! -e "$dest" ]; then
      cp -r "$src" "$dest" 2>/dev/null || true
      echo "[entrypoint] Added new workspace file: $fname"
    fi
  done
fi

# ── B. Normalize Google key name ────────────────────────────────────
if [ -n "$GOOGLE_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
  export GEMINI_API_KEY="$GOOGLE_API_KEY"
fi

# ── C. Write auth-profiles.json (always — keys may rotate) ─────────
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
    console.log('[entrypoint] auth-profiles.json:', Object.keys(profiles).join(', '));\
  } else {\
    console.warn('[WARN] No API keys — auth-profiles.json not written');\
  }\
"

# ── D. Validate configuration ──────────────────────────────────────
if [ ! -f "$AUTH_FILE" ]; then
  echo "[FATAL] auth-profiles.json not created — no API keys available"
  exit 1
fi

PROFILE_COUNT=$(node -e "const p=JSON.parse(require('fs').readFileSync('$AUTH_FILE')).profiles;console.log(Object.keys(p).length)")
if [ "$PROFILE_COUNT" = "0" ]; then
  echo "[FATAL] auth-profiles.json has zero profiles"
  exit 1
fi
echo "[entrypoint] Validated: $PROFILE_COUNT auth profile(s)"

# ── E. Clear stale sessions ────────────────────────────────────────
if [ -d /data/agents/main/sessions ]; then
  rm -f /data/agents/main/sessions/sessions.json 2>/dev/null
  echo "[entrypoint] Cleared stale sessions"
fi

exec "$@"
