-- Existing mentor accounts pre-date the verification system and have no LinkedIn URL.
-- Grandfather all of them as verified so they don't get stuck in 'pending'.
UPDATE mentor_profiles
  SET verified = true, verification_status = 'verified'
  WHERE verification_status = 'pending';
