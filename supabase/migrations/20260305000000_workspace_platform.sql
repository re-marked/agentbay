-- =============================================================================
-- Workspace Platform: Phase 1 — "Corporation of One"
-- =============================================================================
-- Creates the five primitives (Members, Channels, Messages, Tasks, Externals)
-- plus supporting join tables (channel_members, team_members).
-- Alters existing projects and teams tables with new columns.
-- Fully idempotent — safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function for updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_updated_at_column()
  IS 'Auto-set updated_at to now() on row update';

-- ---------------------------------------------------------------------------
-- 1. MEMBERS — Primitive 1: Unified identity for everyone in a project
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  instance_id uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  rank        text NOT NULL DEFAULT 'worker'
              CHECK (rank IN ('master', 'leader', 'worker', 'subagent')),
  ephemeral   boolean NOT NULL DEFAULT false,
  spawned_by  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'idle', 'offline', 'archived')),
  color       text,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.members IS 'Unified identity for users, agents, and externals within a project';
COMMENT ON COLUMN public.members.rank IS 'master | leader | worker | subagent — determines scope of authority';
COMMENT ON COLUMN public.members.ephemeral IS 'True for sub-agents spawned on demand';
COMMENT ON COLUMN public.members.spawned_by IS 'The member that created/hired this member';

CREATE UNIQUE INDEX IF NOT EXISTS members_project_instance_uniq
  ON public.members (project_id, instance_id)
  WHERE instance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS members_one_master_per_project
  ON public.members (project_id)
  WHERE rank = 'master' AND status != 'archived';

