-- ============================================================
-- Security hardening - 2026-06-27
--   D (HIGH): move PII (email) out of the publicly-readable `profiles`
--             table into an owner-only `private_profiles` table.
--   B (LOW) : cap the legacy `reviews.comment` length.
-- ============================================================

-- ─── D: private_profiles (owner-only email) ───────────────────
-- `profiles` is readable by everyone (FOR SELECT USING (true)) so the directory,
-- referrals, and chat headers work. Email is PII and must not live there, so it
-- moves to a table only the owner can read. Edge functions read email from
-- auth.users via the service role, so nothing server-side depends on this table.

CREATE TABLE IF NOT EXISTS private_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE private_profiles ENABLE ROW LEVEL SECURITY;

-- Owner-only: a user can only ever see or change their own private row.
DROP POLICY IF EXISTS "Users manage own private profile" ON private_profiles;
CREATE POLICY "Users manage own private profile"
  ON private_profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Backfill existing emails before the column is dropped.
INSERT INTO private_profiles (id, email)
SELECT id, email FROM profiles
ON CONFLICT (id) DO NOTHING;

-- Recreate the new-user trigger so it splits PII out of the public row.
-- SECURITY DEFINER means it bypasses RLS for both inserts.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'picture',
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO private_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Keep private_profiles.email in sync if a user changes their email later.
CREATE OR REPLACE FUNCTION sync_private_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO private_profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_private_email();

-- Finally remove the leaking column from the public table.
ALTER TABLE profiles DROP COLUMN IF EXISTS email;

-- ─── B: cap legacy reviews.comment ────────────────────────────
ALTER TABLE reviews
  DROP CONSTRAINT IF EXISTS reviews_comment_len;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_comment_len
  CHECK (comment IS NULL OR char_length(comment) <= 1000);
