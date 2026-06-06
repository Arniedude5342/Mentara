-- ============================================================
-- Mentara App - Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT CHECK (char_length(full_name) <= 100),
  avatar_url TEXT,
  role TEXT CHECK (role IN ('student', 'mentor')) NOT NULL DEFAULT 'student',
  bio TEXT CHECK (char_length(bio) <= 500),
  location TEXT CHECK (char_length(location) <= 100),
  website TEXT CHECK (char_length(website) <= 200),
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  grade_level TEXT,  -- 'high_school', 'undergrad', 'graduate', 'professional'
  fields_of_interest TEXT[],
  learning_goals TEXT,
  availability TEXT[],  -- ['weekdays', 'weekends', 'mornings', 'evenings']
  preferred_communication TEXT[],  -- ['chat', 'video', 'voice']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mentor profiles
CREATE TABLE IF NOT EXISTS mentor_profiles (
  id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  title TEXT CHECK (char_length(title) <= 150),
  institution TEXT CHECK (char_length(institution) <= 200),
  fields_of_expertise TEXT[],
  years_experience INTEGER DEFAULT 0,
  availability TEXT[],
  hourly_rate DECIMAL DEFAULT 0,
  is_free BOOLEAN DEFAULT true,
  rating DECIMAL DEFAULT NULL,
  review_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  linkedin_url TEXT,
  preferred_student_levels TEXT[],  -- grade levels they prefer to mentor
  mentoring_style TEXT CHECK (char_length(mentoring_style) <= 1000),
  languages TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  student_unread INTEGER DEFAULT 0,
  mentor_unread INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, mentor_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 3000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, mentor_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  -- Prevent client-side role self-elevation: the role column must match the
  -- role already stored for this user (only a service-role migration can change it).
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Student profiles
CREATE POLICY "Student profiles viewable by everyone" ON student_profiles FOR SELECT USING (true);
CREATE POLICY "Students can manage their own profile" ON student_profiles FOR ALL USING (auth.uid() = id);

-- Mentor profiles
CREATE POLICY "Mentor profiles viewable by everyone" ON mentor_profiles FOR SELECT USING (true);
CREATE POLICY "Mentors can manage their own profile" ON mentor_profiles FOR ALL USING (auth.uid() = id);

-- Conversations
CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT USING (auth.uid() = student_id OR auth.uid() = mentor_id);
CREATE POLICY "Users can create conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = student_id OR auth.uid() = mentor_id);
CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE USING (auth.uid() = student_id OR auth.uid() = mentor_id);

-- Messages
CREATE POLICY "Users can view messages in their conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
  );
CREATE POLICY "Authenticated users can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
  );

-- Reviews
CREATE POLICY "Reviews are viewable by everyone" ON reviews FOR SELECT USING (true);
CREATE POLICY "Students can write reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update their reviews" ON reviews FOR UPDATE USING (auth.uid() = student_id);
CREATE POLICY "Students can delete their own reviews" ON reviews
  FOR DELETE USING (auth.uid() = student_id);

-- ============================================================
-- RATE LIMITING
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_time ON rate_limit_log(key, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Block all direct client access; all writes go through the SECURITY DEFINER function
CREATE POLICY "No direct access to rate_limit_log"
  ON rate_limit_log FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_minutes INTEGER DEFAULT 15
) RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO attempt_count
  FROM rate_limit_log
  WHERE key = p_key
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  IF attempt_count >= p_max_attempts THEN
    RETURN FALSE;
  END IF;
  INSERT INTO rate_limit_log(key) VALUES (p_key);
  -- Probabilistic prune: clean ALL expired rows 1% of the time instead of
  -- running a DELETE on every call, which adds write load under high traffic.
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour';
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'picture',
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_student_profiles_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_mentor_profiles_updated_at BEFORE UPDATE ON mentor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update mentor rating when review is added, updated, or deleted
CREATE OR REPLACE FUNCTION update_mentor_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_mentor_id UUID;
BEGIN
  -- On DELETE, NEW is NULL — use OLD instead
  target_mentor_id := COALESCE(NEW.mentor_id, OLD.mentor_id);
  UPDATE mentor_profiles
  SET
    rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE mentor_id = target_mentor_id),
    review_count = (SELECT COUNT(*) FROM reviews WHERE mentor_id = target_mentor_id)
  WHERE id = target_mentor_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_review_upsert
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_mentor_rating();

-- Update conversation last_message and increment unread counter for the recipient
-- Bot messages (sender_type = 'bot', sender_id = NULL) increment both counters.
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
DECLARE
  conv RECORD;
