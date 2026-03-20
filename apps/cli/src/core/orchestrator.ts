import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Store, AgentManager, Events, AgentProcess, Project, Member, Channel } from "@agentbay/core";

export interface Corporation {
  project: Project;
  owner: Member;
  cofounder: Member;
  cofounderProcess: AgentProcess;
  general: Channel;
  dmWithCofounder: Channel;
}

export interface OrchestratorDeps {
  store: Store;
  agents: AgentManager;
  events: Events;
}

/**
 * Initialize a new corporation.
 *
 * 1. Create the project
 * 2. Create the CEO (user as owner)
 * 3. Create #general broadcast channel
 * 4. Spawn co-founder from ~/.openclaw (the user's default OpenClaw config)
 * 5. Create co-founder member (rank=master)
 * 6. Create DM channel between CEO and co-founder
 * 7. Add both to #general
 */
export async function initCorporation(
  name: string,
  deps: OrchestratorDeps
): Promise<Corporation> {
  const { store, agents, events } = deps;

  // 1. Create project
  const project = await store.createProject({
    id: randomUUID(),
    name,
  });
  console.log(`Corporation "${name}" created.`);

  // 2. Create the CEO
  const owner = await store.createMember({
    id: randomUUID(),
    projectId: project.id,
    displayName: "You",
    rank: "owner",
    type: "user",
  });

  // 3. Create #general
  const general = await store.createChannel({
    id: randomUUID(),
    projectId: project.id,
    name: "general",
    kind: "broadcast",
    createdBy: owner.id,
  });
  await store.addChannelMember(general.id, owner.id);
  console.log(`#general created.`);

  // 4. Spawn co-founder from ~/.openclaw
  const openclawDir = join(homedir(), ".openclaw");
  console.log(`Spawning co-founder from ${openclawDir}...`);

  const cofounderProcess = await agents.spawn({
    workspaceDir: openclawDir,
    name: "Co-founder",
    port: 18789, // co-founder gets the default port
    rank: "master",
  });

  // 5. Create co-founder member
  const cofounder = await store.createMember({
    id: randomUUID(),
    projectId: project.id,
    displayName: "Co-founder",
    rank: "master",
    type: "agent",
    agentDir: openclawDir,
    processId: cofounderProcess.pid,
  });

  // Update process mapping with real member ID
  agents.updateMemberId(cofounderProcess.memberId, cofounder.id);
  cofounderProcess.memberId = cofounder.id;

  // Set as project master
  await store.updateProject(project.id, { masterMemberId: cofounder.id });

  // 6. Create DM channel
  const dmWithCofounder = await store.createChannel({
    id: randomUUID(),
    projectId: project.id,
    name: `dm-cofounder`,
    kind: "direct",
    createdBy: owner.id,
  });
  await store.addChannelMember(dmWithCofounder.id, owner.id);
  await store.addChannelMember(dmWithCofounder.id, cofounder.id);

  // 7. Add co-founder to #general
  await store.addChannelMember(general.id, cofounder.id);

  console.log(`Co-founder is alive. DM channel ready.`);

  // Broadcast init events
  events.broadcast(`project:${project.id}`, "init", { project, owner, cofounder });
  events.broadcast(`channel:${general.id}`, "message", {
    content: `Corporation "${name}" founded. Co-founder is online.`,
    kind: "system",
  });

  return { project, owner, cofounder, cofounderProcess, general, dmWithCofounder };
}

/**
 * Resume an existing corporation.
 * Loads state from DB, respawns the co-founder process.
 */
export async function resumeCorporation(
  projectId: string,
  deps: OrchestratorDeps
): Promise<Corporation> {
  const { store, agents } = deps;

  const project = await store.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const members = await store.getProjectMembers(project.id);
  const owner = members.find((m) => m.rank === "owner");
  const cofounder = members.find((m) => m.rank === "master");
  if (!owner) throw new Error("No owner found");
  if (!cofounder) throw new Error("No co-founder found");

  const channels = await store.getProjectChannels(project.id);
  const general = channels.find((c) => c.kind === "broadcast" && c.name === "general");
  if (!general) throw new Error("No #general channel found");

  const dmWithCofounder = await store.getDirectChannel(project.id, owner.id, cofounder.id);
  if (!dmWithCofounder) throw new Error("No DM channel with co-founder found");

  // Respawn co-founder
  const openclawDir = cofounder.agentDir || join(homedir(), ".openclaw");
  console.log(`Resuming co-founder from ${openclawDir}...`);

  const cofounderProcess = await agents.spawn({
    workspaceDir: openclawDir,
    name: "Co-founder",
    port: 18789,
    rank: "master",
  });
  agents.updateMemberId(cofounderProcess.memberId, cofounder.id);
  cofounderProcess.memberId = cofounder.id;

  // Update process ID in DB
  await store.updateMemberStatus(cofounder.id, "active");

  console.log(`Corporation "${project.name}" resumed. Co-founder is alive.`);

  return { project, owner, cofounder, cofounderProcess, general, dmWithCofounder };
}
