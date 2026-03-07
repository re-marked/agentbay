#!/usr/bin/env node

import { Command } from "commander";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { createSqliteStore } from "./adapters/local/store.js";
import {
  createLocalAgentManager,
  cleanupAllAgents,
} from "./adapters/local/agents.js";
import { createLocalEvents } from "./adapters/local/events.js";
import { initCorporation, resumeCorporation } from "./core/orchestrator.js";
import { sendMessage } from "./core/router.js";

const AGENTBAY_HOME = join(homedir(), ".agentbay");
const DB_PATH = join(AGENTBAY_HOME, "agentbay.db");

function ensureHome(): void {
  if (!existsSync(AGENTBAY_HOME)) {
    mkdirSync(AGENTBAY_HOME, { recursive: true });
  }
}

// ── Shared deps ─────────────────────────────────────────────

function createDeps() {
  ensureHome();
  const store = createSqliteStore(DB_PATH);
  const agents = createLocalAgentManager();
  const events = createLocalEvents();
  return { store, agents, events };
}

// ── Cleanup on exit ─────────────────────────────────────────

function setupCleanup(): void {
  const cleanup = () => {
    cleanupAllAgents();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// ── Chat loop ───────────────────────────────────────────────

async function chatLoop(
  channelId: string,
  senderId: string,
  deps: ReturnType<typeof createDeps>
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\nType a message. Press Ctrl+C to exit.\n');

  const prompt = () => {
    rl.question("you > ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      try {
        process.stdout.write("\nco-founder > ");
        await sendMessage(channelId, senderId, trimmed, deps);
        process.stdout.write("\n\n");
      } catch (err) {
        console.error(
          "\nerror:",
          err instanceof Error ? err.message : err
        );
      }

      prompt();
    });
  };

  prompt();
}

// ── CLI ─────────────────────────────────────────────────────

const program = new Command();

program
  .name("agentbay")
  .description("Your personal corporation, locally.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a new corporation")
  .argument("<name>", "Corporation name")
  .action(async (name: string) => {
    setupCleanup();
    const deps = createDeps();

    try {
      const corp = await initCorporation(name, deps);
      console.log(`\nCorporation "${name}" is live.`);
      console.log(`Project ID: ${corp.project.id}`);
      console.log(`\nStarting chat with your co-founder...\n`);

      await chatLoop(corp.dmWithCofounder.id, corp.owner.id, deps);
    } catch (err) {
      console.error(
        "Failed to initialize:",
        err instanceof Error ? err.message : err
      );
      cleanupAllAgents();
      process.exit(1);
    }
  });

program
  .command("chat")
  .description("Resume chatting with your co-founder")
  .argument("[project-id]", "Project ID (uses latest if omitted)")
  .action(async (projectId?: string) => {
    setupCleanup();
    const deps = createDeps();

    try {
      // If no project ID, find the most recent one
      if (!projectId) {
        // SQLite store doesn't have a listProjects method yet,
        // so we read directly for now
        const Database = (await import("better-sqlite3")).default;
        const db = new Database(DB_PATH, { readonly: true });
        const row = db
          .prepare(
            "SELECT id FROM projects ORDER BY created_at DESC LIMIT 1"
          )
          .get() as { id: string } | undefined;
        db.close();

        if (!row) {
          console.error('No corporations found. Run "agentbay init" first.');
          process.exit(1);
        }
        projectId = row.id;
      }

      const corp = await resumeCorporation(projectId, deps);
      console.log(`\nResumed "${corp.project.name}". Chat with your co-founder:\n`);

      await chatLoop(corp.dmWithCofounder.id, corp.owner.id, deps);
    } catch (err) {
      console.error(
        "Failed to resume:",
        err instanceof Error ? err.message : err
      );
      cleanupAllAgents();
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show corporation status")
  .action(async () => {
    const deps = createDeps();

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(DB_PATH, { readonly: true });
    const projects = db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as Array<{ id: string; name: string; created_at: string }>;
    db.close();

    if (projects.length === 0) {
      console.log('No corporations. Run "agentbay init <name>" to create one.');
      return;
    }

    for (const p of projects) {
      const members = await deps.store.getProjectMembers(p.id);
      const channels = await deps.store.getProjectChannels(p.id);
      const tasks = await deps.store.getTasks({ projectId: p.id });

      console.log(`\n${p.name} (${p.id})`);
      console.log(`  Created: ${p.created_at}`);
      console.log(`  Members: ${members.length}`);
      for (const m of members) {
        console.log(`    ${m.rank === "owner" ? "CEO" : m.rank}: ${m.displayName} (${m.status})`);
      }
      console.log(`  Channels: ${channels.length}`);
      for (const c of channels) {
        console.log(`    #${c.name} (${c.kind})`);
      }
      if (tasks.length > 0) {
        console.log(`  Tasks: ${tasks.length}`);
        for (const t of tasks) {
          console.log(`    [${t.status}] ${t.title}`);
        }
      }
    }
  });

program.parse();