BEGIN
  SELECT student_id, mentor_id INTO conv FROM conversations WHERE id = NEW.conversation_id;
  UPDATE conversations
  SET
    last_message = NEW.content,
    last_message_at = NEW.created_at,
    student_unread = CASE
      WHEN NEW.sender_type = 'bot'                           THEN student_unread + 1
      WHEN NEW.sender_id IS NOT NULL
       AND NEW.sender_id != conv.student_id                  THEN student_unread + 1
      ELSE student_unread
    END,
    mentor_unread = CASE
      WHEN NEW.sender_type = 'bot'                           THEN mentor_unread + 1
      WHEN NEW.sender_id IS NOT NULL
       AND NEW.sender_id != conv.mentor_id                   THEN mentor_unread + 1
      ELSE mentor_unread
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_message_sent
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_fields_gin ON mentor_profiles USING GIN(fields_of_expertise);
CREATE INDEX IF NOT EXISTS idx_conversations_student_id ON conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_conversations_mentor_id ON conversations(mentor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_mentor_id ON reviews(mentor_id);

-- Scalability indexes — added for 1k+ user traffic
-- Composite covers the common "load chat" query: filter by conversation AND sort by time
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
-- Inbox list is always ordered newest-first by last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg_at ON conversations(last_message_at DESC);
-- auto-assign-mentor Edge Function ranks and filters mentor candidates by these columns
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_rating ON mentor_profiles(rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_is_free ON mentor_profiles(is_free);
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_verified ON mentor_profiles(verified);
-- Role filter (e.g. "where role = 'mentor'") used in several queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================
-- REALTIME
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

-- ============================================================
-- STORAGE
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Avatars are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- MEETINGS, RATINGS & ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('zoom', 'google_meet', 'teams', 'facetime', 'other')),
  meeting_link TEXT CHECK (
    meeting_link IS NULL OR (
      char_length(meeting_link) <= 500 AND
      (meeting_link LIKE 'https://%' OR meeting_link LIKE 'http://%')
    )
  ),
  scheduled_at TIMESTAMPTZ NOT NULL,
  is_first_meeting BOOLEAN DEFAULT false,
  occurred BOOLEAN DEFAULT false,
  student_notes TEXT CHECK (student_notes IS NULL OR char_length(student_notes) <= 2000),
  mentor_notes TEXT CHECK (mentor_notes IS NULL OR char_length(mentor_notes) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_meeting_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  rater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ratee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, rater_id)
);

CREATE TABLE IF NOT EXISTS reschedule_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_one_pending
  ON reschedule_requests(meeting_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS mentor_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'reassignment_requested')),
  assigned_field TEXT,
  assigned_by TEXT DEFAULT 'ai',
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  assignment_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_mentor_assignments_updated_at
  BEFORE UPDATE ON mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS — meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their meetings"
  ON meetings FOR SELECT
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

CREATE POLICY "Participants can insert meetings"
  ON meetings FOR INSERT
  WITH CHECK (auth.uid() = student_id OR auth.uid() = mentor_id);

CREATE POLICY "Participants can update their meetings"
  ON meetings FOR UPDATE
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

-- RLS — post_meeting_ratings
ALTER TABLE post_meeting_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view ratings for their meetings"
  ON post_meeting_ratings FOR SELECT
  USING (auth.uid() = rater_id OR auth.uid() = ratee_id);

CREATE POLICY "Rater must be a meeting participant and cannot self-rate"
  ON post_meeting_ratings FOR INSERT
  WITH CHECK (
    auth.uid() = rater_id
    AND rater_id != ratee_id
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
    )
  );

-- RLS — mentor_assignments
ALTER TABLE mentor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their assignments"
  ON mentor_assignments FOR SELECT
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

-- NOTE: No INSERT policy on mentor_assignments.
-- Assignments are created exclusively by the `auto-assign-mentor` Edge
-- Function (which uses the service role key and bypasses RLS). Allowing
-- authenticated users to INSERT directly would let any student/mentor
-- forge an assignment with anyone — even the prior WITH CHECK (auth.uid()
-- = student_id OR auth.uid() = mentor_id) policy let a student create a
-- fake assignment to any mentor without going through the matching logic.

CREATE POLICY "Students can update their own assignments"
  ON mentor_assignments FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (
    auth.uid() = student_id
    AND status = 'reassignment_requested'
  );

-- Meetings indexes (defined here because meetings table is created after the main INDEXES block)
CREATE INDEX IF NOT EXISTS idx_meetings_student_id ON meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_meetings_mentor_id ON meetings(mentor_id);
-- "Upcoming meetings" queries filter scheduled_at > now(); this index makes that O(log n)
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);

-- ============================================================
-- PUSH NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
