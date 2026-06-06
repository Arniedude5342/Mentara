CREATE TABLE IF NOT EXISTS reschedule_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce one active reschedule request per meeting at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_one_pending
  ON reschedule_requests(meeting_id)
  WHERE status = 'pending';

ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view reschedule requests"
  ON reschedule_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
    )
  );

CREATE POLICY "Participants can insert reschedule requests"
  ON reschedule_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
    )
  );

CREATE POLICY "Participants can update reschedule requests"
  ON reschedule_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
    )
  );
