import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Store } from "../../core/interfaces.js";
import type {
  Project,
  Member,
  MemberStatus,
  Channel,
  Message,
  Task,
  TaskStatus,
  TaskPriority,
  Team,
} from "../../core/types.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    master_member_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    display_name TEXT NOT NULL,
    rank TEXT NOT NULL CHECK (rank IN ('owner', 'master', 'leader', 'worker', 'subagent')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'working', 'suspended', 'archived')),
    type TEXT NOT NULL CHECK (type IN ('user', 'agent')),
    agent_dir TEXT,
    process_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owner_per_project
    ON members(project_id) WHERE rank = 'owner' AND status != 'archived';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_master_per_project
    ON members(project_id) WHERE rank = 'master' AND status != 'archived';

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('broadcast', 'team', 'direct', 'system')),
    team_id TEXT REFERENCES teams(id),
    created_by TEXT NOT NULL REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL REFERENCES channels(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    last_read_at TEXT,
    PRIMARY KEY (channel_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS channel_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id),
    sender_id TEXT NOT NULL REFERENCES members(id),
    content TEXT NOT NULL,
    message_kind TEXT NOT NULL DEFAULT 'text' CHECK (message_kind IN ('text', 'system', 'task_event')),
    thread_id TEXT REFERENCES channel_messages(id),
    mentions TEXT NOT NULL DEFAULT '[]',
    depth INTEGER NOT NULL DEFAULT 0,
    origin_id TEXT,
    parent_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    team_id TEXT REFERENCES teams(id),
    channel_id TEXT REFERENCES channels(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_to TEXT REFERENCES members(id),
    created_by TEXT NOT NULL REFERENCES members(id),
    parent_task_id TEXT REFERENCES tasks(id),
    due_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    leader_member_id TEXT REFERENCES members(id),
    parent_id TEXT REFERENCES teams(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// ── Row ↔ Type mappers ──────────────────────────────────────

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    masterMemberId: row.master_member_id ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToMember(row: any): Member {
  return {
    id: row.id,
    projectId: row.project_id,
    displayName: row.display_name,
    rank: row.rank,
    status: row.status,
    type: row.type,
    agentDir: row.agent_dir ?? undefined,
    processId: row.process_id ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToChannel(row: any): Channel {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind,
    teamId: row.team_id ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    content: row.content,
    messageKind: row.message_kind,
    threadId: row.thread_id ?? undefined,
    mentions: JSON.parse(row.mentions),
    depth: row.depth,
    originId: row.origin_id ?? undefined,
    parentId: row.parent_id ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id ?? undefined,
    channelId: row.channel_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to ?? undefined,
    createdBy: row.created_by,
    parentTaskId: row.parent_task_id ?? undefined,
    dueAt: row.due_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    createdAt: row.created_at,
  };
}

function rowToTeam(row: any): Team {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    leaderMemberId: row.leader_member_id ?? undefined,
    parentId: row.parent_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── SQLite Store ─────────────────────────────────────────────

export function createSqliteStore(dbPath: string): Store {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  return {
    // ── Projects ──────────────────────────────────────────

    async createProject(project) {
      const id = project.id || randomUUID();
      db.prepare(
        `INSERT INTO projects (id, name, master_member_id) VALUES (?, ?, ?)`
      ).run(id, project.name, project.masterMemberId ?? null);
      return rowToProject(db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id));
    },

    async getProject(id) {
      const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
      return row ? rowToProject(row) : null;
    },

    async updateProject(id, updates) {
      const sets: string[] = [];
      const vals: any[] = [];
      if (updates.name !== undefined) { sets.push("name = ?"); vals.push(updates.name); }
      if (updates.masterMemberId !== undefined) { sets.push("master_member_id = ?"); vals.push(updates.masterMemberId); }
      if (sets.length > 0) {
        vals.push(id);
        db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      }
    },

    // ── Members ───────────────────────────────────────────

    async createMember(member) {
      const id = member.id || randomUUID();
      db.prepare(
        `INSERT INTO members (id, project_id, display_name, rank, status, type, agent_dir, process_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        member.projectId,
        member.displayName,
        member.rank,
        member.status ?? "active",
        member.type,
        member.agentDir ?? null,
        member.processId ?? null
      );
      return rowToMember(db.prepare(`SELECT * FROM members WHERE id = ?`).get(id));
    },

    async getMember(id) {
      const row = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id);
      return row ? rowToMember(row) : null;
    },

    async getMemberByName(projectId, displayName) {
      const row = db
        .prepare(`SELECT * FROM members WHERE project_id = ? AND display_name = ? AND status != 'archived'`)
        .get(projectId, displayName);
      return row ? rowToMember(row) : null;
    },

    async getProjectMembers(projectId) {
      return db
        .prepare(`SELECT * FROM members WHERE project_id = ? AND status != 'archived' ORDER BY created_at`)
        .all(projectId)
        .map(rowToMember);
    },

    async updateMemberStatus(id, status) {
      db.prepare(`UPDATE members SET status = ? WHERE id = ?`).run(status, id);
    },

    // ── Channels ──────────────────────────────────────────

    async createChannel(channel) {
      const id = channel.id || randomUUID();
      db.prepare(
        `INSERT INTO channels (id, project_id, name, kind, team_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, channel.projectId, channel.name, channel.kind, channel.teamId ?? null, channel.createdBy);
      return rowToChannel(db.prepare(`SELECT * FROM channels WHERE id = ?`).get(id));
    },

    async getChannel(id) {
      const row = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(id);
      return row ? rowToChannel(row) : null;
    },

    async getProjectChannels(projectId) {
      return db
        .prepare(`SELECT * FROM channels WHERE project_id = ? ORDER BY created_at`)
        .all(projectId)
        .map(rowToChannel);
    },

    async getDirectChannel(projectId, memberA, memberB) {
      const row = db
        .prepare(
          `SELECT c.* FROM channels c
           JOIN channel_members cm1 ON c.id = cm1.channel_id AND cm1.member_id = ?
           JOIN channel_members cm2 ON c.id = cm2.channel_id AND cm2.member_id = ?
           WHERE c.project_id = ? AND c.kind = 'direct'
           LIMIT 1`
        )
        .get(memberA, memberB, projectId);
      return row ? rowToChannel(row) : null;
    },

    async addChannelMember(channelId, memberId) {
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (channel_id, member_id) VALUES (?, ?)`
      ).run(channelId, memberId);
    },

    async getChannelMembers(channelId) {
      return db
        .prepare(
          `SELECT m.* FROM members m
           JOIN channel_members cm ON m.id = cm.member_id
           WHERE cm.channel_id = ?
           ORDER BY m.created_at`
        )
        .all(channelId)
        .map(rowToMember);
    },

    // ── Messages ──────────────────────────────────────────

    async createMessage(message) {
      const id = message.id || randomUUID();
      db.prepare(
        `INSERT INTO channel_messages (id, channel_id, sender_id, content, message_kind, thread_id, mentions, depth, origin_id, parent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        message.channelId,
        message.senderId,
        message.content,
        message.messageKind,
        message.threadId ?? null,
        JSON.stringify(message.mentions),
        message.depth,
        message.originId ?? null,
        message.parentId ?? null
      );
      return rowToMessage(db.prepare(`SELECT * FROM channel_messages WHERE id = ?`).get(id));
    },

    async getChannelMessages(channelId, opts) {
      const limit = opts?.limit ?? 50;
      if (opts?.before) {
        return db
          .prepare(
            `SELECT * FROM channel_messages
             WHERE channel_id = ? AND created_at < ?
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(channelId, opts.before, limit)
          .reverse()
          .map(rowToMessage);
      }
      return db
        .prepare(
          `SELECT * FROM channel_messages
           WHERE channel_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(channelId, limit)
        .reverse()
        .map(rowToMessage);
    },

    // ── Tasks ─────────────────────────────────────────────

    async createTask(task) {
      const id = task.id || randomUUID();
      const status = task.assignedTo && task.status === "pending" ? "assigned" : task.status;
      db.prepare(
        `INSERT INTO tasks (id, project_id, team_id, channel_id, title, description, status, priority, assigned_to, created_by, parent_task_id, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        task.projectId,
        task.teamId ?? null,
        task.channelId ?? null,
        task.title,
        task.description ?? null,
        status,
        task.priority,
        task.assignedTo ?? null,
        task.createdBy,
        task.parentTaskId ?? null,
        task.dueAt ?? null
      );
      return rowToTask(db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id));
    },

    async getTask(id) {
      const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
      return row ? rowToTask(row) : null;
    },

    async getTasks(query) {
      let sql = `SELECT * FROM tasks WHERE project_id = ?`;
      const params: any[] = [query.projectId];

      if (query.assignedTo) { sql += ` AND assigned_to = ?`; params.push(query.assignedTo); }
      if (query.status) { sql += ` AND status = ?`; params.push(query.status); }
      if (query.priority) { sql += ` AND priority = ?`; params.push(query.priority); }

      sql += ` ORDER BY created_at DESC`;
      return db.prepare(sql).all(...params).map(rowToTask);
    },

    async updateTask(id, updates) {
      const sets: string[] = [];
      const vals: any[] = [];

      if (updates.status !== undefined) {
        sets.push("status = ?"); vals.push(updates.status);
        if (updates.status === "in_progress" && !updates.startedAt) {
          sets.push("started_at = datetime('now')");
        }
        if (["completed", "failed", "cancelled"].includes(updates.status) && !updates.completedAt) {
          sets.push("completed_at = datetime('now')");
        }
      }
      if (updates.priority !== undefined) { sets.push("priority = ?"); vals.push(updates.priority); }
      if (updates.assignedTo !== undefined) { sets.push("assigned_to = ?"); vals.push(updates.assignedTo); }
      if (updates.title !== undefined) { sets.push("title = ?"); vals.push(updates.title); }
      if (updates.description !== undefined) { sets.push("description = ?"); vals.push(updates.description); }
      if (updates.startedAt !== undefined) { sets.push("started_at = ?"); vals.push(updates.startedAt); }
      if (updates.completedAt !== undefined) { sets.push("completed_at = ?"); vals.push(updates.completedAt); }
      if (updates.result !== undefined) { sets.push("result = ?"); vals.push(JSON.stringify(updates.result)); }

      if (sets.length > 0) {
        vals.push(id);
        db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      }
      return rowToTask(db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id));
    },

    // ── Teams ─────────────────────────────────────────────

    async createTeam(team) {
      const id = team.id || randomUUID();
      db.prepare(
        `INSERT INTO teams (id, project_id, name, description, leader_member_id, parent_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, team.projectId, team.name, team.description ?? null, team.leaderMemberId ?? null, team.parentId ?? null, team.status);
      return rowToTeam(db.prepare(`SELECT * FROM teams WHERE id = ?`).get(id));
    },

    async getTeam(id) {
      const row = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(id);
      return row ? rowToTeam(row) : null;
    },

    async getProjectTeams(projectId) {
      return db
        .prepare(`SELECT * FROM teams WHERE project_id = ? AND status = 'active' ORDER BY created_at`)
        .all(projectId)
        .map(rowToTeam);
    },
  };
}
