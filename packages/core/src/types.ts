// ── Primitives ──────────────────────────────────────────────

export type MemberRank = "owner" | "master" | "leader" | "worker" | "subagent";
export type MemberStatus =
  | "active"
  | "idle"
  | "working"
  | "suspended"
  | "archived";

export interface Member {
  id: string;
  projectId: string;
  displayName: string;
  rank: MemberRank;
  status: MemberStatus;
  type: "user" | "agent";
  agentDir?: string; // local: path to agent workspace
  processId?: number; // local: OS pid of OpenClaw process
  createdAt: string;
}

export type ChannelKind = "broadcast" | "team" | "direct" | "system";

export interface Channel {
  id: string;
  projectId: string;
  name: string;
  kind: ChannelKind;
  teamId?: string;
  createdBy: string; // member ID
  createdAt: string;
}

export interface ChannelMember {
  channelId: string;
  memberId: string;
  lastReadAt?: string;
}

export type MessageKind = "text" | "system" | "task_event";

export interface Message {
  id: string;
  channelId: string;
  senderId: string; // member ID
  content: string;
  messageKind: MessageKind;
  threadId?: string; // parent message ID for threads
  mentions: string[]; // member IDs
  depth: number;
  originId?: string; // root message that started this chain
  parentId?: string; // immediate parent (for routing chains)
  createdAt: string;
}

export type TaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  projectId: string;
  teamId?: string;
  channelId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string; // member ID
  createdBy: string; // member ID
  parentTaskId?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  createdAt: string;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  leaderMemberId?: string;
  parentId?: string;
  status: "active" | "archived";
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  masterMemberId?: string;
  createdAt: string;
}

// ── Agent config ────────────────────────────────────────────

export interface AgentConfig {
  /** Directory containing SOUL.md, ENVIRONMENT.md, etc. */
  workspaceDir: string;
  /** Display name for the agent */
  name: string;
  /** Port to run OpenClaw gateway on */
  port: number;
  /** Rank when hired */
  rank: MemberRank;
}

export interface AgentProcess {
  memberId: string;
  pid: number;
  port: number;
  baseUrl: string;
}
