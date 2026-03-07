import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { AgentManager } from "../../core/interfaces.js";
import type { AgentConfig, AgentProcess, Message } from "../../core/types.js";

const OPENCLAW_HOME = join(homedir(), ".openclaw");
const STARTUP_TIMEOUT_MS = 120_000; // OpenClaw gateway can take 50-60s
const HEALTH_INTERVAL_MS = 2_000;
const DISPATCH_TIMEOUT_MS = 120_000;
const KILL_GRACE_MS = 5_000;

/** Track all running agent processes for cleanup */
const processes = new Map<
  string,
  { child: ChildProcess | null; agent: AgentProcess; history: Array<{ role: string; content: string }> }
>();

/** Next available port — increments per spawn */
let nextPort = 18789;

/** Cached gateway auth token (read from ~/.openclaw/openclaw.json) */
let gatewayAuthToken: string | null = null;

// ── Gateway auth ────────────────────────────────────────────

/**
 * Read the gateway auth token from ~/.openclaw/openclaw.json.
 * Returns null if no token is configured.
 */
function getGatewayAuthToken(): string | null {
  if (gatewayAuthToken !== null) return gatewayAuthToken;

  try {
    const raw = readFileSync(join(OPENCLAW_HOME, "openclaw.json"), "utf-8");
    const config = JSON.parse(raw);
    gatewayAuthToken = config?.gateway?.auth?.token ?? null;
  } catch {
    gatewayAuthToken = null;
  }
  return gatewayAuthToken;
}

/**
 * Build headers for gateway requests — includes auth token if available.
 */
function gatewayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getGatewayAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── Auth provisioning ───────────────────────────────────────

/**
 * Find the user's global OpenClaw auth-profiles.json.
 * Looks in ~/.openclaw/agents/main/agent/ first, then any other agent dir.
 */
