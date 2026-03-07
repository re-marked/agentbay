import type {
  Member,
  MemberStatus,
  Channel,
  ChannelKind,
  Message,
  Task,
  TaskStatus,
  TaskPriority,
  Team,
  Project,
  AgentConfig,
  AgentProcess,
} from "./types.js";

// ── Surface 1: Storage ──────────────────────────────────────
//
// Local: SQLite via better-sqlite3
// Cloud: Supabase Postgres via @supabase/supabase-js

export interface Store {
  // Projects
  createProject(project: Omit<Project, "createdAt">): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  updateProject(
    id: string,
    updates: Partial<Pick<Project, "name" | "masterMemberId">>
  ): Promise<void>;

  // Members
  createMember(
    member: Omit<Member, "createdAt" | "status"> & { status?: MemberStatus }
  ): Promise<Member>;
  getMember(id: string): Promise<Member | null>;
  getMemberByName(
    projectId: string,
    displayName: string
  ): Promise<Member | null>;
  getProjectMembers(projectId: string): Promise<Member[]>;
  updateMemberStatus(id: string, status: MemberStatus): Promise<void>;

  // Channels
  createChannel(
    channel: Omit<Channel, "createdAt">
  ): Promise<Channel>;
  getChannel(id: string): Promise<Channel | null>;
  getProjectChannels(projectId: string): Promise<Channel[]>;
  getDirectChannel(
    projectId: string,
    memberA: string,
    memberB: string
  ): Promise<Channel | null>;
  addChannelMember(channelId: string, memberId: string): Promise<void>;
  getChannelMembers(channelId: string): Promise<Member[]>;

  // Messages
  createMessage(
    message: Omit<Message, "createdAt">
  ): Promise<Message>;
  getChannelMessages(
    channelId: string,
    opts?: { limit?: number; before?: string }
  ): Promise<Message[]>;

  // Tasks
  createTask(task: Omit<Task, "createdAt">): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  getTasks(query: {
    projectId: string;
    assignedTo?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
  }): Promise<Task[]>;
  updateTask(
    id: string,
    updates: Partial<
      Pick<
        Task,
        | "status"
        | "priority"
        | "assignedTo"
        | "title"
        | "description"
        | "startedAt"
        | "completedAt"
        | "result"
      >
    >
  ): Promise<Task>;

  // Teams
  createTeam(team: Omit<Team, "createdAt">): Promise<Team>;
  getTeam(id: string): Promise<Team | null>;
  getProjectTeams(projectId: string): Promise<Team[]>;
}

// ── Surface 2: Agent Manager ────────────────────────────────
//
// Local: child_process spawning OpenClaw instances
// Cloud: Fly.io Machines API (create, start, stop, destroy)

export interface AgentManager {
  /** Spawn a new agent process and return its handle */
  spawn(config: AgentConfig): Promise<AgentProcess>;

  /** Send a message to an agent and get the response */
  dispatch(
    agent: AgentProcess,
    message: Message,
    context: Message[]
  ): Promise<string>;

  /** Stop an agent process */
  stop(agent: AgentProcess): Promise<void>;

  /** Check if an agent is currently running */
  isRunning(agent: AgentProcess): boolean;

  /** List all running agent processes */
  listRunning(): AgentProcess[];

  /** Update the member ID mapping (called after DB member is created) */
  updateMemberId(oldId: string, newId: string): void;
}

// ── Surface 3: Events ───────────────────────────────────────
//
// Local: Node EventEmitter
// Cloud: Supabase Realtime (postgres_changes)

export interface Events {
  /** Broadcast an event to all subscribers of a channel */
  broadcast(channel: string, event: string, data: unknown): void;

  /** Subscribe to events on a channel */
  subscribe(
    channel: string,
    callback: (event: string, data: unknown) => void
  ): void;

  /** Unsubscribe from a channel */
  unsubscribe(channel: string): void;
}