CREATE UNIQUE INDEX IF NOT EXISTS members_one_human_per_project
  ON public.members (project_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS members_project_id_idx ON public.members (project_id);
CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_instance_id_idx ON public.members (instance_id) WHERE instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_spawned_by_idx ON public.members (spawned_by) WHERE spawned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_status_idx ON public.members (project_id, status);

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='members' AND policyname='Users can manage members in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage members in their projects" ON public.members FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = members.project_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

DROP TRIGGER IF EXISTS members_updated_at ON public.members;
CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. ALTER projects — add master_member_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS master_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.master_member_id IS 'The Master agent member for this project';

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. ALTER teams — add leader, nesting, description, status, updated_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS leader_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.teams ADD CONSTRAINT teams_status_check CHECK (status IN ('active', 'paused', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.teams.leader_member_id IS 'Team Leader member';
COMMENT ON COLUMN public.teams.parent_id IS 'Parent team for nested team hierarchies';
COMMENT ON COLUMN public.teams.status IS 'active | paused | archived';

CREATE INDEX IF NOT EXISTS teams_parent_id_idx ON public.teams (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teams_leader_member_id_idx ON public.teams (leader_member_id) WHERE leader_member_id IS NOT NULL;

DROP TRIGGER IF EXISTS teams_updated_at ON public.teams;
CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. CHANNELS — Primitive 2: Communication spaces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'team'
              CHECK (kind IN ('team', 'direct', 'broadcast', 'system')),
  description text,
  pinned      boolean NOT NULL DEFAULT false,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.channels IS 'Communication spaces within a project — team channels, DMs, broadcasts';
COMMENT ON COLUMN public.channels.kind IS 'team = team channel, direct = DM, broadcast = project-wide, system = logs';

CREATE UNIQUE INDEX IF NOT EXISTS channels_one_per_team
  ON public.channels (team_id)
  WHERE kind = 'team' AND team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS channels_project_id_idx ON public.channels (project_id);
CREATE INDEX IF NOT EXISTS channels_team_id_idx ON public.channels (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS channels_kind_idx ON public.channels (project_id, kind);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='Users can manage channels in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage channels in their projects" ON public.channels FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = channels.project_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

DROP TRIGGER IF EXISTS channels_updated_at ON public.channels;
CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. CHANNEL_MEMBERS — Channel membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'participant'
              CHECK (role IN ('owner', 'participant', 'observer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  UNIQUE (channel_id, member_id)
);

COMMENT ON TABLE public.channel_members IS 'Which members belong to which channels';
COMMENT ON COLUMN public.channel_members.role IS 'owner = created the channel, participant = active, observer = read-only';

CREATE INDEX IF NOT EXISTS channel_members_channel_id_idx ON public.channel_members (channel_id);
CREATE INDEX IF NOT EXISTS channel_members_member_id_idx ON public.channel_members (member_id);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channel_members' AND policyname='Users can manage channel members in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage channel members in their projects" ON public.channel_members FOR ALL USING (EXISTS (SELECT 1 FROM public.channels JOIN public.projects ON projects.id = channels.project_id WHERE channels.id = channel_members.channel_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. CHANNEL_MESSAGES — Primitive 3: The universal event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id    uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  message_kind  text NOT NULL DEFAULT 'text'
                CHECK (message_kind IN ('text', 'tool_result', 'status', 'system', 'file')),
  mentions      uuid[] NOT NULL DEFAULT '{}',
  parent_id     uuid REFERENCES public.channel_messages(id) ON DELETE SET NULL,
  origin_id     uuid,
  depth         integer NOT NULL DEFAULT 0,
  metadata      jsonb NOT NULL DEFAULT '{}',
  edited_at     timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.channel_messages IS 'All messages in all channels — the universal event stream';
COMMENT ON COLUMN public.channel_messages.message_kind IS 'text | tool_result | status | system | file';
COMMENT ON COLUMN public.channel_messages.mentions IS 'Array of member IDs @mentioned in this message';
COMMENT ON COLUMN public.channel_messages.parent_id IS 'Thread parent — NULL for top-level messages';
COMMENT ON COLUMN public.channel_messages.origin_id IS 'Originating user message ID for routing depth tracking';
COMMENT ON COLUMN public.channel_messages.depth IS 'Routing hop count — max 5 to prevent infinite loops';

CREATE INDEX IF NOT EXISTS channel_messages_channel_created_idx
  ON public.channel_messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS channel_messages_parent_id_idx
  ON public.channel_messages (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS channel_messages_mentions_idx
  ON public.channel_messages USING GIN (mentions);
CREATE INDEX IF NOT EXISTS channel_messages_sender_id_idx
  ON public.channel_messages (sender_id);
CREATE INDEX IF NOT EXISTS channel_messages_not_deleted_idx
  ON public.channel_messages (channel_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channel_messages' AND policyname='Users can manage messages in their project channels') THEN
    EXECUTE 'CREATE POLICY "Users can manage messages in their project channels" ON public.channel_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.channels JOIN public.projects ON projects.id = channels.project_id WHERE channels.id = channel_messages.channel_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. TASKS — Primitive 4: Structured work orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  channel_id      uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'assigned', 'in_progress', 'blocked',
                                    'completed', 'failed', 'cancelled')),
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES public.members(id) ON DELETE SET NULL,
  parent_task_id  uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  due_at          timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  result          jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tasks IS 'Structured work orders with lifecycle, hierarchy, and deliverables';
COMMENT ON COLUMN public.tasks.status IS 'pending → assigned → in_progress → blocked/completed/failed/cancelled';
COMMENT ON COLUMN public.tasks.parent_task_id IS 'Parent task for sub-task hierarchies';
COMMENT ON COLUMN public.tasks.result IS 'JSONB outcome data: artifacts, summaries, links';

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_team_id_idx ON public.tasks (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_channel_id_idx ON public.tasks (channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON public.tasks (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON public.tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks (project_id, status);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks (project_id, priority) WHERE status NOT IN ('completed', 'failed', 'cancelled');

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tasks' AND policyname='Users can manage tasks in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage tasks in their projects" ON public.tasks FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tasks.project_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. TEAM_MEMBERS — Team membership with roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'worker'
              CHECK (role IN ('leader', 'worker')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id)
);

COMMENT ON TABLE public.team_members IS 'Which members belong to which teams, with role (leader or worker)';

CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_leader_per_team
  ON public.team_members (team_id) WHERE role = 'leader';

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON public.team_members (team_id);
CREATE INDEX IF NOT EXISTS team_members_member_id_idx ON public.team_members (member_id);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='Users can manage team members in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage team members in their projects" ON public.team_members FOR ALL USING (EXISTS (SELECT 1 FROM public.teams JOIN public.projects ON projects.id = teams.project_id WHERE teams.id = team_members.team_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. EXTERNALS — Primitive 5: External service bridges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.externals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  service         text NOT NULL
                  CHECK (service IN ('telegram', 'slack', 'discord', 'whatsapp', 'email', 'webhook')),
  external_id     text NOT NULL,
  external_name   text,
  config          jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'disconnected', 'error')),
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, service, external_id)
);

COMMENT ON TABLE public.externals IS 'Bridges to external services — each gets a member identity in the project';
COMMENT ON COLUMN public.externals.service IS 'telegram | slack | discord | whatsapp | email | webhook';
COMMENT ON COLUMN public.externals.external_id IS 'ID on the external platform (chat_id, channel_id, etc.)';

CREATE INDEX IF NOT EXISTS externals_project_id_idx ON public.externals (project_id);
CREATE INDEX IF NOT EXISTS externals_member_id_idx ON public.externals (member_id);
CREATE INDEX IF NOT EXISTS externals_service_idx ON public.externals (project_id, service);

ALTER TABLE public.externals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='externals' AND policyname='Users can manage externals in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage externals in their projects" ON public.externals FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = externals.project_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;

DROP TRIGGER IF EXISTS externals_updated_at ON public.externals;
CREATE TRIGGER externals_updated_at
  BEFORE UPDATE ON public.externals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 10. RLS for projects & teams (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Users can manage own projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id)';
  END IF;
END $$;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='Users can manage teams in their projects') THEN
    EXECUTE 'CREATE POLICY "Users can manage teams in their projects" ON public.teams FOR ALL USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = teams.project_id AND projects.user_id = auth.uid()))';
  END IF;
END $$;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
