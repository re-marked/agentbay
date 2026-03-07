import { spawn, type ChildProcess } from "node:child_process";
import type { AgentManager } from "../../core/interfaces.js";
import type { AgentConfig, AgentProcess, Message } from "../../core/types.js";

const BASE_PORT = 18789;
const STARTUP_TIMEOUT_MS = 90_000;
const DISPATCH_TIMEOUT_MS = 120_000;

/** Track all running agent processes for cleanup */
const processes = new Map<string, { child: ChildProcess; agent: AgentProcess }>();

/** Next available port — increments per spawn */
let nextPort = BASE_PORT;

/** Wait for OpenClaw gateway to start accepting connections */
async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/v1/models`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Agent on port ${port} failed to start within ${timeoutMs}ms`);
}

export function createLocalAgentManager(): AgentManager {
  return {
    async spawn(config: AgentConfig): Promise<AgentProcess> {
      const port = config.port || nextPort++;

      // openclaw gateway run --port <port> --bind lan --allow-unconfigured
      // Working directory = agent's workspace dir
      const child = spawn(
        "openclaw",
        [
          "gateway",
          "run",
          "--port",
          String(port),
          "--bind",
          "lan",
          "--allow-unconfigured",
        ],
        {
          cwd: config.workspaceDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            // Agent needs to know who it is and where to send messages
            AGENT_MEMBER_ID: config.name, // will be replaced with real ID by orchestrator
            AGENT_PORT: String(port),
          },
        }
      );

      const agent: AgentProcess = {
        memberId: config.name, // placeholder, orchestrator sets real ID
        pid: child.pid!,
        port,
        baseUrl: `http://localhost:${port}`,
      };

      // Log stdout/stderr for debugging
      child.stdout?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) console.log(`[${config.name}:${port}] ${line}`);
      });

      child.stderr?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) console.error(`[${config.name}:${port}] ${line}`);
      });

      child.on("exit", (code) => {
        console.log(`[${config.name}:${port}] exited with code ${code}`);
        processes.delete(agent.memberId);
      });

      processes.set(agent.memberId, { child, agent });

      // Wait for gateway to be ready
      console.log(
        `[${config.name}] spawning on port ${port}... (this takes ~60s)`
      );
      await waitForReady(port, STARTUP_TIMEOUT_MS);
      console.log(`[${config.name}] ready on port ${port}`);

      return agent;
    },

    async dispatch(
      agent: AgentProcess,
      message: Message,
      context: Message[]
    ): Promise<string> {
      // Build conversation history for OpenClaw's chat completions API
      const messages = [
        ...context.map((m) => ({
          role: m.senderId === agent.memberId ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
        {
          role: "user" as const,
          content: message.content,
        },
      ];

      const res = await fetch(`${agent.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "default",
          messages,
          stream: false,
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Agent dispatch failed (${res.status}): ${text}`
        );
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? "";
    },

    async stop(agent: AgentProcess): Promise<void> {
      const entry = processes.get(agent.memberId);
      if (!entry) return;

      entry.child.kill("SIGTERM");

      // Give it 5s to shut down gracefully, then force kill
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          entry.child.kill("SIGKILL");
          resolve();
        }, 5000);

        entry.child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      processes.delete(agent.memberId);
    },

    isRunning(agent: AgentProcess): boolean {
      const entry = processes.get(agent.memberId);
      if (!entry) return false;
      return !entry.child.killed && entry.child.exitCode === null;
    },

    listRunning(): AgentProcess[] {
      return Array.from(processes.values())
        .filter((e) => !e.child.killed && e.child.exitCode === null)
        .map((e) => e.agent);
    },
  };
}

/** Kill all running agents — call on process exit */
export function cleanupAllAgents(): void {
  for (const [id, entry] of processes) {
    console.log(`[cleanup] stopping ${id} (pid ${entry.agent.pid})`);
    entry.child.kill("SIGTERM");
  }
  processes.clear();
}
