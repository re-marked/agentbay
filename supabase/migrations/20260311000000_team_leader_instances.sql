-- Allow multiple instances of the same agent when scoped to different teams.
-- Needed for team leaders: each team gets its own instance of the team-leader agent.

-- Drop the strict (user_id, agent_id) unique constraint
ALTER TABLE agent_instances DROP CONSTRAINT IF EXISTS agent_instances_user_id_agent_id_key;

-- Non-team instances (regular agents, co-founder): still unique per user+agent
CREATE UNIQUE INDEX agent_instances_user_agent_unique
  ON agent_instances (user_id, agent_id)
  WHERE team_id IS NULL;

-- Team instances: unique per user+agent+team (one leader per team)
CREATE UNIQUE INDEX agent_instances_user_agent_team_unique
  ON agent_instances (user_id, agent_id, team_id)
  WHERE team_id IS NOT NULL;
