-- Add invite_status to track mentor acceptance of scheduled meetings
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (invite_status IN ('pending', 'confirmed', 'declined'));
