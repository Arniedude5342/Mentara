-- Add max_students capacity preference to mentor_profiles
-- NULL means not yet answered (shows prompt card on home page until set)
ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT NULL
    CHECK (max_students >= 1 AND max_students <= 3);

-- Add signup_source to profiles so the app can serve a tailored onboarding
-- for mentors who registered via the founding-mentor web form
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_source TEXT DEFAULT 'app'
    CHECK (signup_source IN ('app', 'web'));

-- Update handle_new_user to persist signup_source from auth metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url, role, signup_source)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'picture',
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'signup_source', 'app')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO private_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
