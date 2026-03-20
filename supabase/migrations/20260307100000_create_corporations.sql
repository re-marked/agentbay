-- =============================================================================
-- Corporations — the top-level entity in the hierarchy
-- =============================================================================
-- Hierarchy: User (CEO) → Corporations → Projects → Teams → Agents
--
-- A corporation is permanent and not time-bound.
-- A project is time-bound (goals like "Final Exam", "Trip to Japan").
-- A team tackles a part of a project and holds agents.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CORPORATIONS table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corporations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  description             text,
  co_founder_instance_id  uuid REFERENCES public.agent_instances(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.corporations IS 'Top-level entity — the user''s personal corporation. Permanent, not time-bound.';
COMMENT ON COLUMN public.corporations.co_founder_instance_id IS 'The Personal AI agent instance that serves as co-founder across all projects';

-- One name per user (can''t have two corps called "Personal")
CREATE UNIQUE INDEX IF NOT EXISTS corporations_user_name_uniq
  ON public.corporations (user_id, name);

CREATE INDEX IF NOT EXISTS corporations_user_id_idx
  ON public.corporations (user_id);

ALTER TABLE public.corporations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='corporations' AND policyname='Users can manage own corporations') THEN
    EXECUTE 'CREATE POLICY "Users can manage own corporations" ON public.corporations FOR ALL USING (auth.uid() = user_id)';
  END IF;
END $$;

DROP TRIGGER IF EXISTS corporations_updated_at ON public.corporations;
CREATE TRIGGER corporations_updated_at
  BEFORE UPDATE ON public.corporations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Add corporation_id to projects
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS corporation_id uuid REFERENCES public.corporations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.projects.corporation_id IS 'The corporation this project belongs to';

CREATE INDEX IF NOT EXISTS projects_corporation_id_idx
  ON public.projects (corporation_id) WHERE corporation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Backfill: create a corporation for each existing user with projects
-- ---------------------------------------------------------------------------
-- For each user that has projects but no corporation, create one called
-- "My Corporation" and link their existing projects to it.
DO $$
DECLARE
  r RECORD;
  corp_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT p.user_id
    FROM public.projects p
    WHERE p.corporation_id IS NULL
      AND p.user_id IS NOT NULL
  LOOP
    -- Create a default corporation for this user
    INSERT INTO public.corporations (user_id, name, description)
    VALUES (r.user_id, 'My Corporation', 'Your personal corporation')
    ON CONFLICT (user_id, name) DO NOTHING
    RETURNING id INTO corp_id;

    -- If the insert was a no-op (already existed), find it
    IF corp_id IS NULL THEN
      SELECT id INTO corp_id
      FROM public.corporations
      WHERE user_id = r.user_id AND name = 'My Corporation';
    END IF;

    -- Link all this user's unlinked projects to the corporation
    UPDATE public.projects
    SET corporation_id = corp_id
    WHERE user_id = r.user_id AND corporation_id IS NULL;
  END LOOP;
END $$;
