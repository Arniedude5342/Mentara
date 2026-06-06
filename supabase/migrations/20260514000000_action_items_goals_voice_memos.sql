-- ============================================================
-- Mentara Migration: Action Items, Student Goals, Voice Memos
-- Run in Supabase SQL editor after migration 001_pairing_meetings_bot.sql
-- ============================================================

-- ============================================================
-- 1. ACTION ITEMS TABLE
-- Both student and mentor in a conversation can add/view items.
-- ============================================================

CREATE TABLE IF NOT EXISTS action_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 500),
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_conversation ON action_items(conversation_id);
CREATE INDEX IF NOT EXISTS idx_action_items_creator ON action_items(created_by);

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- Both participants of the conversation can select all items
CREATE POLICY "Conversation participants view action items" ON action_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
  );

-- Both participants can insert
CREATE POLICY "Conversation participants add action items" ON action_items
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
  );

-- Only the creator can update (toggle complete)
CREATE POLICY "Creator updates own action items" ON action_items
  FOR UPDATE USING (auth.uid() = created_by);

-- Only the creator can delete
CREATE POLICY "Creator deletes own action items" ON action_items
  FOR DELETE USING (auth.uid() = created_by);

CREATE TRIGGER update_action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to realtime so both parties see updates live
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_items;
  END IF;
END $$;

-- ============================================================
-- 2. STUDENT GOALS TABLE
-- Students set 1-5 goals visible on their home screen.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 500),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_goals_student ON student_goals(student_id, status);

ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own goals" ON student_goals
  FOR ALL USING (auth.uid() = student_id);

-- Mentors can view their student's goals (for conversation context)
CREATE POLICY "Mentors view assigned student goals" ON student_goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM mentor_assignments ma
      WHERE ma.student_id = student_goals.student_id
      AND ma.mentor_id = auth.uid()
      AND ma.status = 'active'
    )
  );

CREATE TRIGGER update_student_goals_updated_at
  BEFORE UPDATE ON student_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. VOICE MEMOS TABLE
-- One memo per meeting; student records a 60-second reflection.
-- AI processes it into a transcript, insight, and action item.
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_memos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  audio_url TEXT NOT NULL,          -- Supabase Storage path: voice-memos/{student_id}/{meeting_id}.m4a
  transcript TEXT,                   -- Gemini transcription
  ai_insight TEXT,                   -- key_insight extracted by AI (1 sentence)
  ai_action_item TEXT,               -- action_item extracted by AI (1 specific step)
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id)                 -- one reflection per meeting
);

CREATE INDEX IF NOT EXISTS idx_voice_memos_student ON voice_memos(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_memos_conversation ON voice_memos(conversation_id);

ALTER TABLE voice_memos ENABLE ROW LEVEL SECURITY;

-- Student can manage own memos
CREATE POLICY "Students manage own voice memos" ON voice_memos
  FOR ALL USING (auth.uid() = student_id);

-- Mentor can view voice memos in their shared conversation
CREATE POLICY "Mentors view shared voice memos" ON voice_memos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = voice_memos.conversation_id
      AND c.mentor_id = auth.uid()
    )
  );

CREATE TRIGGER update_voice_memos_updated_at
  BEFORE UPDATE ON voice_memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to realtime so VoiceMemoCard can poll for processing_status changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'voice_memos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE voice_memos;
  END IF;
END $$;

-- ============================================================
-- 4. FIX post_meeting_ratings SCHEMA MISMATCH
-- The PostMeetingRatingCard component inserts had_problems +
-- problem_details but these columns don't exist in the schema.
-- ============================================================

ALTER TABLE post_meeting_ratings
  ADD COLUMN IF NOT EXISTS had_problems BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS problem_details TEXT CHECK (char_length(problem_details) <= 1000);

-- rating column has NOT NULL constraint but card inserts NULL — relax it
ALTER TABLE post_meeting_ratings ALTER COLUMN rating DROP NOT NULL;
