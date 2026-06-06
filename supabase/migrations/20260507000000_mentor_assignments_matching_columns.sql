-- Add columns required by the auto-assign-mentor edge function and Discover UI.
-- The base mentor_assignments table was created without these fields.

ALTER TABLE mentor_assignments
  ADD COLUMN IF NOT EXISTS assigned_field TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by TEXT DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_reasoning TEXT;
