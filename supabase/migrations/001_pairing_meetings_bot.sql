-- ============================================================
-- Mentara Migration 001: AI Assignment, Meetings & Bot Support
-- Run in Supabase SQL editor after the base schema.sql
-- ============================================================

-- ============================================================
-- 1. EXTEND MESSAGES TABLE FOR BOT SUPPORT
-- ============================================================

-- Add sender_type column (sender_id is already nullable in base schema)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT NOT NULL DEFAULT 'human'
  CHECK (sender_type IN ('human', 'bot'));

-- Expand content length limit to support longer bot messages
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_check
  CHECK (char_length(content) >= 1 AND char_length(content) <= 3000);

-- Replace the INSERT policy so it only requires sender_id = auth.uid() for human messages.
-- Bot messages are inserted via the send_bot_message SECURITY DEFINER RPC (bypasses RLS).
DROP POLICY IF EXISTS "Authenticated users can send messages" ON messages;
CREATE POLICY "Authenticated users can send messages" ON messages
  FOR INSERT WITH CHECK (
    sender_type = 'human' AND
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
  );

-- Update the last_message trigger to handle bot messages (sender_id = NULL)
-- Bot messages increment BOTH unread counters so both parties see the notification.
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
      WHEN NEW.sender_type = 'bot'                         THEN student_unread + 1
      WHEN NEW.sender_id IS NOT NULL
       AND NEW.sender_id != conv.student_id                THEN student_unread + 1
      ELSE student_unread
    END,
    mentor_unread = CASE
      WHEN NEW.sender_type = 'bot'                         THEN mentor_unread + 1
      WHEN NEW.sender_id IS NOT NULL
       AND NEW.sender_id != conv.mentor_id                 THEN mentor_unread + 1
      ELSE mentor_unread
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. BOT MESSAGE RPC (bypasses RLS via SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION send_bot_message(
  p_conversation_id UUID,
  p_content TEXT
) RETURNS UUID AS $$
DECLARE
  msg_id UUID;
BEGIN
  INSERT INTO messages (conversation_id, sender_id, content, sender_type)
  VALUES (p_conversation_id, NULL, p_content, 'bot')
  RETURNING id INTO msg_id;
  RETURN msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. MENTOR ASSIGNMENTS TABLE (AI auto-assignment)
-- ============================================================

CREATE TABLE IF NOT EXISTS mentor_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mentor_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_field TEXT NOT NULL,
  assigned_by TEXT NOT NULL DEFAULT 'ai' CHECK (assigned_by IN ('ai', 'admin')),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active', 'completed', 'reassignment_requested')),
  assignment_reasoning TEXT, -- Claude's reasoning (stored for admin review)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentor_assignments_student ON mentor_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_mentor  ON mentor_assignments(mentor_id, status);

ALTER TABLE mentor_assignments ENABLE ROW LEVEL SECURITY;

-- Students can view their own assignment
CREATE POLICY "Students view own assignment" ON mentor_assignments
  FOR SELECT USING (auth.uid() = student_id);

-- Mentors can view assignments where they are the mentor
CREATE POLICY "Mentors view their assignments" ON mentor_assignments
  FOR SELECT USING (auth.uid() = mentor_id);

-- Only service role (edge functions) inserts/updates — no client-side INSERT/UPDATE policies

CREATE TRIGGER update_mentor_assignments_updated_at
  BEFORE UPDATE ON mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mentor_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mentor_assignments;
  END IF;
END $$;

-- ============================================================
-- 4. MEETINGS TABLE (tracks scheduled calls)
-- ============================================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  mentor_id  UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'zoom'
           CHECK (platform IN ('zoom', 'google_meet', 'teams', 'facetime', 'other')),
  meeting_link TEXT CHECK (char_length(meeting_link) <= 500),
  scheduled_at TIMESTAMPTZ NOT NULL,
  check_in_sent_at TIMESTAMPTZ,
  occurred BOOLEAN,
  student_notes TEXT CHECK (char_length(student_notes) <= 1000),
  mentor_notes  TEXT CHECK (char_length(mentor_notes) <= 1000),
  is_first_meeting BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_conversation ON meetings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_meetings_checkin
  ON meetings(scheduled_at) WHERE check_in_sent_at IS NULL;

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants manage meetings" ON meetings
  FOR ALL USING (auth.uid() = student_id OR auth.uid() = mentor_id);

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meetings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
  END IF;
END $$;

-- ============================================================
-- 5. POST-MEETING RATINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS post_meeting_ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  rater_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  ratee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  notes TEXT CHECK (char_length(notes) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, rater_id)
);

ALTER TABLE post_meeting_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rater manages own rating" ON post_meeting_ratings
  FOR ALL USING (auth.uid() = rater_id);

-- When a student rates a mentor, update mentor_profiles.rating (running average)
CREATE OR REPLACE FUNCTION update_mentor_rating_from_call()
RETURNS TRIGGER AS $$
DECLARE
  ratee_role TEXT;
BEGIN
  SELECT role INTO ratee_role FROM profiles WHERE id = NEW.ratee_id;
  IF ratee_role = 'mentor' THEN
    UPDATE mentor_profiles
    SET rating = (
      SELECT ROUND(AVG(r.rating)::numeric, 1)
      FROM post_meeting_ratings r
      WHERE r.ratee_id = NEW.ratee_id
    )
    WHERE id = NEW.ratee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_post_meeting_rating_insert
  AFTER INSERT ON post_meeting_ratings
  FOR EACH ROW EXECUTE FUNCTION update_mentor_rating_from_call();
