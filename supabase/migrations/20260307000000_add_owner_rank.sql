-- Add 'owner' rank for human users in workspace projects.
-- The CEO of a corporation maps to rank=owner.
-- Before: 'master' | 'leader' | 'worker' | 'subagent'
-- After:  'owner' | 'master' | 'leader' | 'worker' | 'subagent'

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_rank_check;
ALTER TABLE public.members ADD CONSTRAINT members_rank_check
  CHECK (rank IN ('owner', 'master', 'leader', 'worker', 'subagent'));

COMMENT ON COLUMN public.members.rank
  IS 'owner = CEO (human), master = co-founder (Personal AI), leader | worker | subagent';
