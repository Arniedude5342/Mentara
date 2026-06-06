-- ============================================================
-- Mentara Migration: Reliability, Idempotency, Data Integrity
-- 2026-05-27
-- ============================================================

-- ============================================================
-- 1. ATOMIC get_or_create_conversation RPC
--    Fixes TOCTOU race: replaces SELECT-then-INSERT with a
--    single atomic upsert that always returns the row.
--    ON CONFLICT DO UPDATE with a no-op forces RETURNING to
--    yield the existing row (PG 15+ DO NOTHING returns nothing).
-- ============================================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_student_id UUID,
  p_mentor_id  UUID
) RETURNS conversations AS $$
DECLARE
  result conversations;
BEGIN
  INSERT INTO conversations (student_id, mentor_id)
  VALUES (p_student_id, p_mentor_id)
  ON CONFLICT (student_id, mentor_id) DO UPDATE
    SET last_message_at = conversations.last_message_at
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. IDEMPOTENCY KEY: meetings
--    Client generates UUID before first submit and reuses it
--    on retries. Partial unique index: only enforced when the
--    key is non-null, so existing rows without a key are safe.
-- ============================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_idempotency_key
  ON meetings (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

-- ============================================================
-- 3. IDEMPOTENCY KEY: student_goals
--    Same pattern as meetings.
-- ============================================================

ALTER TABLE student_goals
  ADD COLUMN IF NOT EXISTS client_idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_goals_idempotency_key
  ON student_goals (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

-- ============================================================
-- 4. invite_sent_at: deduplicate send-meeting-invite
--    Edge function claims this column (UPDATE ... WHERE IS NULL)
--    before calling Resend. Concurrent retries see non-null and
--    skip the send.
-- ============================================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

-- ============================================================
-- 5. notification_sent_at: deduplicate notify-new-message
--    Edge function claims this column before sending push.
--    Concurrent retries see non-null and skip the push.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;

-- ============================================================
-- 6. INCREMENTAL RATING TRIGGER
--    Replaces two full-scan aggregations (AVG + COUNT) with
--    O(1) incremental counter updates using rating_sum and
--    review_count_actual. At 10K reviews this saves ~2 full
--    table scans per review write.
-- ============================================================

ALTER TABLE mentor_profiles
  ADD COLUMN IF NOT EXISTS rating_sum          NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count_actual INTEGER  DEFAULT 0;

-- Backfill counters from existing data (one-time scan, safe to run live)
UPDATE mentor_profiles mp
SET
  rating_sum          = COALESCE((SELECT SUM(r.rating)  FROM reviews r WHERE r.mentor_id = mp.id), 0),
  review_count_actual = COALESCE((SELECT COUNT(*)        FROM reviews r WHERE r.mentor_id = mp.id), 0);

CREATE OR REPLACE FUNCTION update_mentor_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_mentor_id UUID;
BEGIN
  target_mentor_id := COALESCE(NEW.mentor_id, OLD.mentor_id);

  IF TG_OP = 'INSERT' THEN
    UPDATE mentor_profiles
    SET
      rating_sum          = rating_sum + NEW.rating,
      review_count_actual = review_count_actual + 1,
      review_count        = review_count_actual + 1,
      rating              = ROUND((rating_sum + NEW.rating) / (review_count_actual + 1), 1)
    WHERE id = target_mentor_id;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE mentor_profiles
    SET
      rating_sum = rating_sum - OLD.rating + NEW.rating,
      rating     = CASE
                     WHEN review_count_actual > 0
                     THEN ROUND((rating_sum - OLD.rating + NEW.rating) / review_count_actual, 1)
                     ELSE NULL
                   END
    WHERE id = target_mentor_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE mentor_profiles
    SET
      rating_sum          = GREATEST(rating_sum - OLD.rating, 0),
      review_count_actual = GREATEST(review_count_actual - 1, 0),
      review_count        = GREATEST(review_count_actual - 1, 0),
      rating              = CASE
                              WHEN (review_count_actual - 1) > 0
                              THEN ROUND((rating_sum - OLD.rating) / (review_count_actual - 1), 1)
                              ELSE NULL
                            END
    WHERE id = target_mentor_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate the trigger to pick up the new function body
DROP TRIGGER IF EXISTS on_review_upsert ON reviews;
CREATE TRIGGER on_review_upsert
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_mentor_rating();

-- ============================================================
-- 7. MISSING INDEXES
--    Three indexes confirmed absent from schema analysis.
--    Each resolves a full-table-scan hotspot under 10K user load.
-- ============================================================

-- messages.sender_id: used by update_conversation_last_message
-- trigger and RLS policy checks on every message insert.
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON messages(sender_id);

-- rate_limit_log(created_at): the probabilistic 1% cleanup does:
--   DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour'
-- The existing composite index (key, created_at) cannot satisfy
-- this query without the key prefix — a standalone index is needed.
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_created_at
  ON rate_limit_log(created_at);

-- mentor_assignments(student_id, status): auto-assign-mentor checks
--   .eq('student_id', studentId).eq('status', 'active')
-- The existing idx_mentor_assignments_mentor covers (mentor_id, status)
-- only; student-side lookups do full scans without this index.
CREATE INDEX IF NOT EXISTS idx_mentor_assignments_student_status
  ON mentor_assignments(student_id, status);
