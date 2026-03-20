-- Add 'working' to members.status CHECK constraint.
-- Needed by the Router's TRACK pipeline step to show agents as
-- actively processing in the UI.
--
-- Before: 'active' | 'idle' | 'offline' | 'archived'
-- After:  'active' | 'idle' | 'working' | 'offline' | 'archived'

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE public.members ADD CONSTRAINT members_status_check
  CHECK (status IN ('active', 'idle', 'working', 'offline', 'archived'));

COMMENT ON COLUMN public.members.status
  IS 'active | idle | working | offline | archived — working means agent is processing a message';