function findGlobalAuthProfiles(): string | null {
  const mainAuth = join(
    OPENCLAW_HOME,
    "agents",
    "main",
    "agent",
    "auth-profiles.json"
  );
  if (existsSync(mainAuth)) return mainAuth;

  const agentsDir = join(OPENCLAW_HOME, "agents");
  if (!existsSync(agentsDir)) return null;

  try {
    for (const entry of readdirSync(agentsDir)) {
      const candidate = join(agentsDir, entry, "agent", "auth-profiles.json");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* ok */
  }
  return null;
}

/**
 * Copy global auth-profiles.json into workspace so the gateway can find credentials.
 * OpenClaw looks at: {stateDir}/agents/{agentId}/agent/auth-profiles.json
 */
function provisionAuth(workspacePath: string): void {
  const globalAuth = findGlobalAuthProfiles();
  if (!globalAuth) {
    console.warn(
      `[auth] No auth-profiles.json found in ${OPENCLAW_HOME}. Agent may not be able to call LLMs.`
    );
    return;
  }

  // Read openclaw.json to find agent IDs
  let agentIds = ["main"];
  try {
    const raw = readFileSync(join(workspacePath, "openclaw.json"), "utf-8");
    const config = JSON.parse(raw);
    const list = config?.agents?.list;
    if (Array.isArray(list)) {
      agentIds = list.map((a: { id?: string }) => a.id ?? "main");
    }
  } catch {
    /* use default */
  }

  for (const agentId of agentIds) {
    const targetDir = join(workspacePath, "agents", agentId, "agent");
    const targetPath = join(targetDir, "auth-profiles.json");
    if (existsSync(targetPath)) continue;

    try {
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(globalAuth, targetPath);
    } catch {
      /* best effort */
    }
  }
}

// ── Port check ───────────────────────────────────────────────

/**
 * Check if an OpenClaw gateway on this port accepts our auth.
 * 401/403 = alive but wrong credentials. Anything else = usable.
 */
async function isGatewayUsable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify({
        model: "default",
        messages: [{ role: "user", content: "ping" }],
        stream: false,
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    // 401/403 means auth rejected — we can't use this gateway
    if (res.status === 401 || res.status === 403) return false;
    // Anything else (200, 400, 404, etc.) means auth passed
    return true;
  } catch {
    return false;
  }
}

// ── Health check ────────────────────────────────────────────

/**
 * Wait for OpenClaw gateway to be ready by sending a real chat completions request.
 */
async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
        method: "POST",
        headers: gatewayHeaders(),
        body: JSON.stringify({
          model: "default",
          messages: [{ role: "user", content: "ping" }],
          stream: false,
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  throw new Error(
    `Agent on port ${port} failed to start within ${timeoutMs / 1000}s`
  );
}

// ── Agent Manager ───────────────────────────────────────────

export function createLocalAgentManager(): AgentManager {
  return {
    async spawn(config: AgentConfig): Promise<AgentProcess> {
      const port = config.port || nextPort++;
      const absPath = resolve(config.workspaceDir);

      // Provision auth credentials from ~/.openclaw
      provisionAuth(absPath);

      // Check if we can reuse an existing gateway on this port
      if (await isGatewayUsable(port)) {
        console.log(
          `[${config.name}] found existing gateway on port ${port}, attaching`
        );

        const agent: AgentProcess = {
          memberId: config.name,
          pid: 0,
          port,
          baseUrl: `http://localhost:${port}`,
        };

        processes.set(agent.memberId, { child: null, agent, history: [] });
        return agent;
      }

      // No usable gateway — spawn a new one
      const cmd = `npx openclaw gateway run --bind lan --port ${port} --allow-unconfigured --force`;

      const child = spawn(cmd, {
        cwd: absPath,
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: absPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      const agent: AgentProcess = {
        memberId: config.name,
        pid: child.pid!,
        port,
        baseUrl: `http://localhost:${port}`,
      };

      // Collect stderr for error reporting
      let stderrBuf = "";
      let childExited = false;
      child.stderr?.on("data", (data: Buffer) => {
        stderrBuf += data.toString();
      });

      child.on("exit", (code) => {
        childExited = true;
        processes.delete(agent.memberId);
        if (code !== 0 && code !== null) {
          console.error(`[${config.name}] exited with code ${code}`);
          const lines = stderrBuf.trim().split("\n").slice(-5);
          for (const line of lines) {
            console.error(`  ${line}`);
          }
        }
      });

      processes.set(agent.memberId, { child, agent, history: [] });

      console.log(
        `[${config.name}] spawning on port ${port}... (this takes ~60s)`
      );

      // Wait for ready, but abort if the child dies
      const start = Date.now();
      while (Date.now() - start < STARTUP_TIMEOUT_MS) {
        if (childExited) {
          throw new Error(
            `[${config.name}] process exited before becoming ready. ` +
            `Is another gateway already running? Try: openclaw gateway stop`
          );
        }
        try {
          const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
            method: "POST",
            headers: gatewayHeaders(),
            body: JSON.stringify({
              model: "default",
              messages: [{ role: "user", content: "ping" }],
              stream: false,
              max_tokens: 1,
            }),
            signal: AbortSignal.timeout(5_000),
          });
          if (res.ok || res.status < 500) break;
        } catch {
          // not ready yet
        }
        await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
      }

      if (childExited) {
        throw new Error(
          `[${config.name}] process exited before becoming ready. ` +
          `Is another gateway already running? Try: openclaw gateway stop`
        );
      }

      console.log(`[${config.name}] ready on port ${port}`);

      return agent;
    },

    async dispatch(
      agent: AgentProcess,
      message: Message,
      context: Message[]
    ): Promise<string> {
      const entry = processes.get(agent.memberId);
      if (!entry) throw new Error(`Agent ${agent.memberId} not found`);

      // Add the new message to history
      entry.history.push({ role: "user", content: message.content });

      // Stream the response for real-time output
      const res = await fetch(`${agent.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: gatewayHeaders(),
        body: JSON.stringify({
          model: "default",
          messages: entry.history,
          stream: true,
          user: `agentbay-${agent.memberId}`,
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Agent dispatch failed (${res.status}): ${text}`);
      }

      // Parse SSE stream
      let fullText = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              process.stdout.write(delta);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      // Save assistant response to history
      if (fullText) {
        entry.history.push({ role: "assistant", content: fullText });
      }

      return fullText || "";
    },

    async stop(agent: AgentProcess): Promise<void> {
      const entry = processes.get(agent.memberId);
      if (!entry) return;

      // Don't kill attached (external) gateways
      if (!entry.child) {
        processes.delete(agent.memberId);
        return;
      }

      entry.child.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            entry.child!.kill("SIGKILL");
          } catch {
            /* already dead */
          }
          resolve();
        }, KILL_GRACE_MS);

        entry.child!.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      processes.delete(agent.memberId);
    },

    isRunning(agent: AgentProcess): boolean {
      const entry = processes.get(agent.memberId);
      if (!entry) return false;
      if (!entry.child) return true;
      return !entry.child.killed && entry.child.exitCode === null;
    },

    listRunning(): AgentProcess[] {
      return Array.from(processes.values())
        .filter((e) => !e.child || (!e.child.killed && e.child.exitCode === null))
        .map((e) => e.agent);
    },

    updateMemberId(oldId: string, newId: string): void {
      const entry = processes.get(oldId);
      if (!entry) return;
      processes.delete(oldId);
      entry.agent.memberId = newId;
      processes.set(newId, entry);
    },
  };
}

/** Kill all running agents — call on process exit */
export function cleanupAllAgents(): void {
  for (const [id, entry] of processes) {
    if (!entry.child) continue;
    try {
      entry.child.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
  processes.clear();
}
