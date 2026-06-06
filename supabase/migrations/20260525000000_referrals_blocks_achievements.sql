-- ============================================================
-- Migration: referrals, blocked users, achievement badges
-- ============================================================

-- 1. Add referral_code to profiles (unique 8-char code, auto-generated)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS achievements  TEXT[] DEFAULT '{}';

-- Back-fill existing rows with a referral code
UPDATE profiles
SET referral_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Make non-nullable now that all rows are filled
ALTER TABLE profiles ALTER COLUMN referral_code SET NOT NULL;

-- Index for fast code lookups (used when a new user redeems a code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

-- 2. Generate referral_code automatically on new profile insert
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_profile_insert_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

-- 3. Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks"
  ON blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
  ON blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND blocker_id != blocked_id);

CREATE POLICY "Users can unblock"
  ON blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);

-- 4. unlock_achievement — idempotent array append (no duplicates)
CREATE OR REPLACE FUNCTION unlock_achievement(p_user_id UUID, p_achievement TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET achievements = array_append(achievements, p_achievement)
  WHERE id = p_user_id
    AND NOT (achievements @> ARRAY[p_achievement]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
