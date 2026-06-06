-- Migration: Scalability indexes + rate limit prune fix
-- Apply this in Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run)

-- ============================================================
-- INDEXES
-- ============================================================

-- Composite: covers the common chat load query (filter by conversation + sort by time)
-- The existing idx_messages_conversation_id only helps the WHERE clause;
-- adding created_at DESC here lets Postgres skip the sort entirely.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- Inbox list is always sorted newest-first by last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg_at
  ON conversations(last_message_at DESC);

-- auto-assign-mentor Edge Function ranks mentor candidates by rating, is_free, verified
CREATE INDEX IF NOT EXISTS idx_mentor_profiles_rating
  ON mentor_profiles(rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_mentor_profiles_is_free
  ON mentor_profiles(is_free);

CREATE INDEX IF NOT EXISTS idx_mentor_profiles_verified
  ON mentor_profiles(verified);

-- Role filter (e.g. "WHERE role = 'mentor'") used in several queries
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON profiles(role);

-- Meetings indexes
CREATE INDEX IF NOT EXISTS idx_meetings_student_id ON meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_meetings_mentor_id   ON meetings(mentor_id);
-- "Upcoming meetings" queries filter scheduled_at > now()
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);

-- ============================================================
-- RATE LIMIT PRUNE FIX
-- ============================================================
-- The old check_rate_limit() ran a DELETE on EVERY successful call.
-- At 1k users sending messages this means thousands of per-call DELETEs/hour.
-- New version: prune all expired rows 1% of the time (probabilistic cleanup).

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

  -- Probabilistic prune: 1% of calls clean ALL expired rows at once.
  -- This is ~100x less write load than the previous per-call DELETE.
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
