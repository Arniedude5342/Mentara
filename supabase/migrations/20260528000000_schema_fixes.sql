-- Migration: schema_fixes
-- Fixes critical schema gaps discovered by automated audit:
-- 1. post_meeting_ratings.rating NOT NULL → allow NULL (star rating removed from UI)
-- 2. mentor_profiles.is_available column (required by matching algorithm)
-- 3. messages.sender_type column + send_bot_message RPC
-- 4. reschedule_requests RLS policies (feature was completely broken)
-- 5. meetings missing columns: check_in_sent_at, invite_status, client_idempotency_key
-- 6. post_meeting_ratings missing columns: had_problems, problem_details
-- 7. meetings.meeting_link: drop http:// acceptance (https-only)
-- 8. DELETE policies for meetings and post_meeting_ratings
-- 9. Tighter mentor_assignments UPDATE policy (require status = 'active' before update)
-- 10. get_or_create_conversation RPC (idempotent, atomic)


-- ─── 1. post_meeting_ratings.rating — make nullable ──────────────────────────
-- Star rating was removed from the UI; submissions must still succeed.
ALTER TABLE post_meeting_ratings
  ALTER COLUMN rating DROP NOT NULL;

ALTER TABLE post_meeting_ratings
  DROP CONSTRAINT IF EXISTS post_meeting_ratings_rating_check;

ALTER TABLE post_meeting_ratings
  ADD CONSTRAINT post_meeting_ratings_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));


-- ─── 2. mentor_profiles.is_available ────────────────────────────────────────
-- Required by auto-assign-mentor (.eq('is_available', true)) and requestNewMentor.
ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- Existing verified mentors without an active assignment should be available.
UPDATE mentor_profiles mp
  SET is_available = true
  WHERE verified = true
    AND NOT EXISTS (
      SELECT 1 FROM mentor_assignments ma
      WHERE ma.mentor_id = mp.id
        AND ma.status = 'active'
    );

-- Mentors with an active assignment are not available for new matching.
UPDATE mentor_profiles mp
  SET is_available = false
  WHERE EXISTS (
    SELECT 1 FROM mentor_assignments ma
    WHERE ma.mentor_id = mp.id
      AND ma.status = 'active'
  );


-- ─── 3. messages.sender_type + send_bot_message RPC ─────────────────────────
-- sender_type is referenced by the update_conversation_last_message trigger.
-- Without it, every message insert throws "column sender_type does not exist".
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT NOT NULL DEFAULT 'human'
  CHECK (sender_type IN ('human', 'bot'));

-- Back-fill: all existing rows are human messages.
UPDATE messages SET sender_type = 'human' WHERE sender_type IS NULL;

-- send_bot_message: inserts a bot message without requiring an authenticated sender.
-- SECURITY DEFINER so it bypasses the "sender_id must equal auth.uid()" INSERT policy.
CREATE OR REPLACE FUNCTION send_bot_message(
  p_conversation_id UUID,
  p_content TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'Bot message content cannot be empty';
  END IF;
  INSERT INTO messages (conversation_id, sender_id, sender_type, content)
  VALUES (p_conversation_id, NULL, 'bot', trim(p_content))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 4. reschedule_requests RLS ──────────────────────────────────────────────
-- No policies existed — all queries returned 0 rows silently.
ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can manage reschedule requests" ON reschedule_requests;

CREATE POLICY "Participants can manage reschedule requests"
  ON reschedule_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
    )
  );


-- ─── 5. meetings missing columns ─────────────────────────────────────────────
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS check_in_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_status TEXT DEFAULT 'pending'
    CHECK (invite_status IN ('pending', 'confirmed', 'declined')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- client_idempotency_key was added in migration 20260527000000 as UUID.
-- Keep the same type here so a fresh DB ends up with a UUID column too,
-- matching the canonical schema and the partial unique index defined below.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_idempotency_key
  ON meetings (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;


-- ─── 6. post_meeting_ratings missing columns ─────────────────────────────────
ALTER TABLE post_meeting_ratings
  ADD COLUMN IF NOT EXISTS had_problems BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS problem_details TEXT
    CHECK (problem_details IS NULL OR char_length(problem_details) <= 1000);


-- ─── 7. meetings.meeting_link — https-only ───────────────────────────────────
ALTER TABLE meetings
  DROP CONSTRAINT IF EXISTS meetings_meeting_link_check;

ALTER TABLE meetings
  ADD CONSTRAINT meetings_meeting_link_check CHECK (
    meeting_link IS NULL OR (
      char_length(meeting_link) <= 500
      AND meeting_link LIKE 'https://%'
    )
  );


-- ─── 8. DELETE policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can delete their meetings" ON meetings;

CREATE POLICY "Participants can delete their meetings"
  ON meetings FOR DELETE
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Rater can delete their own rating" ON post_meeting_ratings;

CREATE POLICY "Rater can delete their own rating"
  ON post_meeting_ratings FOR DELETE
  USING (auth.uid() = rater_id);


-- ─── 9. mentor_assignments UPDATE — require active status before update ───────
DROP POLICY IF EXISTS "Students can update their own assignments" ON mentor_assignments;

CREATE POLICY "Students can request reassignment"
  ON mentor_assignments FOR UPDATE
  USING (auth.uid() = student_id AND status = 'active')
  WITH CHECK (
    auth.uid() = student_id
    AND status = 'reassignment_requested'
  );


-- ─── 10. get_or_create_conversation RPC ──────────────────────────────────────
-- Atomic upsert — safe under concurrent calls.
-- Already deployed in 20260527000000 (returning the `conversations` row type).
-- We DROP first because Postgres rejects CREATE OR REPLACE when the return
-- type differs (the earlier migration returned `conversations`, this one
-- returns a TABLE shape) — without DROP this migration would fail with
-- "cannot change return type of existing function".
DROP FUNCTION IF EXISTS public.get_or_create_conversation(UUID, UUID);

CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_student_id UUID,
  p_mentor_id UUID
) RETURNS TABLE (id UUID, student_id UUID, mentor_id UUID, last_message_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
    INSERT INTO conversations (student_id, mentor_id)
    VALUES (p_student_id, p_mentor_id)
    ON CONFLICT (student_id, mentor_id)
      DO UPDATE SET last_message_at = conversations.last_message_at
    RETURNING conversations.id, conversations.student_id, conversations.mentor_id, conversations.last_message_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
