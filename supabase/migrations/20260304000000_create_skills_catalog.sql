-- Skills catalog: public browsable registry of installable skills
CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  emoji text,
  category text NOT NULL DEFAULT 'general',
  skill_content text NOT NULL,
  source text NOT NULL DEFAULT 'community',
  requires jsonb DEFAULT '{}'::jsonb,
  version text NOT NULL DEFAULT '1.0.0',
  author text,
  homepage text,
  total_installs integer NOT NULL DEFAULT 0,
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Join table: which skills are installed on which agent instances
CREATE TABLE IF NOT EXISTS instance_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, skill_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_instance_skills_instance ON instance_skills(instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_skills_skill ON instance_skills(skill_id);

-- RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_skills ENABLE ROW LEVEL SECURITY;

-- Anyone can read published skills
CREATE POLICY "Public read published skills"
  ON skills FOR SELECT
  USING (status = 'published');

-- Service role can do anything (for seeding / admin)
CREATE POLICY "Service role full access on skills"
  ON skills FOR ALL
  USING (true)
  WITH CHECK (true);

-- Users can read their own instance_skills (via agent_instances ownership)
CREATE POLICY "Users read own instance_skills"
  ON instance_skills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agent_instances
      WHERE agent_instances.id = instance_skills.instance_id
        AND agent_instances.user_id = auth.uid()
    )
  );

-- Users can insert instance_skills for their own instances
CREATE POLICY "Users insert own instance_skills"
  ON instance_skills FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_instances
      WHERE agent_instances.id = instance_skills.instance_id
        AND agent_instances.user_id = auth.uid()
    )
  );

-- Users can delete their own instance_skills
CREATE POLICY "Users delete own instance_skills"
  ON instance_skills FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM agent_instances
      WHERE agent_instances.id = instance_skills.instance_id
        AND agent_instances.user_id = auth.uid()
    )
  );

-- Service role full access on instance_skills
CREATE POLICY "Service role full access on instance_skills"
  ON instance_skills FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-increment total_installs on insert
CREATE OR REPLACE FUNCTION increment_skill_installs()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills SET total_installs = total_installs + 1 WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_instance_skill_insert
  AFTER INSERT ON instance_skills
  FOR EACH ROW
  EXECUTE FUNCTION increment_skill_installs();

-- Auto-decrement on delete
CREATE OR REPLACE FUNCTION decrement_skill_installs()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skills SET total_installs = GREATEST(total_installs - 1, 0) WHERE id = OLD.skill_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_instance_skill_delete
  AFTER DELETE ON instance_skills
  FOR EACH ROW
  EXECUTE FUNCTION decrement_skill_installs();
