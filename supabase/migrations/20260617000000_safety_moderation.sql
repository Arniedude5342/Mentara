-- Safety & moderation hardening for App Store Guideline 1.2 + minor protection.
-- 1. In-app reports (logged, actionable)
-- 2. Blocking actually prevents messaging (RLS)
-- 3. Parental-consent + age tracking for minors

-- ============================================================
-- 1. REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Reporters can file and see their own reports; review/triage happens via the
-- service role (edge function / admin), which bypasses RLS.
CREATE POLICY "Users can file reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id AND reporter_id <> reported_user_id);

CREATE POLICY "Users can view their own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id);

-- ============================================================
-- 2. BLOCKING PREVENTS MESSAGING
-- A blocked pair can no longer exchange messages (either direction).
-- Bot messages are inserted via SECURITY DEFINER and are unaffected.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can send messages" ON messages;
CREATE POLICY "Authenticated users can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.student_id = auth.uid() OR c.mentor_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM conversations c
      JOIN blocked_users b
        ON (b.blocker_id = c.student_id AND b.blocked_id = c.mentor_id)
        OR (b.blocker_id = c.mentor_id AND b.blocked_id = c.student_id)
      WHERE c.id = conversation_id
    )
  );

-- ============================================================
-- 3. AGE / PARENTAL CONSENT
-- birth_year is optional; guardian_consent_at is set when a 13–17 user
-- acknowledges they have parent/guardian permission during onboarding.
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_year INT,
  ADD COLUMN IF NOT EXISTS guardian_consent_at TIMESTAMPTZ;
