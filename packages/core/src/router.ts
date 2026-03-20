import { randomUUID } from "node:crypto";
import type { Store, AgentManager, Events } from "./interfaces.js";
import type { Message, Member } from "./types.js";

const MAX_DEPTH = 5;

export interface RouterDeps {
  store: Store;
  agents: AgentManager;
  events: Events;
}

/**
 * Extract @mentions from message content.
 * Matches @Name or @"Multi Word Name" patterns.
 */
export function extractMentions(content: string): string[] {
  const mentions: string[] = [];
  // @"Multi Word Name" or @SingleWord
  const regex = /@"([^"]+)"|@(\S+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1] || match[2]);
  }
  return mentions;
}

/**
 * Send a message and route it through the system.
 *
 * 1. Persist the message
 * 2. Broadcast via events
 * 3. If DM channel → auto-dispatch to the other member
 * 4. If @mentions → resolve and dispatch to each
 * 5. Agent response → persist → check for new mentions → recurse (up to MAX_DEPTH)
 */
export async function sendMessage(
  channelId: string,
  senderId: string,
  content: string,
  deps: RouterDeps,
  opts?: { depth?: number; originId?: string; parentId?: string }
): Promise<Message> {
  const { store, agents, events } = deps;
  const depth = opts?.depth ?? 0;

  // Extract mention names from content
  const mentionNames = extractMentions(content);

  // Resolve mention names to member IDs
  const channel = await store.getChannel(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  const channelMembers = await store.getChannelMembers(channelId);
  const mentionIds: string[] = [];
  for (const name of mentionNames) {
    const member = channelMembers.find(
      (m) => m.displayName.toLowerCase() === name.toLowerCase()
    );
    if (member) mentionIds.push(member.id);
  }

  // Persist
  const messageId = randomUUID();
  const originId = opts?.originId ?? messageId;
  const message = await store.createMessage({
    id: messageId,
    channelId,
    senderId,
    content,
    messageKind: "text",
    mentions: mentionIds,
    depth,
    originId,
    parentId: opts?.parentId,
  });

  // Broadcast
  events.broadcast(`channel:${channelId}`, "message", message);

  // Route
  if (depth >= MAX_DEPTH) return message;

  // Determine which agents to dispatch to
  let targetMembers: Member[] = [];

  if (channel.kind === "direct") {
    // DM auto-routing: dispatch to the other member
    const otherMember = channelMembers.find(
      (m) => m.id !== senderId && m.type === "agent"
    );
    if (otherMember) targetMembers = [otherMember];
  } else if (mentionIds.length > 0) {
    // @mention routing: dispatch to mentioned agents
    targetMembers = channelMembers.filter(
      (m) => mentionIds.includes(m.id) && m.type === "agent"
    );
  }

  // Dispatch to each target agent
  for (const target of targetMembers) {
    // Skip if already working (cooldown guard)
    if (target.status === "working") continue;

    // Get the agent's running process
    const runningAgents = agents.listRunning();
    const agentProcess = runningAgents.find(
      (a) => a.memberId === target.id
    );
    if (!agentProcess) continue;

    // Mark as working
    await store.updateMemberStatus(target.id, "working");

    try {
      // Get context (recent messages in channel)
      const context = await store.getChannelMessages(channelId, { limit: 20 });

      // Dispatch
      const responseText = await agents.dispatch(agentProcess, message, context);

      if (responseText) {
        // Persist agent response (recursive — may trigger more routing)
        await sendMessage(channelId, target.id, responseText, deps, {
          depth: depth + 1,
          originId,
          parentId: messageId,
        });
      }
    } catch (err) {
      console.error(
        `[router] dispatch to ${target.displayName} failed:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      await store.updateMemberStatus(target.id, "idle");
    }
  }

  return message;
}
