-- Add verification_status to mentor_profiles to track admin review state.
-- New mentors start as 'pending' and must be approved before being matched.
ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified', 'rejected'));

-- Grandfather all existing mentor accounts as verified — they pre-date the verification system.
UPDATE mentor_profiles SET verified = true, verification_status = 'verified';
